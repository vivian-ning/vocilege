// src/state/store.js
//
// 全域 store（第九節）。
//
// 重要設計：
//   - messages 不放在全域 state 中。全域 state 只含 characters / conversations /
//     player / settings / apiSettings 等；「目前對話的 messages」由 store 另行持有
//     （this.messages），並在 selectCharacter 時按需從 IndexedDB 載入。
//   - 訂閱制：UI 在 app.js 註冊一個 render callback；任何 action 完成後由 store
//     統一 notify，禁止各元件自行決定何時重新渲染。
//
// 狀態指標不變式（第三節）：
//   currentCharacterId 與 currentConversationId 必須互相一致。切換角色一律透過唯一
//   的 action selectCharacter(characterId)，由它同時更新兩個指標。其他地方禁止單獨
//   修改其中一個指標。

import {
  loadState,
  saveState,
  getMessagesByConversation,
  getAllMessages,
  addMessage,
  updateMessage,
  deleteMessagesByConversation
} from '../db/indexeddb.js';
import { createDefaultState, normalizeState } from './schema.js';
import { migrateState } from './migrations.js';
import { buildPrompt } from '../services/promptBuilder.js';
import { generateReply, generateUtilityText, parseReplyToParts, usesMock } from '../services/aiService.js';
import { deleteAvatarAsset, deleteStoredAsset } from '../services/assetService.js';
import { invalidateStats } from '../services/statsService.js';
import { generateId } from '../utils/id.js';
import { now } from '../utils/time.js';

// avatar 輸入正規化：接受字串（emoji）、{type:'emoji',value} 或 {type:'image',assetId}。
function normalizeAvatarInput(input, fallback) {
  if (input && typeof input === 'object') {
    if (input.type === 'image' && input.assetId) {
      return { type: 'image', assetId: input.assetId };
    }
    if (input.value) return { type: 'emoji', value: String(input.value) };
  }
  if (typeof input === 'string' && input.trim()) {
    return { type: 'emoji', value: input.trim() };
  }
  return fallback || { type: 'emoji', value: '🙂' };
}

// 若舊頭貼是 image 且被新頭貼取代（換圖或改回 emoji），刪除舊 asset 避免孤兒 blob。
async function cleanupReplacedAvatar(oldAvatar, newAvatar) {
  if (!oldAvatar || oldAvatar.type !== 'image' || !oldAvatar.assetId) return;
  if (newAvatar && newAvatar.type === 'image' && newAvatar.assetId === oldAvatar.assetId) return;
  await deleteAvatarAsset(oldAvatar.assetId);
}

let state = null;
let messages = [];        // 目前對話的訊息（按需載入）
let typing = false;       // 「輸入中」狀態旗標
let pendingError = null;  // 最近一次產生回覆的錯誤（供錯誤條 + 重試使用）
let config = null;
const listeners = new Set();

// ---- 基本存取 ----

export function getState() {
  return state;
}

export function setState(nextState) {
  state = nextState;
}

export function updateState(updater) {
  state = updater(state);
  return state;
}

export function getCurrentMessages() {
  return messages;
}

export function isTyping() {
  return typing;
}

// 最近一次 API 失敗資訊（{ message, userText, conversationId }）或 null。
// 只在「目前對話」上顯示；切換角色會清除。
export function getPendingError() {
  if (!pendingError) return null;
  if (pendingError.conversationId !== state.currentConversationId) return null;
  return pendingError;
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  for (const listener of listeners) {
    listener(state);
  }
}

export async function saveCurrentState() {
  // db.saveState 內部依 rememberApiKey 決定是否清空 apiKey，不污染記憶體 state。
  await saveState(state);
}

// ---- 初始化 ----

export async function initStore(appConfig) {
  config = appConfig;
  const loaded = await loadState();

  if (loaded == null) {
    // 第一次啟動：用 config 建 default state 並保存。
    state = createDefaultState(config);
    await saveCurrentState();
  } else {
    // 既有 state：先版本升級，再補齊欄位。
    state = normalizeState(migrateState(loaded));
    // 升級 / 補欄位後若有變動，寫回一次。
    await saveCurrentState();
  }

  // 載入目前對話的訊息（若指標有效）。
  await reloadCurrentMessages();

  notify();
  return state;
}

async function reloadCurrentMessages() {
  if (state.currentConversationId) {
    messages = normalizeMessageList(await getMessagesByConversation(state.currentConversationId));
  } else {
    messages = [];
  }
}

// ---- helpers ----

function findConversationByCharacter(characterId) {
  return state.conversations.find(
    (c) => c.type === 'direct' && c.primaryCharacterId === characterId
  );
}

function getActiveCharacter() {
  return state.characters.find((c) => c.id === state.currentCharacterId) || null;
}

function getActiveConversation() {
  return state.conversations.find((c) => c.id === state.currentConversationId) || null;
}

function activeParts(message) {
  if (!message || !Array.isArray(message.versions) || message.versions.length === 0) {
    return Array.isArray(message && message.parts) ? message.parts : [];
  }
  const idx = Math.min(
    message.versions.length - 1,
    Math.max(0, Number(message.activeVersion) || 0)
  );
  const version = message.versions[idx];
  return Array.isArray(version && version.parts) ? version.parts : (message.parts || []);
}

function activeUsage(message) {
  if (!message || !Array.isArray(message.versions) || message.versions.length === 0) {
    return message && message.usage ? message.usage : null;
  }
  const idx = Math.min(
    message.versions.length - 1,
    Math.max(0, Number(message.activeVersion) || 0)
  );
  return message.versions[idx] && message.versions[idx].usage ? message.versions[idx].usage : null;
}

function activeThinking(message) {
  if (!message || !Array.isArray(message.versions) || message.versions.length === 0) {
    return message && typeof message.thinking === 'string' ? message.thinking : '';
  }
  const idx = Math.min(
    message.versions.length - 1,
    Math.max(0, Number(message.activeVersion) || 0)
  );
  return message.versions[idx] && typeof message.versions[idx].thinking === 'string'
    ? message.versions[idx].thinking
    : '';
}

function normalizeMessageRecord(message) {
  if (!message || typeof message !== 'object') return message;
  const parts = Array.isArray(message.parts) ? message.parts : [];
  if (message.senderType !== 'character') {
    return { ...message, parts };
  }
  if (Array.isArray(message.versions) && message.versions.length > 0) {
    const activeVersion = Math.min(
      message.versions.length - 1,
      Math.max(0, Number(message.activeVersion) || 0)
    );
    const nextParts = Array.isArray(message.versions[activeVersion].parts)
      ? message.versions[activeVersion].parts
      : parts;
    const usage = message.versions[activeVersion].usage || message.usage;
    const thinking = typeof message.versions[activeVersion].thinking === 'string'
      ? message.versions[activeVersion].thinking
      : (typeof message.thinking === 'string' ? message.thinking : '');
    return { ...message, activeVersion, parts: nextParts, usage, thinking };
  }
  return {
    ...message,
    parts,
    thinking: typeof message.thinking === 'string' ? message.thinking : '',
    activeVersion: 0,
    versions: [{
      parts,
      usage: message.usage || null,
      thinking: typeof message.thinking === 'string' ? message.thinking : '',
      createdAt: message.createdAt || now()
    }]
  };
}

function normalizeMessageList(list) {
  return (Array.isArray(list) ? list : []).map(normalizeMessageRecord);
}

// ---- actions ----

// 建立角色（第七節建立流程）。
export async function createCharacter(data) {
  const ts = now();
  const character = {
    id: generateId('char'),
    name: data.name || '未命名角色',
    description: data.description || '',
    personality: data.personality || '',
    scenario: data.scenario || '',
    systemPrompt: data.systemPrompt || '',
    firstMessage: data.firstMessage || '',
    speechStyle: data.speechStyle || '',
    avatar: normalizeAvatarInput(data.avatar),
    createdAt: ts,
    updatedAt: ts
  };

  // 自動建立 direct conversation。
  const conversation = {
    id: generateId('conv'),
    type: 'direct',
    title: null, // direct 一律 null，標題由角色 name 派生（第七節 title 規則）
    memberIds: ['player', character.id],
    primaryCharacterId: character.id,
    createdAt: ts,
    updatedAt: ts,
    lastMessageAt: ts
  };

  state.characters.push(character);
  state.conversations.push(conversation);

  // 透過唯一 action 切換指標並載入（此時尚無 messages）。
  await selectCharacter(character.id, { silent: true });

  // firstMessage 只在角色建立當下插入一次；之後切換 / 重新整理 / 重新載入都不再插入。
  if (character.firstMessage && character.firstMessage.trim()) {
    const firstMsg = makeMessage({
      conversationId: conversation.id,
      senderType: 'character',
      senderId: character.id,
      parts: [{ type: 'message', content: character.firstMessage.trim() }]
    });
    await addMessage(firstMsg);
    messages.push(firstMsg);
    conversation.lastMessageAt = firstMsg.createdAt;
  }

  invalidateStats();
  await saveCurrentState();
  notify();
  return character;
}

export async function updateCharacter(characterId, patch) {
  const character = state.characters.find((c) => c.id === characterId);
  if (!character) return;

  const oldAvatar = character.avatar;
  const nextAvatar = 'avatar' in patch
    ? normalizeAvatarInput(patch.avatar, oldAvatar)
    : oldAvatar;

  Object.assign(character, {
    ...patch,
    avatar: nextAvatar,
    updatedAt: now()
  });

  // 頭貼被取代時清除舊 asset（避免孤兒 blob）。
  await cleanupReplacedAvatar(oldAvatar, nextAvatar);

  // conversation title 是派生的，改名不需同步 conversation。
  await saveCurrentState();
  notify();
}

// 刪除角色的連鎖規則（第七節）。confirm 由 UI 層負責，這裡只執行連鎖刪除。
export async function deleteCharacter(characterId) {
  const conversation = findConversationByCharacter(characterId);
  const character = state.characters.find((c) => c.id === characterId);

  // 1) 刪除該 conversation 的全部 messages
  if (conversation) {
    await deleteMessagesByConversation(conversation.id);
    // 2) 刪除 conversation
    state.conversations = state.conversations.filter((c) => c.id !== conversation.id);
  }

  // 訊息已異動，使首頁統計快取失效。
  invalidateStats();

  // 3) 刪除 character，並一併刪除其 image 頭貼 asset（避免孤兒 blob）。
  if (character && character.avatar && character.avatar.type === 'image') {
    await deleteAvatarAsset(character.avatar.assetId);
  }
  state.characters = state.characters.filter((c) => c.id !== characterId);

  // 3b) V3 連鎖刪除：一併清除該角色的 memories / anniversaries / wishlists /
  //     relationshipData，避免孤兒資料。
  state.memories = (state.memories || []).filter((m) => m.characterId !== characterId);
  state.anniversaries = (state.anniversaries || []).filter((a) => a.characterId !== characterId);
  state.wishlists = (state.wishlists || []).filter((w) => w.characterId !== characterId);
  state.relationshipData = (state.relationshipData || []).filter((r) => r.characterId !== characterId);

  // 4) 修復指標：若指向被刪除對象，自動選取剩餘第一個角色；若已無角色則清空。
  const pointedDeleted =
    state.currentCharacterId === characterId ||
    (conversation && state.currentConversationId === conversation.id);

  if (pointedDeleted) {
    if (state.characters.length > 0) {
      await selectCharacter(state.characters[0].id, { silent: true });
    } else {
      state.currentCharacterId = '';
      state.currentConversationId = '';
      messages = [];
    }
  }

  await saveCurrentState();
  notify();
}

// 唯一可修改兩個 current 指標的 action。同時更新並保持一致。
export async function selectCharacter(characterId, options = {}) {
  const conversation = findConversationByCharacter(characterId);
  if (!conversation) {
    // 找不到對應對話：視為無效選取，不動指標。
    return;
  }

  state.currentCharacterId = characterId;
  state.currentConversationId = conversation.id;

  // 切換對話時清除上一個對話殘留的錯誤條。
  pendingError = null;

  await reloadCurrentMessages();
  maybeExtractDreamMemories(conversation.id, { automatic: true })
    .then((added) => {
      if (added && added.length) emitToast('夢釀完成');
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('夢釀進入對話檢查失敗', err);
    });

  if (!options.silent) {
    await saveCurrentState();
    notify();
  }
}

// 送出玩家訊息並取得 AI 回覆（第八節送出流程）。
//
// V1 錯誤處理原則：player message 一旦寫入就不因 API 失敗而消失。因此本函式先把
// player message 寫入 DB 與記憶體並保存 state，再委派 runGeneration 產生回覆；
// runGeneration 失敗只設定 pendingError（錯誤條），不動已存在的 player message。
export async function sendPlayerMessage(text, extraParts = []) {
  const trimmed = (text || '').trim();
  const mediaParts = Array.isArray(extraParts) ? extraParts.filter(Boolean) : [];
  if (!trimmed && !mediaParts.length) return;

  const conversation = getActiveConversation();
  const character = getActiveCharacter();
  if (!conversation || !character) return;

  // 新送出：清掉舊錯誤條。
  pendingError = null;

  // 2) 新增 player message 並立即持久化（確保 API 失敗 / 重新整理都不遺失）。
  const playerMsg = makeMessage({
    conversationId: conversation.id,
    senderType: 'player',
    senderId: 'player',
    parts: [
      ...(trimmed ? [{ type: 'message', content: trimmed }] : []),
      ...mediaParts
    ]
  });
  await addMessage(playerMsg);
  messages.push(playerMsg);
  conversation.lastMessageAt = playerMsg.createdAt;
  invalidateStats(); // 最後訊息摘要改變。
  await saveCurrentState();

  // 3~7) 產生回覆流程。
  await runGeneration(conversation, character, partsToPlainText(playerMsg.parts));
}

export async function sendStickerMessage(stickerId) {
  if (!stickerId) return;
  return sendPlayerMessage('', [{ type: 'sticker', stickerId }]);
}

export async function sendPhotoMessage(assetId, altText = '') {
  if (!assetId) return;
  return sendPlayerMessage('', [{ type: 'image', assetId, altText: String(altText || '').trim() }]);
}

// 重試：以最近一則 player message 重新走一次產生回覆流程（不重複插入 player message）。
export async function retryLastReply() {
  const conversation = getActiveConversation();
  const character = getActiveCharacter();
  if (!conversation || !character) return;

  let userText = pendingError ? pendingError.userText : '';
  if (!userText) {
    // 保底：從訊息串找最後一則 player message。
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].senderType === 'player') {
        userText = partsToPlainText(messages[i].parts);
        break;
      }
    }
  }

  pendingError = null;
  await runGeneration(conversation, character, userText);
}

// 產生 AI 回覆的共用流程（送出與重試共用）。成功則新增 character message 並保存；
// 失敗則設定 pendingError，讓聊天視窗顯示錯誤條與「重試」按鈕。
async function runGeneration(conversation, character, userText) {
  typing = true;
  pendingError = null;
  notify();

  try {
    // 3) buildPrompt（回傳 { systemBlocks, messages }）
    const prompt = buildPrompt({
      conversation,
      activeCharacter: character,
      characters: state.characters,
      player: state.player,
      messages,
      memories: state.memories,
      worldEntries: state.worldbooks,
      globalPrompts: state.globalPrompts,
      mode: state.settings.messageDisplayMode,
      memoryInjectionLimit: state.settings.memoryInjectionLimit,
      settings: state.settings,
      anniversaries: state.anniversaries,
      stickers: state.stickers
    });

    // 記憶「被想起」：凡實際注入 prompt 的記憶（locked 與非 locked 都算），
    // 更新 lastRecalledAt / recallCount。在此更新確保 mock 與真 API 一致，
    // 且即使後續 API 失敗，注入紀錄仍已持久化。
    await markMemoriesRecalled(prompt.meta && prompt.meta.injectedMemoryIds);

    // 4) aiService.generateReply（回傳 MessagePart[]，可能附帶 .usage）
    const result = await generateReply({
      prompt,
      conversation,
      character,
      player: state.player,
      userMessage: userText,
      apiSettings: state.apiSettings
    });

    const parts = Array.isArray(result) && result.length
      ? result
      : [{ type: 'message', content: '……' }];
    // 只有真 API 回覆會帶 usage；mock 不帶（保持 undefined）。
    const usage = result && result.usage ? result.usage : null;
    const thinking = result && typeof result.thinking === 'string' ? result.thinking : '';

    // 5) 新增 character message
    const replyMsg = makeMessage({
      conversationId: conversation.id,
      senderType: 'character',
      senderId: character.id,
      parts,
      usage,
      thinking
    });
    await addMessage(replyMsg);
    messages.push(replyMsg);

    // 新回覆（可能帶 usage）→ 首頁統計快取失效。
    invalidateStats();

    // 6) 更新 lastMessageAt 並保存
    conversation.lastMessageAt = replyMsg.createdAt;
    conversation.updatedAt = replyMsg.createdAt;
    await saveCurrentState();
    maybeExtractDreamMemories(conversation.id, { automatic: true })
      .then((added) => {
        if (added && added.length) emitToast('夢釀完成');
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('夢釀自動觸發失敗', err);
      });
  } catch (err) {
    // API 失敗：保留 player message，僅記錄可讀錯誤供錯誤條顯示。
    pendingError = {
      message: (err && err.userMessage) || (err && err.message) || 'AI 回覆失敗',
      userText,
      conversationId: conversation.id
    };
  } finally {
    // 7) 解除「輸入中」並通知重新渲染
    typing = false;
    notify();
  }
}

function partsToPlainText(parts) {
  if (!Array.isArray(parts)) return '';
  return parts.map((p) => {
    if (!p) return '';
    if (p.type === 'sticker') {
      const sticker = (state.stickers || []).find((s) => s.id === p.stickerId);
      return sticker ? `[貼圖] ${sticker.contextText || '貼圖'}` : '[貼圖]';
    }
    if (p.type === 'image') return p.altText ? `[照片] ${p.altText}` : '[照片]';
    return p.content ? String(p.content) : '';
  }).join('\n').trim();
}

export async function updatePlayer(patch) {
  const oldAvatar = state.player.avatar;
  const nextAvatar = 'avatar' in patch
    ? normalizeAvatarInput(patch.avatar, oldAvatar)
    : oldAvatar;

  state.player = {
    ...state.player,
    ...patch,
    avatar: nextAvatar
  };
  await cleanupReplacedAvatar(oldAvatar, nextAvatar);
  await saveCurrentState();
  notify();
}

// ---- 對話選取（供 hash router 使用）----
// 由 conversationId 反查對應角色並走唯一的 selectCharacter，維持指標不變式。
export async function selectConversation(conversationId) {
  const conv = state.conversations.find((c) => c.id === conversationId);
  if (!conv) return;
  await selectCharacter(conv.primaryCharacterId);
}

// （V4：獨白已併入迴聲牆，journal actions 移除；journals 陣列保留給未來角色私語（V8）。）

// ---- 全域 Prompt 存放區（V2 任務三）----
export async function addGlobalPrompt(data) {
  const ts = now();
  const maxOrder = state.globalPrompts.reduce((m, g) => Math.max(m, g.order || 0), -1);
  state.globalPrompts.push({
    id: generateId('gp'),
    title: (data && data.title ? String(data.title) : '') || '未命名 Prompt',
    content: (data && data.content) ? String(data.content) : '',
    enabled: data && typeof data.enabled === 'boolean' ? data.enabled : true,
    order: maxOrder + 1,
    createdAt: ts,
    updatedAt: ts
  });
  await saveCurrentState();
  notify();
}

export async function updateGlobalPrompt(id, patch) {
  const g = state.globalPrompts.find((x) => x.id === id);
  if (!g) return;
  if ('title' in patch) g.title = String(patch.title || '');
  if ('content' in patch) g.content = String(patch.content || '');
  if ('enabled' in patch) g.enabled = !!patch.enabled;
  g.updatedAt = now();
  await saveCurrentState();
  notify();
}

export async function deleteGlobalPrompt(id) {
  state.globalPrompts = state.globalPrompts.filter((x) => x.id !== id);
  normalizeGlobalPromptOrder();
  await saveCurrentState();
  notify();
}

// 上移 / 下移：dir = -1 上移、+1 下移。以目前 order 排序後交換相鄰兩塊的 order。
export async function moveGlobalPrompt(id, dir) {
  const sorted = state.globalPrompts.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  const idx = sorted.findIndex((g) => g.id === id);
  if (idx < 0) return;
  const swapIdx = idx + (dir < 0 ? -1 : 1);
  if (swapIdx < 0 || swapIdx >= sorted.length) return;
  const a = sorted[idx];
  const b = sorted[swapIdx];
  const tmp = a.order;
  a.order = b.order;
  b.order = tmp;
  a.updatedAt = now();
  b.updatedAt = now();
  await saveCurrentState();
  notify();
}

// 重新編號 order 為 0..n-1（刪除後保持連續，避免縫隙）。
function normalizeGlobalPromptOrder() {
  state.globalPrompts
    .slice()
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .forEach((g, i) => { g.order = i; });
}

// ---- V3：角色相處資料（relationshipData / anniversaries / wishlists / memories）----

function clampInt(v, min, max, fallback) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// 取得（或建立）某角色的 relationshipData 記錄。系統維護，不供使用者手改欄位。
function getOrCreateRelationship(characterId) {
  let r = state.relationshipData.find((x) => x.characterId === characterId);
  if (!r) {
    r = { characterId, firstMetAt: 0, totalMessages: 0 };
    state.relationshipData.push(r);
  }
  return r;
}

// 唯讀查詢（供 UI）：找不到時回傳預設值，不建立記錄。
export function getRelationship(characterId) {
  return (
    state.relationshipData.find((x) => x.characterId === characterId) || {
      characterId,
      firstMetAt: 0,
      totalMessages: 0
    }
  );
}

// 設定「相遇日」：firstMetAt 為 ms 時間戳；傳 0 代表清除（回到以 createdAt 起算）。
export async function setFirstMetAt(characterId, ts) {
  const r = getOrCreateRelationship(characterId);
  r.firstMetAt = Number(ts) || 0;
  await saveCurrentState();
  notify();
}

// 重算並快取相處統計的 totalMessages（雙方訊息總數）。不 notify（供渲染期間呼叫），
// 回傳最新計數供 UI 直接顯示；只有數值改變時才寫回 DB。
export async function refreshRelationshipStats(characterId, conversationId) {
  const count = conversationId ? (await getMessagesByConversation(conversationId)).length : 0;
  const r = getOrCreateRelationship(characterId);
  if (r.totalMessages !== count) {
    r.totalMessages = count;
    await saveCurrentState();
  }
  return count;
}

// ---- 紀念日 anniversaries ----
function normalizeRepeat(r) {
  return r === 'yearly' || r === 'monthly' ? r : 'none';
}

export async function addAnniversary(characterId, { title, date, repeat } = {}) {
  state.anniversaries.push({
    id: generateId('anniv'),
    characterId,
    title: (title || '').trim() || '未命名紀念日',
    date: (date || '').trim(),
    repeat: normalizeRepeat(repeat),
    createdAt: now()
  });
  await saveCurrentState();
  notify();
}

export async function updateAnniversary(id, patch) {
  const a = state.anniversaries.find((x) => x.id === id);
  if (!a) return;
  if ('title' in patch) a.title = (patch.title || '').trim() || '未命名紀念日';
  if ('date' in patch) a.date = (patch.date || '').trim();
  if ('repeat' in patch) a.repeat = normalizeRepeat(patch.repeat);
  await saveCurrentState();
  notify();
}

export async function deleteAnniversary(id) {
  state.anniversaries = state.anniversaries.filter((x) => x.id !== id);
  await saveCurrentState();
  notify();
}

// ---- 想一起做的事 wishlists ----
export async function addWishlist(characterId, { title, note } = {}) {
  state.wishlists.push({
    id: generateId('wish'),
    characterId,
    title: (title || '').trim() || '未命名',
    done: false,
    note: (note || '').trim(),
    createdAt: now(),
    doneAt: 0
  });
  await saveCurrentState();
  notify();
}

export async function updateWishlist(id, patch) {
  const w = state.wishlists.find((x) => x.id === id);
  if (!w) return;
  if ('title' in patch) w.title = (patch.title || '').trim() || '未命名';
  if ('note' in patch) w.note = (patch.note || '').trim();
  if ('done' in patch) {
    w.done = !!patch.done;
    w.doneAt = w.done ? now() : 0;
  }
  await saveCurrentState();
  notify();
}

export async function deleteWishlist(id) {
  state.wishlists = state.wishlists.filter((x) => x.id !== id);
  await saveCurrentState();
  notify();
}

// ---- 記憶 memories（任務三）----
// 欄位一次到位；部分欄位 V3 只儲存不使用（emotionWeight 的實際運用、status 的
// invalidated、source 的 extracted 為未來預留）。
export async function addMemory(characterId, data = {}) {
  const ts = now();
  state.memories.push({
    id: generateId('mem'),
    characterId,
    content: (data.content || '').trim(),
    summary: (data.summary || '').trim(),
    importance: clampInt(data.importance, 1, 5, 3),
    emotionWeight: clampInt(data.emotionWeight, 1, 5, 3),
    locked: !!data.locked,
    enabled: data.enabled !== false,
    lastRecalledAt: 0,
    recallCount: 0,
    status: 'active',
    source: data.source || 'manual',
    createdAt: ts,
    updatedAt: ts
  });
  await saveCurrentState();
  notify();
}

export async function updateMemory(id, patch) {
  const m = state.memories.find((x) => x.id === id);
  if (!m) return;
  if ('content' in patch) m.content = (patch.content || '').trim();
  if ('summary' in patch) m.summary = (patch.summary || '').trim();
  if ('importance' in patch) m.importance = clampInt(patch.importance, 1, 5, m.importance);
  if ('emotionWeight' in patch) m.emotionWeight = clampInt(patch.emotionWeight, 1, 5, m.emotionWeight);
  if ('locked' in patch) m.locked = !!patch.locked;
  if ('enabled' in patch) m.enabled = !!patch.enabled;
  m.updatedAt = now();
  await saveCurrentState();
  notify();
}

export async function deleteMemory(id) {
  state.memories = state.memories.filter((x) => x.id !== id);
  await saveCurrentState();
  notify();
}

// 記憶「被想起」：實際注入 prompt 的記憶更新 lastRecalledAt / recallCount。
// 內部使用（runGeneration 呼叫），不對外匯出、不 notify（避免打斷產生流程的渲染節奏）。
async function markMemoriesRecalled(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return;
  const set = new Set(ids);
  const ts = now();
  let changed = false;
  for (const m of state.memories) {
    if (m && set.has(m.id)) {
      m.lastRecalledAt = ts;
      m.recallCount = (Number(m.recallCount) || 0) + 1;
      changed = true;
    }
  }
  if (changed) await saveCurrentState();
}

// ---- 對話層級人設覆蓋 playerPersona（任務四）----
// 兩欄皆空 → 清除覆蓋，回到全域玩家設定。
export async function updateConversationPersona(conversationId, persona) {
  const conv = state.conversations.find((c) => c.id === conversationId);
  if (!conv) return;
  const name = (persona && persona.name ? String(persona.name) : '').trim();
  const description = (persona && persona.description ? String(persona.description) : '').trim();
  if (!name && !description) {
    delete conv.playerPersona;
  } else {
    conv.playerPersona = { name, description };
  }
  await saveCurrentState();
  notify();
}

// ---- 備份時間戳（V2 任務 2.4）----
export async function markBackupDone() {
  state.lastBackupAt = now();
  await saveCurrentState();
  notify();
}

export async function updateSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  await saveCurrentState();
  notify();
}

// 更新 API 設定。apiKey 的落地規則由 db.saveState 依 rememberApiKey 處理：
// rememberApiKey=false 時 apiKey 不寫入 IndexedDB（只留在記憶體）。
export async function updateApiSettings(patch) {
  state.apiSettings = { ...state.apiSettings, ...patch };
  await saveCurrentState();
  notify();
}

function pushUsageLog(entry) {
  const usage = entry && entry.usage ? entry.usage : entry;
  if (!usage) return;
  const row = {
    at: entry.at || now(),
    kind: entry.kind || 'utility',
    characterId: entry.characterId || '',
    promptTokens: Number(usage.promptTokens) || 0,
    completionTokens: Number(usage.completionTokens) || 0,
    model: usage.model || ''
  };
  state.usageLog = (state.usageLog || []).concat(row).slice(-500);
  invalidateStats();
}

export async function logUtilityUsage(kind, characterId, usage) {
  pushUsageLog({ kind, characterId, usage });
  await saveCurrentState();
  notify();
}

export async function markAppOpened() {
  const previous = state.lastOpenedAt || 0;
  state.lastOpenedAt = now();
  await saveCurrentState();
  return previous;
}

function localDayKey(ts) {
  const d = new Date(ts || now());
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function resetDailyCounters() {
  const key = localDayKey(now());
  state.dailyCounters = state.dailyCounters || {};
  if (state.dailyCounters.date !== key) {
    state.dailyCounters = { date: key, feed: 0, dream: 0, background: 0 };
  }
  return state.dailyCounters;
}

function consumeDaily(kind, limit, { manual = false } = {}) {
  const max = Math.max(0, Number(limit) || 0);
  if (!max) return true;
  const counters = resetDailyCounters();
  const key = kind || 'background';
  const current = Number(counters[key]) || 0;
  if (current >= max) {
    if (manual) windowAlert('今日聲量已滿');
    return false;
  }
  counters[key] = current + 1;
  counters.background = (Number(counters.background) || 0) + 1;
  return true;
}

function canUseDaily(kind, limit) {
  const max = Math.max(0, Number(limit) || 0);
  if (!max) return true;
  const counters = resetDailyCounters();
  return (Number(counters[kind || 'background']) || 0) < max;
}

function windowAlert(message) {
  if (typeof window !== 'undefined' && window.alert) window.alert(message);
}

function emitToast(message) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('vocilege:toast', { detail: { message } }));
}

// ---- V6 stickers ----

export async function addSticker({ assetId, contextText }) {
  const item = {
    id: generateId('sticker'),
    assetId: String(assetId || ''),
    contextText: String(contextText || '').trim(),
    createdAt: now()
  };
  if (!item.assetId || !item.contextText) return null;
  state.stickers = state.stickers || [];
  state.stickers.push(item);
  await saveCurrentState();
  notify();
  return item;
}

export async function updateSticker(id, patch) {
  const item = (state.stickers || []).find((s) => s.id === id);
  if (!item) return null;
  if ('contextText' in patch) item.contextText = String(patch.contextText || '').trim();
  delete item.label;
  await saveCurrentState();
  notify();
  return item;
}

export async function deleteSticker(id) {
  const item = (state.stickers || []).find((s) => s.id === id);
  state.stickers = (state.stickers || []).filter((s) => s.id !== id);
  if (item && item.assetId) await deleteStoredAsset(item.assetId);
  await saveCurrentState();
  notify();
}

// ---- V4 feed ----

function characterBrief(character) {
  if (!character) return '';
  return [
    `角色：${character.name || '未命名'}`,
    character.personality ? `個性：${character.personality}` : '',
    character.speechStyle ? `說話風格：${character.speechStyle}` : '',
    character.scenario ? `情境：${character.scenario}` : ''
  ].filter(Boolean).join('\n');
}

function topMemoryText(characterId, limit = 3) {
  return (state.memories || [])
    .filter((m) => m && m.characterId === characterId && (m.status || 'active') === 'active' && m.enabled !== false)
    .slice()
    .sort((a, b) => (b.importance || 0) - (a.importance || 0) || (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, limit)
    .map((m) => `・${m.summary || m.content || ''}`)
    .filter((x) => x.trim())
    .join('\n');
}

function stripSpeakerName(text, character) {
  const raw = String(text || '').trim();
  const name = character && character.name ? String(character.name).trim() : '';
  if (name && raw.startsWith(`${name}：`)) return raw.slice(name.length + 1).trim();
  return raw;
}

function shuffled(list) {
  return (list || []).slice().sort(() => Math.random() - 0.5);
}

export async function addPost({ authorType = 'player', authorId = 'player', content, mood = '' }) {
  const text = (content || '').trim();
  if (!text) return null;
  const post = {
    id: generateId('post'),
    authorType,
    authorId,
    content: text,
    mood: (mood || '').trim(),
    createdAt: now(),
    likes: [],
    comments: []
  };
  state.posts = state.posts || [];
  state.posts.push(post);
  await saveCurrentState();
  notify();
  if (post.authorType === 'player') {
    triggerFeedReactions(post.id, { automatic: true }).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('迴聲自動反應失敗', err);
    });
  }
  return post;
}

export async function deletePost(id) {
  state.posts = (state.posts || []).filter((p) => p.id !== id);
  await saveCurrentState();
  notify();
}

export async function togglePostLike(postId, userType = 'player', userId = 'player') {
  const post = (state.posts || []).find((p) => p.id === postId);
  if (!post) return;
  post.likes = Array.isArray(post.likes) ? post.likes : [];
  const idx = post.likes.findIndex((l) => l.userType === userType && l.userId === userId);
  if (idx >= 0) post.likes.splice(idx, 1);
  else post.likes.push({ userType, userId, at: now() });
  await saveCurrentState();
  notify();
}

export async function addPostComment(postId, { authorType = 'player', authorId = 'player', content }) {
  const post = (state.posts || []).find((p) => p.id === postId);
  const text = (content || '').trim();
  if (!post || !text) return null;
  post.comments = Array.isArray(post.comments) ? post.comments : [];
  const comment = {
    id: generateId('comment'),
    authorType,
    authorId,
    content: text,
    createdAt: now()
  };
  post.comments.push(comment);
  await saveCurrentState();
  notify();
  if (authorType === 'player' && post.authorType === 'character' && !post.characterRepliedToPlayer && !usesMock(state.apiSettings)) {
    post.characterRepliedToPlayer = true;
    triggerSingleFeedReaction(post.id, post.authorId, { automatic: true }).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('迴聲留言回覆失敗', err);
    });
  }
  return comment;
}

export async function generateMockFeedReaction(postId) {
  const post = (state.posts || []).find((p) => p.id === postId);
  if (!post) return null;
  const characters = (state.characters || []).filter((c) => c && c.id);
  if (!characters.length) return null;
  const existing = new Set((post.comments || []).map((c) => c.authorId));
  const candidates = shuffled(characters.filter((c) => !existing.has(c.id)));
  const pick = candidates[0] || shuffled(characters)[0];
  const name = pick.name || '角色';
  const snippets = [
    `我看到這段，第一個想到的是你當時的表情。`,
    `這件事感覺值得被好好收著。`,
    `我想陪你把這個瞬間多停留一下。`
  ];
  const comment = await addPostComment(postId, {
    authorType: 'character',
    authorId: pick.id,
    content: snippets[Math.floor(Math.random() * snippets.length)]
  });
  await saveCurrentState();
  return comment;
}

export async function triggerFeedReactions(postId, { automatic = false } = {}) {
  const post = (state.posts || []).find((p) => p.id === postId);
  if (!post) return [];
  if (!canUseDaily('feed', state.settings.feedDailyLimit)) {
    if (!automatic) windowAlert('今日聲量已滿');
    return [];
  }
  if (usesMock(state.apiSettings)) {
    if (automatic) return [];
    return [await generateMockFeedReaction(postId)].filter(Boolean);
  }
  const max = Math.max(0, Number(state.settings.feedReactorsPerPost) || 2);
  const existing = new Set((post.comments || []).map((c) => c.authorId));
  const candidates = shuffled((state.characters || []).filter((c) => c && c.id && c.id !== post.authorId && !existing.has(c.id))).slice(0, max);
  const out = [];
  for (const c of candidates) {
    const row = await triggerSingleFeedReaction(postId, c.id, { automatic });
    if (row) out.push(row);
  }
  return out;
}

async function triggerSingleFeedReaction(postId, characterId, { automatic = false } = {}) {
  const post = (state.posts || []).find((p) => p.id === postId);
  const character = (state.characters || []).find((c) => c.id === characterId);
  if (!post || !character) return null;
  if (!consumeDaily('feed', state.settings.feedDailyLimit, { manual: !automatic })) return null;
  post.likes = Array.isArray(post.likes) ? post.likes : [];
  if (!post.likes.some((l) => l.userType === 'character' && l.userId === character.id)) {
    post.likes.push({ userType: 'character', userId: character.id, at: now() });
  }
  if (usesMock(state.apiSettings)) {
    await saveCurrentState();
    notify();
    return null;
  }
  const result = await generateUtilityText({
    apiSettings: state.apiSettings,
    maxTokens: 120,
    system: [
      '你要以指定角色語氣回應玩家在迴聲中的貼文。',
      '請輸出一兩句繁體中文短留言；若只想按讚，輸出空字串。',
      characterBrief(character),
      topMemoryText(character.id) ? `聲痕：\n${topMemoryText(character.id)}` : ''
    ].filter(Boolean).join('\n\n'),
    userText: `貼文內容：${post.content || ''}\n心情：${post.mood || '未填'}`
  });
  const text = stripSpeakerName(result.text, character);
  let comment = null;
  if (text) {
    post.comments = Array.isArray(post.comments) ? post.comments : [];
    comment = {
      id: generateId('comment'),
      authorType: 'character',
      authorId: character.id,
      content: text,
      createdAt: now()
    };
    post.comments.push(comment);
  }
  pushUsageLog({ kind: 'feedReaction', characterId: character.id, usage: result.usage });
  await saveCurrentState();
  notify();
  return comment;
}

async function createScheduledCharacterPost(characterId) {
  const character = (state.characters || []).find((c) => c.id === characterId);
  if (!character) return null;
  const conv = findConversationByCharacter(characterId);
  const recentMessages = conv
    ? normalizeMessageList(await getMessagesByConversation(conv.id)).slice(-12)
    : [];
  if (!recentMessages.length) return null;
  if (!consumeDaily('feed', state.settings.feedDailyLimit, { manual: false })) return null;
  let content = '';
  if (!usesMock(state.apiSettings)) {
    const result = await generateUtilityText({
      apiSettings: state.apiSettings,
      maxTokens: 160,
      system: [
        '你要以指定角色語氣在迴聲發一則短貼文。',
        '取材於你與玩家的最近對話、關係、聲痕或想對玩家說的話。繁體中文，一到兩句，不要加角色名。',
        characterBrief(character),
        topMemoryText(character.id) ? `聲痕：\n${topMemoryText(character.id)}` : ''
      ].filter(Boolean).join('\n\n'),
      userText: [
        '最近對話摘要：',
        recentMessages.map((m) => `${m.senderType === 'player' ? '玩家' : '角色'}：${partsToPlainText(activeParts(m))}`).join('\n')
      ].join('\n')
    });
    content = stripSpeakerName(result.text, character);
    pushUsageLog({ kind: 'feedPost', characterId: character.id, usage: result.usage });
  } else {
    content = '剛剛想起一些細小的片段，想把它留在這裡等你看見。';
  }
  if (!content) content = '今天也想把一點聲音留給你。';
  const post = await addPost({ authorType: 'character', authorId: character.id, content });
  state.feedAutoPostLog = state.feedAutoPostLog || {};
  state.feedAutoPostLog[character.id] = now();
  await saveCurrentState();
  return post;
}

export async function maybeAutoFeedPost() {
  if (!state.settings.feedAutoPost) return [];
  if (!canUseDaily('feed', state.settings.feedDailyLimit)) return null;
  const current = new Date(now());
  const today = localDayKey(now());
  const out = [];
  for (const character of state.characters || []) {
    if (!character || !character.id) continue;
    const last = state.feedAutoPostLog && state.feedAutoPostLog[character.id];
    if (last && localDayKey(last) === today) continue;
    const hour = scheduledFeedHour(character.id, today);
    if (current.getHours() < hour) continue;
    if (!canUseDaily('feed', state.settings.feedDailyLimit)) break;
    const post = await createScheduledCharacterPost(character.id);
    if (post) out.push(post);
  }
  state.lastFeedAutoPostAt = now();
  await saveCurrentState();
  return out;
}

function scheduledFeedHour(characterId, dayKey) {
  const source = `${characterId}:${dayKey}`;
  let hash = 0;
  for (let i = 0; i < source.length; i++) {
    hash = ((hash * 31) + source.charCodeAt(i)) >>> 0;
  }
  return (hash % 14) + 8;
}

// ---- V4 keepsakes ----

export async function addKeepsakeFromMessage(messageId, note = '') {
  const msg = messages.find((m) => m.id === messageId);
  if (!msg) return null;
  const existing = (state.keepsakes || []).find((k) => k.messageId === messageId);
  if (existing) return existing;
  const conversation = state.conversations.find((c) => c.id === msg.conversationId);
  const characterId = conversation ? conversation.primaryCharacterId : state.currentCharacterId;
  const keepsake = {
    id: generateId('keep'),
    characterId: characterId || '',
    conversationId: msg.conversationId || '',
    messageId: msg.id,
    snapshot: {
      senderType: msg.senderType || '',
      senderId: msg.senderId || '',
      parts: JSON.parse(JSON.stringify(activeParts(msg))),
      createdAt: msg.createdAt || now()
    },
    note: (note || '').trim(),
    createdAt: now()
  };
  state.keepsakes = state.keepsakes || [];
  state.keepsakes.push(keepsake);
  await saveCurrentState();
  notify();
  return keepsake;
}

export async function toggleKeepsakeFromMessage(messageId) {
  const existing = (state.keepsakes || []).find((k) => k.messageId === messageId);
  if (existing) {
    await deleteKeepsake(existing.id);
    return null;
  }
  return addKeepsakeFromMessage(messageId, '');
}

export async function updateKeepsakeNote(id, note = '') {
  const item = (state.keepsakes || []).find((k) => k.id === id);
  if (!item) return null;
  item.note = String(note || '').trim();
  await saveCurrentState();
  notify();
  return item;
}

export async function deleteKeepsake(id) {
  state.keepsakes = (state.keepsakes || []).filter((k) => k.id !== id);
  await saveCurrentState();
  notify();
}

export async function collectKeepsakeAsMemory(keepsakeId) {
  const item = (state.keepsakes || []).find((k) => k.id === keepsakeId);
  if (!item || !item.characterId) return null;
  const text = partsToPlainText(item.snapshot && item.snapshot.parts);
  const content = [text, item.note ? `Note: ${item.note}` : ''].filter(Boolean).join('\n');
  await addMemory(item.characterId, {
    content,
    summary: item.note || text.slice(0, 60),
    importance: 4,
    emotionWeight: 4,
    locked: false,
    source: 'collected'
  });
  return item;
}

// ---- V4 message versions ----

export async function switchMessageVersion(messageId, dir) {
  const msg = messages.find((m) => m.id === messageId);
  if (!msg || !Array.isArray(msg.versions) || msg.versions.length < 2) return;
  const next = Math.min(
    msg.versions.length - 1,
    Math.max(0, (Number(msg.activeVersion) || 0) + (dir < 0 ? -1 : 1))
  );
  msg.activeVersion = next;
  msg.parts = activeParts(msg);
  msg.usage = activeUsage(msg);
  msg.thinking = activeThinking(msg);
  await updateMessage(msg);
  invalidateStats();
  notify();
}

export async function editMessageParts(messageId, text) {
  const msg = messages.find((m) => m.id === messageId);
  if (!msg) return;
  msg.parts = parseReplyToParts((text || '').trim(), state.stickers);
  msg.editedAt = now();
  if (msg.senderType === 'character') {
    msg.versions = Array.isArray(msg.versions) && msg.versions.length
      ? msg.versions
      : [{ parts: msg.parts, usage: msg.usage || null, thinking: msg.thinking || '', createdAt: msg.createdAt || now() }];
    const idx = Math.min(msg.versions.length - 1, Math.max(0, Number(msg.activeVersion) || 0));
    msg.versions[idx] = { ...msg.versions[idx], parts: msg.parts, editedAt: msg.editedAt };
  }
  await updateMessage(msg);
  invalidateStats();
  notify();
}

export async function regenerateMessage(messageId) {
  const msg = messages.find((m) => m.id === messageId);
  const conversation = msg ? state.conversations.find((c) => c.id === msg.conversationId) : null;
  const character = conversation
    ? state.characters.find((c) => c.id === conversation.primaryCharacterId)
    : getActiveCharacter();
  if (!msg || msg.senderType !== 'character' || !conversation || !character || typing) return;

  let userText = '';
  const idx = messages.findIndex((m) => m.id === msg.id);
  const lastCharIdx = findLastCharacterMessageIndex(msg.conversationId);
  if (idx !== lastCharIdx) return;
  for (let i = idx - 1; i >= 0; i--) {
    if (messages[i].senderType === 'player') {
      userText = partsToPlainText(messages[i].parts);
      break;
    }
  }

  typing = true;
  notify();
  try {
    const history = messages.slice(0, idx);
    const prompt = buildPrompt({
      conversation,
      activeCharacter: character,
      characters: state.characters,
      player: state.player,
      messages: history,
      memories: state.memories,
      worldEntries: state.worldbooks,
      globalPrompts: state.globalPrompts,
      mode: state.settings.messageDisplayMode,
      memoryInjectionLimit: state.settings.memoryInjectionLimit,
      settings: state.settings,
      anniversaries: state.anniversaries,
      stickers: state.stickers
    });
    const result = await generateReply({
      prompt,
      conversation,
      character,
      player: state.player,
      userMessage: userText,
      apiSettings: state.apiSettings
    });
    const parts = Array.isArray(result) && result.length ? result : [{ type: 'message', content: '' }];
    const usage = result && result.usage ? result.usage : null;
    const thinking = result && typeof result.thinking === 'string' ? result.thinking : '';
    msg.versions = Array.isArray(msg.versions) && msg.versions.length
      ? msg.versions
      : [{ parts: msg.parts || [], usage: msg.usage || null, thinking: msg.thinking || '', createdAt: msg.createdAt || now() }];
    msg.versions.push({ parts, usage, thinking, createdAt: now() });
    msg.activeVersion = msg.versions.length - 1;
    msg.parts = parts;
    msg.thinking = thinking;
    if (usage) msg.usage = usage;
    await updateMessage(msg);
    invalidateStats();
  } catch (err) {
    pendingError = {
      message: (err && err.userMessage) || (err && err.message) || 'AI 回覆失敗',
      userText,
      conversationId: conversation.id
    };
  } finally {
    typing = false;
    notify();
  }
}

function findLastCharacterMessageIndex(conversationId) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].conversationId === conversationId && messages[i].senderType === 'character') return i;
  }
  return -1;
}

// ---- V4 greeting / dream lite ----

export async function maybeCreateGreeting() {
  const threshold = Math.max(0, Number(state.settings.greetingAfterDays) || 0);
  if (!threshold || state.pendingGreeting) return state.pendingGreeting || null;
  const lastOpenedAt = state.lastOpenedAt || 0;
  if (!lastOpenedAt || now() - lastOpenedAt < threshold * 86400000) return null;
  if (localDayKey(state.lastGreetingAt) === localDayKey(now())) return null;
  if (!canUseDaily('feed', state.settings.feedDailyLimit)) return null;
  const conv = (state.conversations || [])
    .filter((c) => c.type === 'direct')
    .sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0))[0];
  const character = conv ? state.characters.find((c) => c.id === conv.primaryCharacterId) : null;
  if (!conv || !character) return null;
  let content = `${character.name || '我'} 想起你了。這幾天過得還好嗎？`;
  if (!usesMock(state.apiSettings)) {
    try {
      consumeDaily('feed', state.settings.feedDailyLimit);
      const days = Math.max(1, Math.floor((now() - lastOpenedAt) / 86400000));
      const result = await generateUtilityText({
        apiSettings: state.apiSettings,
        maxTokens: 120,
        system: [
          '你要以角色語氣寫一則久別問候。繁體中文，一到兩句，不要加角色名。',
          characterBrief(character),
          topMemoryText(character.id) ? `聲痕：\n${topMemoryText(character.id)}` : ''
        ].filter(Boolean).join('\n\n'),
        userText: `玩家離開了 ${days} 天，請給出自然、符合角色語氣的問候。`
      });
      content = stripSpeakerName(result.text, character) || content;
      pushUsageLog({ kind: 'greeting', characterId: character.id, usage: result.usage });
    } catch (e) {
      content = `${character.name || '我'} 想起你了。這幾天過得還好嗎？`;
    }
  }
  state.pendingGreeting = { characterId: character.id, content, createdAt: now() };
  state.lastGreetingAt = now();
  await saveCurrentState();
  notify();
  return state.pendingGreeting;
}

export async function clearPendingGreeting() {
  state.pendingGreeting = null;
  await saveCurrentState();
  notify();
}

export async function pickOldReplay() {
  const all = normalizeMessageList(await getAllMessages());
  const charByConv = {};
  for (const conv of (state.conversations || [])) {
    if (conv && conv.type === 'direct') charByConv[conv.id] = conv.primaryCharacterId;
  }
  const withChar = all
    .filter((m) => m && charByConv[m.conversationId] && m.createdAt)
    .map((m) => ({ message: m, characterId: charByConv[m.conversationId] }));
  const nowTs = now();
  const targetYear = nowTs - 365 * 86400000;
  const yearHit = pickByWindow(withChar, targetYear, 3);
  if (yearHit) return replayRecord(yearHit);
  const target90 = nowTs - 90 * 86400000;
  const ninetyHit = pickByWindow(withChar, target90, 7);
  if (ninetyHit) return replayRecord(ninetyHit);
  const old = withChar.filter((x) => nowTs - x.message.createdAt >= 30 * 86400000);
  return old.length ? replayRecord(old[Math.floor(Math.random() * old.length)]) : null;
}

function pickByWindow(list, target, days) {
  const span = days * 86400000;
  const hits = list.filter((x) => Math.abs((x.message.createdAt || 0) - target) <= span);
  return hits.length ? hits[Math.floor(Math.random() * hits.length)] : null;
}

function replayRecord(row) {
  const character = (state.characters || []).find((c) => c.id === row.characterId);
  const firstPart = activeParts(row.message)[0];
  return {
    conversationId: row.message.conversationId,
    characterId: row.characterId,
    characterName: character ? character.name || '角色' : '角色',
    createdAt: row.message.createdAt,
    snippet: firstPart && firstPart.content ? String(firstPart.content).replace(/\s+/g, ' ').trim() : ''
  };
}

export async function maybeExtractDreamMemories(conversationId, { automatic = false } = {}) {
  const conv = (state.conversations || []).find((c) => c.id === conversationId);
  if (!conv || state.settings.dreamEnabled === false) return [];
  if (usesMock(state.apiSettings)) {
    if (!automatic) windowAlert('夢釀需要連接 AI 服務');
    return [];
  }
  const every = Math.max(1, Number(state.settings.dreamEveryMessages) || 20);
  const list = conversationId === state.currentConversationId
    ? messages
    : normalizeMessageList(await getMessagesByConversation(conversationId));
  const count = list.length;
  if (automatic && count - (conv.lastDreamMessageCount || 0) < every) return [];
  if (!consumeDaily('dream', state.settings.dreamDailyLimit, { manual: !automatic })) return [];
  const characterId = conv.primaryCharacterId;
  const recent = automatic
    ? list.slice(conv.lastDreamMessageCount || 0).slice(-Math.max(every, 30))
    : list.slice(-every);
  const text = recent.map((m) => {
    const speaker = m.senderType === 'player' ? '玩家' : '角色';
    return `${speaker}：${partsToPlainText(activeParts(m))}`;
  }).join('\n').trim();
  if (!text) return [];
  let result;
  try {
    result = await generateUtilityText({
      apiSettings: state.apiSettings,
      maxTokens: 500,
      system: [
        '你要把一段角色與玩家的對話整理成可長期保存的「日期對話摘要」聲痕。',
        '請輸出繁體中文二到四句，事實與情感重點並重。',
        '不要輸出 JSON、標題、項目符號或多餘說明；只輸出摘要內容。'
      ].filter(Boolean).join('\n\n'),
      userText: text
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('夢釀 AI 呼叫失敗', e);
    return [];
  }
  const content = String(result.text || '').trim();
  if (!content) {
    conv.lastDreamMessageCount = count;
    await saveCurrentState();
    return [];
  }
  const ts = now();
  const memory = {
    id: generateId('mem'),
    characterId,
    content,
    summary: `${localDayKey(ts)} 對話摘要`,
    importance: 3,
    emotionWeight: 3,
    locked: false,
    enabled: true,
    lastRecalledAt: 0,
    recallCount: 0,
    status: 'active',
    source: 'extracted',
    createdAt: ts,
    updatedAt: ts
  };
  state.memories.push(memory);
  conv.lastDreamMessageCount = count;
  if (result && result.usage) pushUsageLog({ kind: 'dream', characterId, usage: result.usage });
  await saveCurrentState();
  notify();
  return [memory];
}

function parseDreamJson(text) {
  const raw = String(text || '').trim();
  if (!raw) return [];
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    const data = JSON.parse(cleaned);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    const m = /\[[\s\S]*\]/.exec(cleaned);
    if (!m) return [];
    try {
      const data = JSON.parse(m[0]);
      return Array.isArray(data) ? data : [];
    } catch (err) {
      return [];
    }
  }
}

function normalizeForCompare(text) {
  return String(text || '').toLowerCase().replace(/[\s，。！？、,.!?;；：「」『』"'（）()]/g, '');
}

function bigrams(text) {
  const s = normalizeForCompare(text);
  const set = new Set();
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
  if (!set.size && s) set.add(s);
  return set;
}

function overlapRatio(a, b) {
  const x = bigrams(a);
  const y = bigrams(b);
  if (!x.size || !y.size) return 0;
  let same = 0;
  for (const token of x) if (y.has(token)) same++;
  return same / Math.min(x.size, y.size);
}

function isDuplicateMemory(content, list) {
  return (list || []).some((m) => {
    const t = [m.content, m.summary].filter(Boolean).join('\n');
    return overlapRatio(content, t) > 0.6;
  });
}

// ---- message 工廠：套用 senderType→role 映射（第七節）----
//
// 映射規則（必須一致）：
//   senderType "player"    → role "user"，     senderId = "player"
//   senderType "character" → role "assistant"，senderId = 該角色 id
//   senderType "system"    → role "system"
//
// role 對應未來 AI API 的 message role；senderType + senderId 用於區分「群聊中多個
// 角色都是 assistant」的情境（未來群聊時，靠 senderId 分辨是哪個角色）。
function makeMessage({ conversationId, senderType, senderId, parts, usage, thinking }) {
  const createdAt = now();
  let role;
  if (senderType === 'player') role = 'user';
  else if (senderType === 'character') role = 'assistant';
  else role = 'system';

  const msg = {
    id: generateId('msg'),
    conversationId,
    senderType,
    senderId: senderType === 'player' ? 'player' : senderId,
    role,
    parts: parts || [],
    createdAt
  };
  // usage 為選填：只有真 API 回覆的 assistant message 才寫入
  // { promptTokens, completionTokens, model }。player / mock 不寫。
  if (usage && typeof usage === 'object') {
    msg.usage = {
      promptTokens: Number(usage.promptTokens) || 0,
      completionTokens: Number(usage.completionTokens) || 0,
      model: usage.model || ''
    };
    // V3：快取用量為選填（只有 anthropic 回應帶快取欄位時才寫入）。
    if (usage.cacheRead != null) msg.usage.cacheRead = Number(usage.cacheRead) || 0;
    if (usage.cacheWrite != null) msg.usage.cacheWrite = Number(usage.cacheWrite) || 0;
  }
  if (senderType === 'character') {
    msg.thinking = typeof thinking === 'string' ? thinking : '';
    msg.activeVersion = 0;
    msg.versions = [{
      parts: msg.parts,
      usage: msg.usage || null,
      thinking: msg.thinking,
      createdAt
    }];
  }
  return msg;
}

// 供 backupService 在清空 / 匯入後重設 store 記憶體狀態使用。
export async function resetToState(newState) {
  state = newState;
  invalidateStats(); // 匯入 / 清空後訊息與角色皆變，統計重算。
  await reloadCurrentMessages();
  notify();
}

export function getConfig() {
  return config;
}

export async function exportConversationBook(format = 'html') {
  const conversation = getActiveConversation();
  const character = getActiveCharacter();
  if (!conversation || !character) return null;
  const list = conversation.id === state.currentConversationId
    ? messages
    : normalizeMessageList(await getMessagesByConversation(conversation.id));
  const active = list.map((m) => ({ ...m, parts: activeParts(m) }));
  const title = `${character.name || '角色'} 與 ${(state.player && state.player.playerName) || '你'} 的聲書`;
  const range = dateRangeText(active);
  const body = format === 'markdown'
    ? bookMarkdown(title, range, active, character)
    : bookHtml(title, range, active, character);
  const blob = new Blob([body], { type: format === 'markdown' ? 'text/markdown;charset=utf-8' : 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeFilename(title)}.${format === 'markdown' ? 'md' : 'html'}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return { ok: true };
}

function dateRangeText(list) {
  const times = (list || []).map((m) => m.createdAt || 0).filter(Boolean).sort((a, b) => a - b);
  if (!times.length) return '';
  const first = localDayKey(times[0]);
  const last = localDayKey(times[times.length - 1]);
  return first === last ? first : `${first} - ${last}`;
}

function speakerName(message, character) {
  return message.senderType === 'player'
    ? ((state.player && state.player.playerName) || '你')
    : (character.name || '角色');
}

function bookPartText(part) {
  if (!part) return '';
  if (part.type === 'sticker') {
    const sticker = (state.stickers || []).find((s) => s.id === part.stickerId);
    return `（貼圖：${sticker ? (sticker.contextText || '貼圖') : '缺失'}）`;
  }
  if (part.type === 'image') return `（照片：${part.altText || '未命名'}）`;
  return part.content ? String(part.content) : '';
}

function bookMarkdown(title, range, list, character) {
  const lines = [`# ${title}`, '', range ? `日期：${range}` : '', ''].filter((x) => x !== '');
  for (const message of list) {
    const name = speakerName(message, character);
    for (const part of message.parts || []) {
      const text = bookPartText(part);
      if (!text) continue;
      if (part.type === 'narration') lines.push(`*${text}*`, '');
      else lines.push(`**${name}**：「${text}」`, '');
    }
  }
  return lines.join('\n');
}

function bookHtml(title, range, list, character) {
  const rows = [];
  for (const message of list) {
    const name = escapeHtml(speakerName(message, character));
    for (const part of message.parts || []) {
      const text = escapeHtml(bookPartText(part));
      if (!text) continue;
      const cls = part.type === 'narration' ? 'narration' : 'line';
      rows.push(`<section class="${cls}"><div class="speaker">${name}</div><p>${text}</p></section>`);
    }
  }
  return [
    '<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">',
    `<title>${escapeHtml(title)}</title>`,
    '<style>body{font-family:system-ui,-apple-system,"Noto Sans TC",sans-serif;max-width:760px;margin:40px auto;padding:0 20px;line-height:1.8;color:#2d2926;background:#fffdf8}.meta{color:#81756b}.speaker{font-size:13px;color:#8a5a44;font-weight:700;margin-top:18px}.line p{margin:4px 0 12px}.narration{color:#8a8178;font-style:italic;text-align:center}.narration .speaker{display:none}</style>',
    '</head><body>',
    `<h1>${escapeHtml(title)}</h1>`,
    range ? `<div class="meta">${escapeHtml(range)}</div>` : '',
    rows.join('\n'),
    '</body></html>'
  ].join('');
}

function escapeHtml(text) {
  return String(text || '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function safeFilename(text) {
  return String(text || 'book').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
}

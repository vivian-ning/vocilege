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
  addMessage,
  deleteMessagesByConversation
} from '../db/indexeddb.js';
import { createDefaultState, normalizeState } from './schema.js';
import { migrateState } from './migrations.js';
import { buildPrompt } from '../services/promptBuilder.js';
import { generateReply } from '../services/aiService.js';
import { generateId } from '../utils/id.js';
import { now } from '../utils/time.js';

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
    messages = await getMessagesByConversation(state.currentConversationId);
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
    avatar: {
      type: 'emoji',
      value: (data.avatar && data.avatar.value) || data.avatar || '🙂'
    },
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

  await saveCurrentState();
  notify();
  return character;
}

export async function updateCharacter(characterId, patch) {
  const character = state.characters.find((c) => c.id === characterId);
  if (!character) return;

  Object.assign(character, {
    ...patch,
    // avatar 允許傳字串或物件。
    avatar: patch.avatar
      ? { type: 'emoji', value: (patch.avatar.value || patch.avatar) }
      : character.avatar,
    updatedAt: now()
  });

  // conversation title 是派生的，改名不需同步 conversation。
  await saveCurrentState();
  notify();
}

// 刪除角色的連鎖規則（第七節）。confirm 由 UI 層負責，這裡只執行連鎖刪除。
export async function deleteCharacter(characterId) {
  const conversation = findConversationByCharacter(characterId);

  // 1) 刪除該 conversation 的全部 messages
  if (conversation) {
    await deleteMessagesByConversation(conversation.id);
    // 2) 刪除 conversation
    state.conversations = state.conversations.filter((c) => c.id !== conversation.id);
  }

  // 3) 刪除 character
  state.characters = state.characters.filter((c) => c.id !== characterId);

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
export async function sendPlayerMessage(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return;

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
    parts: [{ type: 'message', content: trimmed }]
  });
  await addMessage(playerMsg);
  messages.push(playerMsg);
  conversation.lastMessageAt = playerMsg.createdAt;
  await saveCurrentState();

  // 3~7) 產生回覆流程。
  await runGeneration(conversation, character, trimmed);
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
    // 3) buildPrompt（回傳 { system, messages }）
    const prompt = buildPrompt({
      conversation,
      activeCharacter: character,
      characters: state.characters,
      player: state.player,
      messages,
      memories: state.memories,
      worldEntries: state.worldbooks,
      mode: state.settings.messageDisplayMode
    });

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

    // 5) 新增 character message
    const replyMsg = makeMessage({
      conversationId: conversation.id,
      senderType: 'character',
      senderId: character.id,
      parts,
      usage
    });
    await addMessage(replyMsg);
    messages.push(replyMsg);

    // 6) 更新 lastMessageAt 並保存
    conversation.lastMessageAt = replyMsg.createdAt;
    conversation.updatedAt = replyMsg.createdAt;
    await saveCurrentState();
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
  return parts.map((p) => (p && p.content ? String(p.content) : '')).join('\n').trim();
}

export async function updatePlayer(patch) {
  state.player = {
    ...state.player,
    ...patch,
    avatar: patch.avatar
      ? { type: 'emoji', value: (patch.avatar.value || patch.avatar) }
      : state.player.avatar
  };
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

// ---- message 工廠：套用 senderType→role 映射（第七節）----
//
// 映射規則（必須一致）：
//   senderType "player"    → role "user"，     senderId = "player"
//   senderType "character" → role "assistant"，senderId = 該角色 id
//   senderType "system"    → role "system"
//
// role 對應未來 AI API 的 message role；senderType + senderId 用於區分「群聊中多個
// 角色都是 assistant」的情境（未來群聊時，靠 senderId 分辨是哪個角色）。
function makeMessage({ conversationId, senderType, senderId, parts, usage }) {
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
    createdAt: now()
  };
  // usage 為選填：只有真 API 回覆的 assistant message 才寫入
  // { promptTokens, completionTokens, model }。player / mock 不寫。
  if (usage && typeof usage === 'object') {
    msg.usage = {
      promptTokens: Number(usage.promptTokens) || 0,
      completionTokens: Number(usage.completionTokens) || 0,
      model: usage.model || ''
    };
  }
  return msg;
}

// 供 backupService 在清空 / 匯入後重設 store 記憶體狀態使用。
export async function resetToState(newState) {
  state = newState;
  await reloadCurrentMessages();
  notify();
}

export function getConfig() {
  return config;
}

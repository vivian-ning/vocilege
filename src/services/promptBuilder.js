// src/services/promptBuilder.js
//
// buildPrompt 只負責「組 prompt」，不負責呼叫 API；呼叫 API 是 aiService 的職責。
//
// V3：回傳「快取友善」的分區結構 { systemBlocks, messages }：
//   - systemBlocks：[{ text, cache:true 靜態區 }, { text, cache:false 動態區 }]
//       靜態區＝穩定前綴（全域 Prompt → 角色設定 → 玩家設定/對話人設 → locked 記憶
//               → 輸出格式指示），逐字不變，適合進提示詞快取。
//       動態區＝每輪可能變動的內容（非 locked 的注入記憶等），一律放末尾。
//   - messages：[{ role: "user"|"assistant", content }]，最近聊天紀錄（上限 RECENT_LIMIT）
//
// 鐵律：靜態區內不得出現任何每輪變動的內容（時間戳、相識天數、token 數字、
// 最新訊息等一律禁止）。若未來要讓角色知道今天日期，放動態區。
//
// aiService 依 provider 取用：
//   - anthropic        ：system 為 block 陣列，靜態 block 帶 cache_control
//   - openai-compatible / gemini：把 systemBlocks 依序串接為單一 system 字串即可
//     （前綴快取由 provider 自動處理，分區順序本身就是優化）。

const RECENT_LIMIT = 30; // 最近聊天紀錄取樣上限（可調整）。

// 固定的輸出格式指示：要求模型把旁白與對話分開，方便 parseReplyToParts 還原成 parts。
// 對話 → 純文字；旁白（動作 / 神態 / 場景）→ 獨立成段並以全形星號包裹。
export const OUTPUT_FORMAT_INSTRUCTION = [
  '【輸出格式要求】',
  '1. 角色說出口的對話，直接輸出純文字。',
  '2. 旁白（動作、神態、場景描寫）獨立成一段，並以全形星號包裹，例如：＊他抬起頭，把筆記闔上。＊',
  '3. 對話與旁白請分段呈現，不要把星號寫在對話中間。'
].join('\n');

export function buildPrompt({
  conversation,
  activeCharacter,
  characters,      // 未來群聊使用
  player,
  messages,
  memories,        // V3：角色記憶（依 characterId 過濾）
  worldEntries,    // 未來世界書使用
  globalPrompts,   // V2：全域 Prompt 存放區（套用到全部角色）
  mode,
  memoryInjectionLimit // V3：非 locked 記憶注入上限（預設 10）
}) {
  const character = activeCharacter || {};
  const p = player || {};

  // 對話層級人設覆蓋（任務四）：playerPersona 的非空欄位優先於全域 player 對應欄位。
  // 覆蓋值屬於靜態區——切換人設會使快取失效一次，屬預期行為。
  const persona = conversation && conversation.playerPersona ? conversation.playerPersona : null;
  const playerName =
    (persona && persona.name && persona.name.trim()) || p.playerName || '玩家';
  const playerDescRaw =
    (persona && persona.description && persona.description.trim()) ||
    (p.playerDescription || '').trim();

  // 記憶選取：locked → 靜態區、general（非 locked）→ 動態區。
  const { locked, general } = selectInjectedMemories(memories, character.id, memoryInjectionLimit);

  // ---- 靜態區（穩定前綴，逐字不變）----
  const staticParts = [];

  // 1) 全域 Prompt（enabled，依 order）。
  const globalBlocks = collectGlobalPromptText(globalPrompts);
  if (globalBlocks) staticParts.push(globalBlocks);

  // 2) 角色核心設定。
  const charParts = [];
  if (character.systemPrompt) charParts.push(character.systemPrompt.trim());
  if (character.personality) charParts.push(`【個性】${character.personality.trim()}`);
  if (character.scenario) charParts.push(`【情境】${character.scenario.trim()}`);
  if (character.speechStyle) charParts.push(`【說話風格】${character.speechStyle.trim()}`);
  if (charParts.length) staticParts.push(charParts.join('\n'));

  // 3) 玩家設定（或對話人設覆蓋）。
  const playerDesc = playerDescRaw ? `（${playerDescRaw}）` : '';
  staticParts.push(`【對話對象】${playerName}${playerDesc}`);

  // 4) locked 記憶（全部、全文；變動頻率低，適合進快取）。
  const lockedText = memoriesToText(locked);
  if (lockedText) {
    staticParts.push(`【關於你與${playerName}的核心記憶（請始終記住並遵循）】\n${lockedText}`);
  }

  // 5) 輸出模式 + 輸出格式要求（穩定，放靜態區末尾）。
  staticParts.push(`【輸出模式】${describeMode(mode)}`);
  staticParts.push(OUTPUT_FORMAT_INSTRUCTION);

  const staticText = staticParts.join('\n\n');

  // ---- 動態區（每輪可能變動；不進穩定前綴）----
  const dynamicParts = [];
  const generalText = memoriesToText(general);
  if (generalText) {
    dynamicParts.push(`【關於${playerName}與你的記憶】\n${generalText}`);
  }
  const dynamicText = dynamicParts.join('\n\n');

  // 本輪實際注入 prompt 的記憶 id（locked + general），供 store 更新
  // lastRecalledAt / recallCount。
  const injectedMemoryIds = locked.concat(general).map((m) => m.id);

  // 最近聊天紀錄 → 依 message.role 轉為 { role, content } 序列。
  const recent = (messages || []).slice(-RECENT_LIMIT);
  const history = recent
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
    .map((m) => ({ role: m.role, content: partsToText(m.parts) }))
    .filter((m) => m.content && m.content.trim());

  return {
    systemBlocks: [
      { text: staticText, cache: true },
      { text: dynamicText, cache: false } // 可能為空字串。
    ],
    messages: history,
    mode: mode || 'mixed',
    meta: {
      conversationId: conversation ? conversation.id : '',
      characterName: character.name || '',
      playerName,
      injectedMemoryIds
    }
  };
}

// 記憶選取（純函式，供 buildPrompt 與角色頁「注入估算」共用）：
//   - 只取該角色、status === "active" 的記憶
//   - locked：全部（不占 N 名額）
//   - general（非 locked）：依 importance 由高到低、同分以 updatedAt 新者優先，取前 limit 筆
export function selectInjectedMemories(memories, characterId, limit) {
  const all = (memories || []).filter(
    (m) => m && m.characterId === characterId && (m.status || 'active') === 'active'
  );
  const locked = all.filter((m) => m.locked);
  const general = all
    .filter((m) => !m.locked)
    .sort(
      (a, b) =>
        (b.importance || 0) - (a.importance || 0) ||
        (b.updatedAt || 0) - (a.updatedAt || 0)
    );
  const n = Number.isFinite(Number(limit)) ? Math.max(0, Math.floor(Number(limit))) : 10;
  return { locked, general: general.slice(0, n) };
}

// 把記憶清單組成注入文字（每筆一行、以「・」起頭；空 content 略過）。
function memoriesToText(list) {
  return (list || [])
    .map((m) => (m && m.content ? String(m.content).trim() : ''))
    .filter(Boolean)
    .map((t) => `・${t}`)
    .join('\n');
}

// 把 systemBlocks 依序（靜態在前、動態在後）串接為單一 system 字串。
// openai-compatible / gemini 與 mock 使用；空 block 自動略過。
export function systemBlocksToString(systemBlocks) {
  return (systemBlocks || [])
    .map((b) => (b && b.text ? String(b.text) : ''))
    .filter((t) => t && t.trim())
    .join('\n\n');
}

// 取 enabled 的全域 Prompt 區塊，依 order 升冪排序，內容以空行相連為單一字串。
// 全部關閉 / 無區塊時回傳空字串（system 不變）。
export function collectGlobalPromptText(globalPrompts) {
  const list = (globalPrompts || [])
    .filter((g) => g && g.enabled && g.content && String(g.content).trim())
    .slice()
    .sort((a, b) => (a.order || 0) - (b.order || 0));
  return list.map((g) => String(g.content).trim()).join('\n\n');
}

// 目前生效（enabled）的全域 Prompt 數量（保留供未來使用）。
export function countEnabledGlobalPrompts(globalPrompts) {
  return (globalPrompts || []).filter((g) => g && g.enabled).length;
}

function describeMode(mode) {
  switch (mode) {
    case 'message':
      return '手機訊息模式：以簡短對話泡泡為主，少量旁白。';
    case 'narrative':
      return '劇情敘事模式：以敘事旁白為主，穿插對白。';
    case 'mixed':
    default:
      return '混合模式：對白與旁白交錯，自然呈現。';
  }
}

function partsToText(parts) {
  if (!Array.isArray(parts)) return '';
  return parts.map((part) => (part && part.content ? String(part.content) : '')).join('\n');
}

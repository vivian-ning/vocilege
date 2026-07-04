// src/services/promptBuilder.js
//
// buildPrompt 只負責「組 prompt」，不負責呼叫 API；呼叫 API 是 aiService 的職責。
//
// V1：回傳結構化物件 { system, messages }，直接對應各家 Chat API 的形狀：
//   - system  ：字串，角色核心設定 + 玩家資訊 + 輸出格式要求
//   - messages：[{ role: "user"|"assistant", content }]，最近聊天紀錄（上限 RECENT_LIMIT）
//
// aiService 依 provider 取用：
//   - openai-compatible：把 system 併為 messages[0]（role: "system"）
//   - anthropic        ：system 為獨立頂層欄位，不放進 messages
//
// 其餘參數（characters、memories、worldEntries）先接住，未來擴充時才填內容
// （群聊需要 characters；記憶 / 世界書需要 memories、worldEntries）。

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
  memories,        // 未來記憶系統使用
  worldEntries,    // 未來世界書使用
  mode
}) {
  const character = activeCharacter || {};
  const p = player || {};

  // 1) system 段：角色核心設定。
  const systemParts = [];
  if (character.systemPrompt) systemParts.push(character.systemPrompt.trim());
  if (character.personality) systemParts.push(`【個性】${character.personality.trim()}`);
  if (character.scenario) systemParts.push(`【情境】${character.scenario.trim()}`);
  if (character.speechStyle) systemParts.push(`【說話風格】${character.speechStyle.trim()}`);

  // 2) 玩家資訊段。
  const playerName = p.playerName || '玩家';
  const playerDesc = p.playerDescription ? `（${p.playerDescription.trim()}）` : '';
  systemParts.push(`【對話對象】${playerName}${playerDesc}`);

  // 3) 顯示模式需求。未來 narrative / message 模式可要求不同輸出結構。
  systemParts.push(`【輸出模式】${describeMode(mode)}`);

  // 4) 輸出格式要求（固定；供 parseReplyToParts 還原 message / narration）。
  systemParts.push(OUTPUT_FORMAT_INSTRUCTION);

  const systemPrompt = systemParts.join('\n');

  // 5) 最近聊天紀錄 → 依 message.role 轉為 { role, content } 序列。
  //    role 映射在 store.makeMessage 已完成（player→user、character→assistant）；
  //    一則訊息的多個 parts 合併為單一字串，narration part 以原樣文字併入。
  //    只保留 user / assistant，system 類訊息（V0 尚無）略過。
  const recent = (messages || []).slice(-RECENT_LIMIT);
  const history = recent
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
    .map((m) => ({
      role: m.role,
      content: partsToText(m.parts)
    }))
    .filter((m) => m.content && m.content.trim());

  // 回傳結構化 prompt。mock 與真 API 都從這裡取用需要的欄位。
  return {
    system: systemPrompt,
    messages: history,
    mode: mode || 'mixed',
    meta: {
      conversationId: conversation ? conversation.id : '',
      characterName: character.name || '',
      playerName
    }
  };
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

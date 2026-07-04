// src/services/statsService.js
//
// 首頁主控台所需的訊息聚合（V2 任務二）。一次讀取 messages store 全量，計算：
//   - token 用量：今日 / 本月 / 累計 的 promptTokens、completionTokens（依 message.usage）
//   - 每角色累計用量（依 conversation → primaryCharacterId 歸戶）
//   - 每個 conversation 的最後一則訊息（時間 + 單行摘要），供角色卡片顯示
//
// mock 回覆沒有 usage，自然不列入 token 統計。
//
// 聚合結果快取於記憶體；store 在訊息異動（送出 / 匯入 / 清空 / 刪除角色）後呼叫
// invalidateStats() 使快取失效，下次首頁重繪時重算。

import { getAllMessages } from '../db/indexeddb.js';

let cache = null;

export function invalidateStats() {
  cache = null;
}

// 依本地時區判斷 ts 是否落在今天 / 本月。
function isSameLocalDay(ts, ref) {
  const a = new Date(ts);
  return a.getFullYear() === ref.getFullYear() &&
    a.getMonth() === ref.getMonth() &&
    a.getDate() === ref.getDate();
}
function isSameLocalMonth(ts, ref) {
  const a = new Date(ts);
  return a.getFullYear() === ref.getFullYear() && a.getMonth() === ref.getMonth();
}

function partsToSnippet(parts) {
  if (!Array.isArray(parts)) return '';
  const text = parts
    .map((p) => (p && p.content != null ? String(p.content) : ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text;
}

// 計算聚合。state 提供 conversation → primaryCharacterId 對照（用於每角色歸戶）。
async function compute(state) {
  const all = await getAllMessages();
  const ref = new Date();

  const zero = () => ({ prompt: 0, completion: 0 });
  const today = zero();
  const month = zero();
  const total = zero();
  const perCharacter = {}; // characterId -> { prompt, completion }
  const lastByConversation = {}; // conversationId -> { createdAt, snippet }

  // conversationId -> primaryCharacterId
  const convToChar = {};
  for (const conv of (state.conversations || [])) {
    if (conv && conv.type === 'direct') convToChar[conv.id] = conv.primaryCharacterId;
  }

  for (const m of all) {
    if (!m) continue;

    // 最後訊息（每 conversation 取 createdAt 最大者）
    const prev = lastByConversation[m.conversationId];
    const ts = m.createdAt || 0;
    if (!prev || ts > prev.createdAt) {
      lastByConversation[m.conversationId] = { createdAt: ts, snippet: partsToSnippet(m.parts) };
    }

    // token 用量（只有帶 usage 的真 API 回覆計入）
    if (m.usage) {
      const p = Number(m.usage.promptTokens) || 0;
      const c = Number(m.usage.completionTokens) || 0;
      total.prompt += p; total.completion += c;
      if (isSameLocalMonth(ts, ref)) { month.prompt += p; month.completion += c; }
      if (isSameLocalDay(ts, ref)) { today.prompt += p; today.completion += c; }

      const charId = convToChar[m.conversationId];
      if (charId) {
        if (!perCharacter[charId]) perCharacter[charId] = zero();
        perCharacter[charId].prompt += p;
        perCharacter[charId].completion += c;
      }
    }
  }

  for (const u of (state.usageLog || [])) {
    if (!u) continue;
    const ts = u.at || 0;
    const p = Number(u.promptTokens) || 0;
    const c = Number(u.completionTokens) || 0;
    total.prompt += p; total.completion += c;
    if (isSameLocalMonth(ts, ref)) { month.prompt += p; month.completion += c; }
    if (isSameLocalDay(ts, ref)) { today.prompt += p; today.completion += c; }
    if (u.characterId) {
      if (!perCharacter[u.characterId]) perCharacter[u.characterId] = zero();
      perCharacter[u.characterId].prompt += p;
      perCharacter[u.characterId].completion += c;
    }
  }

  return { today, month, total, perCharacter, lastByConversation };
}

// 取得聚合（帶快取）。state 只用於每角色歸戶對照，不進入快取鍵；訊息異動時以
// invalidateStats() 主動失效即可。
export async function getStats(state) {
  if (!cache) {
    cache = await compute(state);
  }
  return cache;
}

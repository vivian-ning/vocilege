// src/utils/id.js
// 產生唯一 id。優先使用 crypto.randomUUID，缺乏時退回時間 + 隨機字串。

export function generateId(prefix = '') {
  let core;
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    core = crypto.randomUUID();
  } else {
    core = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
  return prefix ? `${prefix}_${core}` : core;
}

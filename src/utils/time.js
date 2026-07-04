// src/utils/time.js
// 時間相關工具。

export function now() {
  return Date.now();
}

// 回傳 YYYY-MM-DD（本地時間），用於匯出檔名。
export function dateStamp(ts = Date.now()) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 顯示用的時間字串（HH:MM）。
export function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${min}`;
}

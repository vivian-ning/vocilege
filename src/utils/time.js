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

// 把 date input 的 "YYYY-MM-DD" 解析成當地時間當天 00:00 的 ms 時間戳。
// 無效輸入回傳 0。與 dateStamp 互為反向（皆採本地時區）。
export function parseDateInput(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str || '').trim());
  if (!m) return 0;
  const y = Number(m[1]);
  const mon = Number(m[2]);
  const d = Number(m[3]);
  const ts = new Date(y, mon - 1, d).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

// 顯示用的時間字串（HH:MM）。
export function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${min}`;
}

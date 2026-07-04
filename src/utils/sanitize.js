// src/utils/sanitize.js
//
// escapeHTML 只是「防禦縱深」的轉義工具，並非「先清理再 innerHTML」的許可。
// 本專案全面禁止對含使用者輸入的內容使用 innerHTML；一律使用 textContent /
// createElement 建構 DOM（見第十五節）。此函式保留給未來真的需要輸出 HTML
// 字串的極少數場合（例如產生報表），仍需搭配謹慎審查。

export function escapeHTML(input) {
  const str = input == null ? '' : String(input);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

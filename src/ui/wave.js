// src/ui/wave.js
//
// 聲波等化器記號——拾聲的品牌元素（美化版）。
// nav logo 與聊天「輸入中」指示共用；動畫在 CSS（.wave-bars），
// prefers-reduced-motion 時自動停格為靜態波形。

export function createWaveBars() {
  const wrap = document.createElement('span');
  wrap.className = 'wave-bars';
  wrap.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 4; i++) wrap.appendChild(document.createElement('i'));
  return wrap;
}

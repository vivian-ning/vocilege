// src/ui/avatar.js
//
// 頭貼渲染 helper（V2 任務 4.2 渲染）。統一 emoji / image 兩型的顯示：
//   - emoji：直接 textContent
//   - image：以 URL.createObjectURL（assetService 快取）設為 background-image；
//            讀不到 asset 時 fallback 顯示 🙂
//
// 全程 textContent / style，不使用 innerHTML。

import { getObjectURL } from '../services/assetService.js';

// 對既有元素套用頭貼內容（會清掉舊內容）。image 為非同步載入，載入前先顯示 🙂 佔位。
export function applyAvatar(el, avatar) {
  if (!el) return;
  el.textContent = '';
  el.style.backgroundImage = '';
  el.classList.remove('avatar-image');

  if (avatar && avatar.type === 'image' && avatar.assetId) {
    el.textContent = '🙂'; // 載入中 / fallback 佔位
    const assetId = avatar.assetId;
    getObjectURL(assetId)
      .then((url) => {
        if (!url) return; // 讀不到 → 保留 emoji fallback
        el.textContent = '';
        el.classList.add('avatar-image');
        el.style.backgroundImage = `url("${url}")`;
      })
      .catch(() => { /* 保留 emoji fallback */ });
    return;
  }

  el.textContent = (avatar && avatar.value) || '🙂';
}

// 建立一個頭貼元素（div.avatar + 額外 class），並套用內容。
export function createAvatarEl(avatar, extraClass) {
  const el = document.createElement('div');
  el.className = 'avatar' + (extraClass ? ' ' + extraClass : '');
  applyAvatar(el, avatar);
  return el;
}

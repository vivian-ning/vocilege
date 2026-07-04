// src/ui/avatarInput.js
//
// 頭貼編輯控制項（V2 任務 4.2）。供角色編輯器與玩家編輯器共用。
// 支援：emoji 輸入、上傳圖片（file input, accept image/*）、切回 emoji。
//
// 上傳後立即以 canvas 壓成 256×256 WebP 存入 assets store，並更新預覽。
//
// 孤兒 asset 處理：
//   - 本控制項只追蹤「這次 session 內新上傳、尚未提交的 asset」（uploadedAssetId）。
//   - 換一張新圖 / 切回 emoji：立即刪除上一張尚未提交的上傳。
//   - 表單取消（discard）：刪除尚未提交的上傳。
//   - 表單儲存成功（commit）：放手，交由 store 依「舊頭貼被取代」規則刪除舊 asset。

import { saveAvatarAsset, deleteAvatarAsset } from '../services/assetService.js';
import { applyAvatar } from './avatar.js';

function normalize(avatar) {
  if (avatar && avatar.type === 'image' && avatar.assetId) {
    return { type: 'image', assetId: avatar.assetId };
  }
  if (avatar && avatar.value) return { type: 'emoji', value: String(avatar.value) };
  return { type: 'emoji', value: '🙂' };
}

// initialAvatar：目前頭貼物件。回傳 { el, getValue, commit, discard }。
export function buildAvatarInput(initialAvatar) {
  const initial = normalize(initialAvatar);
  const initialImageId = initial.type === 'image' ? initial.assetId : null;

  let current = initial;        // 目前選定的頭貼物件
  let uploadedAssetId = null;   // 本次新上傳、尚未提交的 assetId（需要時清除）

  const wrap = document.createElement('div');
  wrap.className = 'avatar-input form-field';

  const label = document.createElement('span');
  label.className = 'form-label';
  label.textContent = '頭貼';
  wrap.appendChild(label);

  const row = document.createElement('div');
  row.className = 'avatar-input-row';

  // 預覽
  const preview = document.createElement('div');
  preview.className = 'avatar avatar-preview';
  applyAvatar(preview, current);
  row.appendChild(preview);

  // emoji 輸入
  const emojiInput = document.createElement('input');
  emojiInput.type = 'text';
  emojiInput.className = 'form-control avatar-emoji-input';
  emojiInput.placeholder = '🙂';
  emojiInput.value = current.type === 'emoji' ? current.value : '';
  emojiInput.maxLength = 8;
  row.appendChild(emojiInput);

  wrap.appendChild(row);

  // 上傳 / 切回 emoji 按鈕列
  const btnRow = document.createElement('div');
  btnRow.className = 'avatar-input-buttons';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.className = 'file-input';

  const uploadBtn = document.createElement('button');
  uploadBtn.type = 'button';
  uploadBtn.className = 'btn';
  uploadBtn.textContent = '上傳頭貼';
  uploadBtn.addEventListener('click', () => fileInput.click());

  const emojiBtn = document.createElement('button');
  emojiBtn.type = 'button';
  emojiBtn.className = 'btn';
  emojiBtn.textContent = '使用 emoji';

  const status = document.createElement('span');
  status.className = 'avatar-input-status';

  btnRow.appendChild(uploadBtn);
  btnRow.appendChild(emojiBtn);
  btnRow.appendChild(status);
  wrap.appendChild(btnRow);
  wrap.appendChild(fileInput);

  // 丟棄「尚未提交的上傳」（切換 / 取消時呼叫）。
  function discardUploaded() {
    if (uploadedAssetId && uploadedAssetId !== initialImageId) {
      deleteAvatarAsset(uploadedAssetId);
    }
    uploadedAssetId = null;
  }

  function switchToEmoji() {
    discardUploaded();
    const val = emojiInput.value.trim() || '🙂';
    current = { type: 'emoji', value: val };
    applyAvatar(preview, current);
  }

  emojiInput.addEventListener('input', () => {
    // 只要開始打 emoji 就視為切回 emoji 型。
    switchToEmoji();
  });
  emojiBtn.addEventListener('click', switchToEmoji);

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    status.textContent = '處理中…';
    uploadBtn.disabled = true;
    try {
      // 取代上一張尚未提交的上傳。
      discardUploaded();
      const assetId = await saveAvatarAsset(file);
      uploadedAssetId = assetId;
      current = { type: 'image', assetId };
      applyAvatar(preview, current);
      status.textContent = '已上傳 ✓';
    } catch (err) {
      status.textContent = (err && err.message) || '上傳失敗';
    } finally {
      uploadBtn.disabled = false;
    }
  });

  return {
    el: wrap,
    getValue: () => current,
    // 表單成功儲存後呼叫：放手，不再視為「未提交」（避免之後誤刪）。
    commit: () => { uploadedAssetId = null; },
    // 表單取消時呼叫：刪除未提交的上傳。
    discard: () => { discardUploaded(); }
  };
}

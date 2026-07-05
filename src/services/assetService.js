// src/services/assetService.js
//
// 頭貼 asset 服務（V2 任務四）。負責：
//   - 把使用者上傳的圖片以 canvas 縮放裁切為 256×256（cover），輸出 WebP（退 JPEG），
//     存入 IndexedDB assets store
//   - 維護 assetId → objectURL 的快取 Map，供 UI 以 URL.createObjectURL 顯示；
//     更換 / 刪除時 revoke 舊 URL，避免記憶體洩漏
//   - 備份用 base64 編解碼（blob ↔ base64）
//
// buildPrompt / aiService 不會碰到這裡；本模組只服務 UI 與 backupService。

import { putAsset, getAsset, deleteAsset } from '../db/indexeddb.js';
import { generateId } from '../utils/id.js';

const AVATAR_SIZE = 256;
const WEBP_QUALITY = 0.85;

// assetId → objectURL。同一 asset 只建立一次 objectURL 並重用；revoke 後移除。
const urlCache = new Map();

// ---- 上傳處理 ----

// 讀取 File → canvas cover 裁切 256×256 → WebP（退 JPEG）Blob。
function resizeToAvatarBlob(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = AVATAR_SIZE;
        canvas.height = AVATAR_SIZE;
        const ctx = canvas.getContext('2d');

        // cover 裁切：以較大縮放比填滿正方形，置中裁掉超出部分。
        const scale = Math.max(AVATAR_SIZE / img.width, AVATAR_SIZE / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        const dx = (AVATAR_SIZE - w) / 2;
        const dy = (AVATAR_SIZE - h) / 2;
        ctx.drawImage(img, dx, dy, w, h);
        URL.revokeObjectURL(objectUrl);

        // 先嘗試 WebP；不支援時（回傳 null）退回 JPEG。
        canvas.toBlob((blob) => {
          if (blob) {
            resolve({ blob, mime: 'image/webp' });
            return;
          }
          canvas.toBlob((jpeg) => {
            if (jpeg) resolve({ blob: jpeg, mime: 'image/jpeg' });
            else reject(new Error('影像編碼失敗'));
          }, 'image/jpeg', WEBP_QUALITY);
        }, 'image/webp', WEBP_QUALITY);
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('無法讀取圖片檔'));
    };
    img.src = objectUrl;
  });
}

function resizeToMaxSideBlob(file, maxSide) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxSide / Math.max(img.width || 1, img.height || 1));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(objectUrl);
        canvas.toBlob((blob) => {
          if (blob) {
            resolve({ blob, mime: 'image/webp' });
            return;
          }
          canvas.toBlob((jpeg) => {
            if (jpeg) resolve({ blob: jpeg, mime: 'image/jpeg' });
            else reject(new Error('影像編碼失敗'));
          }, 'image/jpeg', WEBP_QUALITY);
        }, 'image/webp', WEBP_QUALITY);
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('無法讀取圖片檔'));
    };
    img.src = objectUrl;
  });
}

// 上傳並存入 assets store，回傳新的 assetId。
export async function saveAvatarAsset(file) {
  const { blob, mime } = await resizeToAvatarBlob(file);
  const id = generateId('asset');
  await putAsset({ id, kind: 'avatar', blob, mime, createdAt: Date.now() });
  return id;
}

export async function saveImageAsset(file, kind, maxSide) {
  const { blob, mime } = await resizeToMaxSideBlob(file, maxSide);
  const id = generateId('asset');
  await putAsset({ id, kind: kind || 'photo', blob, mime, createdAt: Date.now() });
  return id;
}

// ---- objectURL 快取 ----

// 取得（必要時建立）asset 的 objectURL；讀不到回傳 null（呼叫端 fallback emoji）。
export async function getObjectURL(assetId) {
  if (!assetId) return null;
  if (urlCache.has(assetId)) return urlCache.get(assetId);
  let asset = null;
  try {
    asset = await getAsset(assetId);
  } catch (e) {
    return null;
  }
  if (!asset || !asset.blob) return null;
  const url = URL.createObjectURL(asset.blob);
  urlCache.set(assetId, url);
  return url;
}

export function revokeObjectURL(assetId) {
  const url = urlCache.get(assetId);
  if (url) {
    URL.revokeObjectURL(url);
    urlCache.delete(assetId);
  }
}

// 刪除 asset（DB）並 revoke 其 objectURL。用於更換 / 刪除頭貼、刪除角色。
export async function deleteAvatarAsset(assetId) {
  if (!assetId) return;
  revokeObjectURL(assetId);
  try {
    await deleteAsset(assetId);
  } catch (e) {
    // 刪不到就算了（可能已不存在）；不阻斷主流程。
  }
}

export async function deleteStoredAsset(assetId) {
  if (!assetId) return;
  revokeObjectURL(assetId);
  try {
    await deleteAsset(assetId);
  } catch (e) {
    // 刪不到就算了（可能已不存在）。
  }
}

// ---- 備份 base64 編解碼 ----

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result || '');
      const comma = s.indexOf(',');
      resolve(comma >= 0 ? s.slice(comma + 1) : s); // 去掉 data:...;base64, 前綴
    };
    reader.onerror = () => reject(reader.error || new Error('base64 編碼失敗'));
    reader.readAsDataURL(blob);
  });
}

export function base64ToBlob(base64, mime) {
  const binary = atob(base64 || '');
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime || 'image/webp' });
}

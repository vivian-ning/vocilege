// src/services/backupService.js
//
// 備份 / 匯入 / 清空（第十三節 + V2 任務 4.3 頭貼備份相容）。

import {
  getAllMessages,
  clearAll,
  saveState,
  bulkAddMessages,
  getAsset,
  putAsset,
  getAllAssets
} from '../db/indexeddb.js';
import { createDefaultState, normalizeState } from '../state/schema.js';
import { migrateState, CURRENT_SCHEMA_VERSION } from '../state/migrations.js';
import { validateBackup } from '../utils/validation.js';
import { getState, getConfig, saveCurrentState, resetToState, markBackupDone } from '../state/store.js';
import { blobToBase64, base64ToBlob } from './assetService.js';
import { dateStamp } from '../utils/time.js';

// 收集 state 內所有 image 型頭貼引用到的 assetId（角色 + 玩家）。
function collectAvatarAssetIds(state) {
  const ids = new Set();
  const add = (avatar) => {
    if (avatar && avatar.type === 'image' && avatar.assetId) ids.add(avatar.assetId);
  };
  for (const c of (state.characters || [])) add(c && c.avatar);
  add(state.player && state.player.avatar);
  return [...ids];
}

// ---- 匯出 ----
// 收集 state + 全部 messages + 頭貼 asset（base64 內嵌）打包成一個 JSON 並觸發下載。
export async function exportData() {
  const payload = await buildBackupPayload();
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `local-character-chat-backup-${dateStamp()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  // 匯出成功 → 更新 lastBackupAt（供首頁備份提醒）。
  await markBackupDone();

  return { ok: true };
}

export async function exportFullArchive() {
  const payload = await buildFullArchivePayload();
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `local-character-chat-full-archive-${dateStamp()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  await markBackupDone();
  return { ok: true };
}

export async function buildBackupPayload() {
  const state = getState();
  const allMessages = await getAllMessages();
  const exportState = sanitizeStateForBackup(state);
  const avatarAssets = [];
  for (const id of collectAvatarAssetIds(state)) {
    const asset = await getAsset(id);
    if (asset && asset.blob) {
      avatarAssets.push({
        id: asset.id,
        kind: asset.kind || 'avatar',
        mime: asset.mime || 'image/webp',
        createdAt: asset.createdAt || Date.now(),
        dataBase64: await blobToBase64(asset.blob)
      });
    }
  }
  return {
    app: 'local-character-chat',
    exportedAt: Date.now(),
    schemaVersion: exportState.schemaVersion,
    state: exportState,
    messages: allMessages,
    avatarAssets
  };
}

export async function buildFullArchivePayload() {
  const state = getState();
  const allMessages = await getAllMessages();
  const exportState = sanitizeStateForBackup(state);
  const assets = [];
  for (const asset of await getAllAssets()) {
    if (!asset || !asset.id || !asset.blob) continue;
    assets.push({
      id: asset.id,
      kind: asset.kind || 'asset',
      mime: asset.mime || 'application/octet-stream',
      createdAt: asset.createdAt || Date.now(),
      dataBase64: await blobToBase64(asset.blob)
    });
  }
  return {
    app: 'local-character-chat',
    archiveKind: 'full',
    exportedAt: Date.now(),
    schemaVersion: exportState.schemaVersion,
    state: exportState,
    messages: allMessages,
    assets
  };
}

function sanitizeStateForBackup(state) {
  const apiSettings = { ...(state.apiSettings || {}) };
  apiSettings.apiKey = '';
  if ('vigilVapidKey' in apiSettings) apiSettings.vigilVapidKey = '';
  const exportState = {
    ...state,
    apiSettings
  };
  if ('vigilVapidKey' in exportState) delete exportState.vigilVapidKey;
  return exportState;
}

export function exportVigilCharacters() {
  const state = getState();
  const playerName = (state.player && state.player.playerName) || '';
  const characters = (state.characters || [])
    .filter((character) => character && character.vigil && character.vigil.enabled === true)
    .map((character) => {
      const vigil = character.vigil || {};
      return {
        name: character.name || '未命名角色',
        persona: String(vigil.pushPersona || '').trim() || fallbackPersona(character),
        playerName: String(vigil.nickname || '').trim() || playerName,
        dailyLimit: Math.max(0, Math.floor(Number(vigil.dailyLimit) || 0)),
        fallbackLines: Array.isArray(vigil.fallbackLines)
          ? vigil.fallbackLines.filter((line) => typeof line === 'string' && line.trim()).map((line) => line.trim())
          : []
      };
    });

  if (!characters.length) {
    return { ok: false, reason: 'empty' };
  }

  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    characters
  };
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'vigil-characters.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return { ok: true, count: characters.length, payload };
}

function fallbackPersona(character) {
  return [
    character.personality,
    character.description,
    character.scenario,
    character.systemPrompt,
    character.speechStyle,
    character.name
  ].filter(Boolean).join('\n').slice(0, 100);
}

// ---- 匯入 ----
// all-or-nothing：驗證 + migration 全部在記憶體完成且成功後，才開始寫入 IndexedDB。
// 任何一步失敗即丟出錯誤，現有資料不得有任何變動。
export async function importData(rawText) {
  let data;
  try {
    data = JSON.parse(rawText);
  } catch (e) {
    throw new Error('匯入失敗：檔案不是有效的 JSON');
  }

  // 1) 結構驗證
  const { ok, errors } = validateBackup(data);
  if (!ok) {
    throw new Error('匯入失敗：結構驗證未通過\n- ' + errors.join('\n- '));
  }

  const incomingState = data.state;

  // 2) schemaVersion 語意驗證
  const v = incomingState.schemaVersion;
  if (typeof v !== 'number') {
    throw new Error('匯入失敗：備份缺少 schemaVersion');
  }
  if (v > CURRENT_SCHEMA_VERSION) {
    throw new Error('匯入失敗：備份來自較新版本（schemaVersion 大於目前支援版本）');
  }

  // 3) 若版本較舊，先跑 migration 升級；成功後才繼續。
  let migrated = incomingState;
  if (v < CURRENT_SCHEMA_VERSION) {
    migrated = migrateState(incomingState);
  }

  // 4) 補齊欄位
  let nextState = normalizeState(migrated);

  // 5) 保留本機現有的 apiSettings.apiKey 與 rememberApiKey（匯出檔已排除 key，
  //    若全量覆蓋會把本機的 key 洗掉）。apiSettings 採合併而非覆蓋。
  const localState = getState();
  nextState.apiSettings = {
    ...nextState.apiSettings,
    apiKey: localState.apiSettings.apiKey,
    rememberApiKey: localState.apiSettings.rememberApiKey
  };

  // 6) 頭貼相容（V2 任務 4.3）：
  //    - 缺 avatarAssets 或個別 asset 缺漏「不得整筆失敗」：對應 image 頭貼 fallback 回 emoji。
  //    - 舊備份（v1 / v2）沒有 avatarAssets 與 image 型頭貼，這裡自然不動任何東西。
  const fullAssets = Array.isArray(data.assets) ? data.assets : null;
  const avatarAssets = fullAssets || (Array.isArray(data.avatarAssets) ? data.avatarAssets : []);
  const presentIds = new Set(avatarAssets.map((a) => a && a.id).filter(Boolean));
  const fallbackMissingAvatar = (avatar) => {
    if (avatar && avatar.type === 'image' && !presentIds.has(avatar.assetId)) {
      return { type: 'emoji', value: '🙂' };
    }
    return avatar;
  };
  nextState.characters = (nextState.characters || []).map((c) => (
    c ? { ...c, avatar: fallbackMissingAvatar(c.avatar) } : c
  ));
  if (nextState.player) {
    nextState.player = { ...nextState.player, avatar: fallbackMissingAvatar(nextState.player.avatar) };
  }

  const nextMessages = Array.isArray(data.messages) ? data.messages : [];

  // ---- 到這裡所有驗證 / migration 都成功，才開始動 IndexedDB ----
  await clearAll();
  await saveState(nextState);
  await bulkAddMessages(nextMessages);

  // 還原 asset（base64 → Blob → assets store）。個別 asset 解碼失敗只略過該張。
  for (const a of avatarAssets) {
    if (!a || !a.id || !a.dataBase64) continue;
    try {
      const blob = base64ToBlob(a.dataBase64, a.mime);
      await putAsset({
        id: a.id,
        kind: a.kind || 'avatar',
        blob,
        mime: a.mime || 'image/webp',
        createdAt: a.createdAt || Date.now()
      });
    } catch (e) {
      // 略過壞掉的 asset；渲染時 fallback emoji。
    }
  }

  // 更新 store 記憶體狀態並重新渲染。
  await resetToState(nextState);

  return { ok: true };
}

// ---- 清空 ----
// confirm 由 UI 層負責。這裡清空所有 store、重建 default state 並渲染。
export async function clearData() {
  await clearAll();
  const fresh = createDefaultState(getConfig());
  // 保留本機 apiKey / rememberApiKey？清空的語意是「全部清掉」，因此連 apiSettings
  // 一併回到預設（key 為空）。
  await resetToState(fresh);
  await saveCurrentState();
  return { ok: true };
}

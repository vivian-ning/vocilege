// src/services/backupService.js
//
// 備份 / 匯入 / 清空（第十三節）。

import {
  getAllMessages,
  clearAll,
  saveState,
  bulkAddMessages
} from '../db/indexeddb.js';
import { createDefaultState, normalizeState } from '../state/schema.js';
import { migrateState, CURRENT_SCHEMA_VERSION } from '../state/migrations.js';
import { validateBackup } from '../utils/validation.js';
import { getState, getConfig, saveCurrentState, resetToState } from '../state/store.js';
import { dateStamp } from '../utils/time.js';

// ---- 匯出 ----
// 收集 state + 全部 messages 打包成一個 JSON 下載並觸發下載。
export async function exportData() {
  const state = getState();
  const allMessages = await getAllMessages();

  // 匯出前必須把 apiSettings.apiKey 設為空字串（不論 rememberApiKey 為何）。
  const exportState = {
    ...state,
    apiSettings: {
      ...state.apiSettings,
      apiKey: ''
    }
  };

  const payload = {
    app: 'local-character-chat',
    exportedAt: Date.now(),
    schemaVersion: exportState.schemaVersion, // 保留 schemaVersion
    state: exportState,
    messages: allMessages
  };

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

  return { ok: true };
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

  const nextMessages = Array.isArray(data.messages) ? data.messages : [];

  // ---- 到這裡所有驗證 / migration 都成功，才開始動 IndexedDB ----
  await clearAll();
  await saveState(nextState);
  await bulkAddMessages(nextMessages);

  // 更新 store 記憶體狀態並重新渲染。
  await resetToState(nextState);

  return { ok: true };
}

// ---- 清空 ----
// confirm 由 UI 層負責。這裡清空兩個 store、重建 default state 並渲染。
export async function clearData() {
  await clearAll();
  const fresh = createDefaultState(getConfig());
  // 保留本機 apiKey / rememberApiKey？清空的語意是「全部清掉」，因此連 apiSettings
  // 一併回到預設（key 為空）。
  await resetToState(fresh);
  await saveCurrentState();
  return { ok: true };
}

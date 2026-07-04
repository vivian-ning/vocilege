// src/state/migrations.js
//
// migrateState：只處理版本升級（第九節）。若 state.schemaVersion 不存在或小於
// 目前版本，逐版升級到目前版本。
//
// 分工：migrations 管版本，schema.normalizeState 管欄位補齊，兩者不重疊。
//
// 逐版套用直到 schemaVersion === CURRENT_SCHEMA_VERSION，確保任何舊備份都能一步步
// 升級上來，而非只支援「上一版」。

import { createExampleGlobalPrompt } from './schema.js';

export const CURRENT_SCHEMA_VERSION = 3;

// 逐版升級函式表。key = 來源版本，value = 把該版 state 升到「下一版」的函式。
const migrators = {
  // v1 -> v2（V1 真 API 接入）：補齊 apiSettings.temperature / maxTokens 預設值。
  // 既有 message 不需回填 usage（維持選填），因此本步驟只動 apiSettings。
  1: (s) => {
    const api = (s.apiSettings && typeof s.apiSettings === 'object') ? { ...s.apiSettings } : {};
    if (typeof api.temperature !== 'number') api.temperature = 1;
    if (typeof api.maxTokens !== 'number') api.maxTokens = 1024;
    s.apiSettings = api;
    s.schemaVersion = 2;
    return s;
  },

  // v2 -> v3（V2 導航改版）：
  //   - 啟用 globalPrompts，並自動建立一個 enabled=false 的範例區塊
  //   - 新增 lastBackupAt（0 = 從未備份）
  //   - journals 正式啟用（結構已存在，補空陣列即可）
  //   - avatar 的 image 型不需資料轉換（舊資料皆 emoji 型，normalize 會保持原樣）
  2: (s) => {
    if (!Array.isArray(s.globalPrompts) || s.globalPrompts.length === 0) {
      s.globalPrompts = [createExampleGlobalPrompt()];
    }
    if (!Array.isArray(s.journals)) s.journals = [];
    if (typeof s.lastBackupAt !== 'number') s.lastBackupAt = 0;
    s.schemaVersion = 3;
    return s;
  },
};

export function migrateState(state) {
  let s = state && typeof state === 'object' ? { ...state } : {};

  // schemaVersion 缺失時視為最舊版本 1（V0 起點）。
  let version = typeof s.schemaVersion === 'number' ? s.schemaVersion : 1;
  s.schemaVersion = version;

  while (version < CURRENT_SCHEMA_VERSION) {
    const migrate = migrators[version];
    if (typeof migrate !== 'function') {
      // 沒有對應升級步驟卻仍低於目前版本 → 資料異常，直接跳到目前版本以避免卡死。
      s.schemaVersion = CURRENT_SCHEMA_VERSION;
      break;
    }
    s = migrate(s);
    version = s.schemaVersion;
  }

  return s;
}

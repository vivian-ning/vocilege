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

export const CURRENT_SCHEMA_VERSION = 6;

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

  // v3 -> v4（V3 角色相處頁 + 記憶系統）：
  //   - 新增 anniversaries（紀念日）空陣列
  //   - 啟用 memories / wishlists / relationshipData（結構已存在，補空陣列即可）
  //   - settings.memoryInjectionLimit 預設 10
  //   - conversation.playerPersona / message.usage.cacheRead|cacheWrite 為選填，
  //     缺值即代表未設定，無需回填（normalize 與各消費端已容忍缺漏）。
  //   本步驟純補預設值，無資料轉換。
  3: (s) => {
    if (!Array.isArray(s.anniversaries)) s.anniversaries = [];
    if (!Array.isArray(s.memories)) s.memories = [];
    if (!Array.isArray(s.wishlists)) s.wishlists = [];
    if (!Array.isArray(s.relationshipData)) s.relationshipData = [];
    const settings = (s.settings && typeof s.settings === 'object') ? { ...s.settings } : {};
    if (typeof settings.memoryInjectionLimit !== 'number') settings.memoryInjectionLimit = 10;
    s.settings = settings;
    s.schemaVersion = 4;
    return s;
  },

  // v4 -> v5: V4 feed / keepsakes / message versions / utility usage.
  4: (s) => {
    const journals = Array.isArray(s.journals) ? s.journals : [];
    const existingPosts = Array.isArray(s.posts) ? s.posts : [];
    const postIds = new Set(existingPosts.map((p) => p && p.id).filter(Boolean));
    const migratedPosts = journals
      .filter((j) => j && !postIds.has(j.id))
      .map((j) => ({
        id: j.id || `post_${Math.random().toString(36).slice(2)}`,
        authorType: 'player',
        authorId: 'player',
        content: j.content || '',
        mood: j.mood || '',
        createdAt: j.createdAt || Date.now(),
        likes: [],
        comments: []
      }));
    s.posts = existingPosts.concat(migratedPosts);
    s.journals = []; // 轉換後清空：獨白已併入迴聲，journals 留給未來角色私語（V8）

    if (!Array.isArray(s.keepsakes)) s.keepsakes = [];
    if (!Array.isArray(s.usageLog)) s.usageLog = [];
    if (typeof s.lastOpenedAt !== 'number') s.lastOpenedAt = 0;
    if (typeof s.lastGreetingAt !== 'number') s.lastGreetingAt = 0;

    const settings = (s.settings && typeof s.settings === 'object') ? { ...s.settings } : {};
    if (typeof settings.timeAwareness !== 'boolean') settings.timeAwareness = true;
    if (typeof settings.feedReactorsPerPost !== 'number') settings.feedReactorsPerPost = 2;
    if (typeof settings.feedDailyLimit !== 'number') settings.feedDailyLimit = 20;
    if (typeof settings.feedAutoPost !== 'boolean') settings.feedAutoPost = true;
    if (typeof settings.greetingAfterDays !== 'number') settings.greetingAfterDays = 3;
    if (typeof settings.dreamEnabled !== 'boolean') settings.dreamEnabled = true;
    if (typeof settings.dreamEveryMessages !== 'number') settings.dreamEveryMessages = 20;
    if (typeof settings.dreamDailyLimit !== 'number') settings.dreamDailyLimit = 10;
    s.settings = settings;

    const api = (s.apiSettings && typeof s.apiSettings === 'object') ? { ...s.apiSettings } : {};
    if (typeof api.utilityModel !== 'string') api.utilityModel = '';
    s.apiSettings = api;

    if (Array.isArray(s.conversations)) {
      s.conversations = s.conversations.map((c) => (
        c && typeof c === 'object' && typeof c.lastDreamMessageCount !== 'number'
          ? { ...c, lastDreamMessageCount: 0 }
          : c
      ));
    }

    s.schemaVersion = 5;
    return s;
  },

  // v5 -> v6: V5 media / stickers / dream toggles / Threads-style auto feed.
  5: (s) => {
    if (!Array.isArray(s.stickers)) s.stickers = [];
    if (!s.feedAutoPostLog || typeof s.feedAutoPostLog !== 'object' || Array.isArray(s.feedAutoPostLog)) {
      s.feedAutoPostLog = {};
    }

    const settings = (s.settings && typeof s.settings === 'object') ? { ...s.settings } : {};
    // V4/V5 曾錯把 feedAutoPost 預設關閉，導致角色自主發文沉默；升 v6 依規格強制打開。
    settings.feedAutoPost = true;
    if (typeof settings.dreamEveryMessages !== 'number') settings.dreamEveryMessages = 20;
    s.settings = settings;

    const api = (s.apiSettings && typeof s.apiSettings === 'object') ? { ...s.apiSettings } : {};
    if (typeof api.visionEnabled !== 'boolean') api.visionEnabled = false;
    s.apiSettings = api;

    if (Array.isArray(s.memories)) {
      s.memories = s.memories.map((m) => (
        m && typeof m === 'object' && typeof m.enabled !== 'boolean'
          ? { ...m, enabled: true }
          : m
      ));
    }

    s.schemaVersion = 6;
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

  // 防禦性修復：v5 初版的 4→5 migration 漏了「轉換後清空 journals」，
  // 已升到 v5 的資料可能殘留舊獨白。此處補做一次同樣的轉換（以 id 去重，
  // 冪等安全），確保獨白不會卡在死掉的 journals 陣列裡。
  if (s.schemaVersion >= 5 && Array.isArray(s.journals) && s.journals.length) {
    const existingPosts = Array.isArray(s.posts) ? s.posts : [];
    const postIds = new Set(existingPosts.map((p) => p && p.id).filter(Boolean));
    const migratedPosts = s.journals
      .filter((j) => j && !postIds.has(j.id))
      .map((j) => ({
        id: j.id || `post_${Math.random().toString(36).slice(2)}`,
        authorType: 'player',
        authorId: 'player',
        content: j.content || '',
        mood: j.mood || '',
        createdAt: j.createdAt || Date.now(),
        likes: [],
        comments: []
      }));
    s.posts = existingPosts.concat(migratedPosts);
    s.journals = [];
  }

  return s;
}

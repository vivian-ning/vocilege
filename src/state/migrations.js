// src/state/migrations.js
//
// migrateState：只處理版本升級（第九節）。若 state.schemaVersion 不存在或小於
// 目前版本，逐版升級到目前版本。
//
// 分工：migrations 管版本，schema.normalizeState 管欄位補齊，兩者不重疊。
//
// 逐版套用直到 schemaVersion === CURRENT_SCHEMA_VERSION，確保任何舊備份都能一步步
// 升級上來，而非只支援「上一版」。

import { createDefaultAppearance, createDefaultEcho, createExampleGlobalPrompt } from './schema.js';

export const CURRENT_SCHEMA_VERSION = 21;

const DEFAULT_VIGIL = {
  enabled: false,
  dailyLimit: 2,
  nickname: '',
  pushPersona: '',
  fallbackLines: []
};

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
  //   - 新增 anniversaries（節拍）空陣列
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

  // v6 -> v7（美化版）：主題改為「配色 × 明暗」兩欄位。
  //   theme: blue（藍噪）/ pink（粉噪）/ brown（褐噪）；themeMode: light / dark。
  //   舊值映射：cream/warm→brown·light、night→blue·dark、sea/fog→blue·light、rose→pink·light。
  6: (s) => {
    const settings = (s.settings && typeof s.settings === 'object') ? { ...s.settings } : {};
    const legacy = {
      cream: ['brown', 'light'], warm: ['brown', 'light'],
      night: ['blue', 'dark'], sea: ['blue', 'light'],
      fog: ['blue', 'light'], rose: ['pink', 'light']
    };
    const current = settings.theme;
    if (legacy[current]) {
      settings.theme = legacy[current][0];
      settings.themeMode = legacy[current][1];
    } else if (!['blue', 'pink', 'brown'].includes(current)) {
      settings.theme = 'blue';
      settings.themeMode = 'light';
    }
    if (settings.themeMode !== 'dark' && settings.themeMode !== 'light') settings.themeMode = 'light';
    s.settings = settings;
    s.schemaVersion = 7;
    return s;
  },

  // v7 -> v8（V5.6）：四配色、移除 brown，新增思考串設定。
  7: (s) => {
    const settings = (s.settings && typeof s.settings === 'object') ? { ...s.settings } : {};
    if (settings.theme === 'brown') {
      settings.theme = 'violet';
    } else if (!['blue', 'pink', 'green', 'violet'].includes(settings.theme)) {
      settings.theme = 'blue';
    }
    if (settings.themeMode !== 'dark' && settings.themeMode !== 'light') settings.themeMode = 'light';
    s.settings = settings;

    const api = (s.apiSettings && typeof s.apiSettings === 'object') ? { ...s.apiSettings } : {};
    if (typeof api.showThinking !== 'boolean') api.showThinking = false;
    if (typeof api.thinkingBudget !== 'number') api.thinkingBudget = 1024;
    api.thinkingBudget = Math.max(1024, Math.floor(api.thinkingBudget));
    s.apiSettings = api;

    s.schemaVersion = 8;
    return s;
  },

  // v8 -> v9（V6）：貼圖移除 label，以 contextText 為唯一文字欄位。
  // 舊資料若 contextText 為空，將 label 併入 contextText，之後刪除 label。
  8: (s) => {
    if (Array.isArray(s.stickers)) {
      s.stickers = s.stickers
        .filter((sticker) => sticker && typeof sticker === 'object')
        .map((sticker) => {
          const contextText = String(sticker.contextText || sticker.label || '').trim();
          return {
            id: String(sticker.id || ''),
            assetId: String(sticker.assetId || ''),
            contextText,
            createdAt: typeof sticker.createdAt === 'number' ? sticker.createdAt : Date.now()
          };
        });
    }
    s.schemaVersion = 9;
    return s;
  },

  // v9 -> v10（V9 角色生活感）：私語 / 弦外之音 / 聲箋。
  9: (s) => {
    const journals = Array.isArray(s.journals) ? s.journals : [];
    const existingPosts = Array.isArray(s.posts) ? s.posts : [];
    const postIds = new Set(existingPosts.map((p) => p && p.id).filter(Boolean));
    const legacyJournals = journals.filter((j) => j && j.ownerType !== 'character');
    const migratedPosts = legacyJournals
      .filter((j) => !postIds.has(j.id))
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
    s.journals = journals.filter((j) => j && j.ownerType === 'character');
    if (!Array.isArray(s.letters)) s.letters = [];
    if (!s.lifeGenLog || typeof s.lifeGenLog !== 'object' || Array.isArray(s.lifeGenLog)) {
      s.lifeGenLog = {};
    }
    if (Array.isArray(s.heartVoices)) {
      s.heartVoices = s.heartVoices
        .filter((item) => item && typeof item === 'object')
        .map((item) => ({ ...item, revealed: item.revealed === true }));
    } else {
      s.heartVoices = [];
    }
    const settings = (s.settings && typeof s.settings === 'object') ? { ...s.settings } : {};
    if (typeof settings.lifeEnabled !== 'boolean') settings.lifeEnabled = true;
    if (typeof settings.lifeEveryDays !== 'number') settings.lifeEveryDays = 3;
    if (typeof settings.lifeDailyLimit !== 'number') settings.lifeDailyLimit = 5;
    s.settings = settings;
    s.schemaVersion = 10;
    return s;
  },

  // v10 -> v11（V9.3）：角色新增駐守推播設定。
  10: (s) => {
    if (Array.isArray(s.characters)) {
      s.characters = s.characters.map((character) => (
        character && typeof character === 'object' && !character.vigil
          ? { ...character, vigil: { ...DEFAULT_VIGIL } }
          : character
      ));
    }
    s.schemaVersion = 11;
    return s;
  },

  // v11 -> v12（V10 記憶版）：對話新增餘音游標；聲痕補齊熱度與來源欄位。
  11: (s) => {
    if (Array.isArray(s.conversations)) {
      s.conversations = s.conversations.map((conversation) => (
        conversation && typeof conversation === 'object'
          ? { ...conversation, echo: { ...createDefaultEcho(), ...(conversation.echo || {}) } }
          : conversation
      ));
    }
    if (Array.isArray(s.memories)) {
      s.memories = s.memories.map((memory) => {
        if (!memory || typeof memory !== 'object') return memory;
        return {
          ...memory,
          recallCount: typeof memory.recallCount === 'number' && Number.isFinite(memory.recallCount)
            ? memory.recallCount
            : 0,
          lastRecalledAt: typeof memory.lastRecalledAt === 'number' && Number.isFinite(memory.lastRecalledAt)
            ? memory.lastRecalledAt
            : 0,
          source: typeof memory.source === 'string' ? memory.source : '',
          sourceId: typeof memory.sourceId === 'string' ? memory.sourceId : '',
          summary: typeof memory.summary === 'string' ? memory.summary : ''
        };
      });
    }
    s.schemaVersion = 12;
    return s;
  },

  // v12 -> v13（V10.5 安心版）：自動備份設定與上次自動備份時間。
  12: (s) => {
    const settings = (s.settings && typeof s.settings === 'object') ? { ...s.settings } : {};
    if (typeof settings.backupEveryDays !== 'number') settings.backupEveryDays = 3;
    s.settings = settings;
    if (typeof s.lastAutoBackupAt !== 'number') s.lastAutoBackupAt = 0;
    s.schemaVersion = 13;
    return s;
  },

  // v13 -> v14（V12 日常：拾日手帳與角色感知）。
  13: (s) => {
    const journals = Array.isArray(s.journals) ? s.journals : [];
    s.journals = journals.map((journal) => {
      if (!journal || typeof journal !== 'object') return journal;
      if (journal.ownerType === 'character') return journal;
      const createdAt = typeof journal.createdAt === 'number' ? journal.createdAt : Date.now();
      return {
        ...journal,
        ownerType: 'player',
        ownerId: journal.ownerId || 'player',
        entryDate: typeof journal.entryDate === 'string' && journal.entryDate
          ? journal.entryDate
          : localDateKey(createdAt),
        moodLevel: Number.isInteger(journal.moodLevel) && journal.moodLevel >= 1 && journal.moodLevel <= 5
          ? journal.moodLevel
          : null,
        mood: typeof journal.mood === 'string' ? journal.mood.slice(0, 8) : '',
        share: journal.share === 'aware' ? 'aware' : 'private',
        sharedPostId: typeof journal.sharedPostId === 'string' && journal.sharedPostId ? journal.sharedPostId : null,
        updatedAt: typeof journal.updatedAt === 'number' ? journal.updatedAt : createdAt
      };
    });
    const settings = (s.settings && typeof s.settings === 'object') ? { ...s.settings } : {};
    if (typeof settings.dailyAwarenessEnabled !== 'boolean') settings.dailyAwarenessEnabled = true;
    s.settings = settings;
    s.schemaVersion = 14;
    return s;
  },

  // v14 -> v15（V12.5 日課＋週回顧聲箋）：
  //   - habits / habitLogs 啟用為空陣列
  //   - letters.kind 為選填欄位，舊資料不補值（維持原樣）
  //   - settings.weeklyReviewEnabled 預設 false、settings.weeklyReviewCharacterId 預設 ''
  //   - state.lastWeeklyReviewAt 預設 0
  14: (s) => {
    if (!Array.isArray(s.habits)) s.habits = [];
    if (!Array.isArray(s.habitLogs)) s.habitLogs = [];
    const settings = (s.settings && typeof s.settings === 'object') ? { ...s.settings } : {};
    if (typeof settings.weeklyReviewEnabled !== 'boolean') settings.weeklyReviewEnabled = false;
    if (typeof settings.weeklyReviewCharacterId !== 'string') settings.weeklyReviewCharacterId = '';
    s.settings = settings;
    if (typeof s.lastWeeklyReviewAt !== 'number') s.lastWeeklyReviewAt = 0;
    s.schemaVersion = 15;
    return s;
  },

  // v15 -> v16（V12.6 迴聲留言愛心）：
  //   - comment.likes 啟用，結構同 post.likes：{ userType, userId, at }
  15: (s) => {
    if (Array.isArray(s.posts)) {
      s.posts = s.posts.map((post) => {
        if (!post || typeof post !== 'object') return post;
        const comments = Array.isArray(post.comments) ? post.comments : [];
        return {
          ...post,
          comments: comments.map((comment) => {
            if (!comment || typeof comment !== 'object') return { likes: [] };
            return Array.isArray(comment.likes) ? comment : { ...comment, likes: [] };
          })
        };
      });
    }
    s.schemaVersion = 16;
    return s;
  },

  // v16 -> v17（V13 極光之境 + 聲景）：
  //   - settings.theme 合法值加入 aurora；非法值照既有慣例 fallback blue
  //   - settings.chatBackgroundAssetId 預設 null（null = 使用主題預設聊天背景）
  16: (s) => {
    const settings = (s.settings && typeof s.settings === 'object') ? { ...s.settings } : {};
    if (settings.theme === 'brown') {
      settings.theme = 'violet';
    } else if (!['blue', 'pink', 'green', 'violet', 'aurora'].includes(settings.theme)) {
      settings.theme = 'blue';
    }
    if (settings.themeMode !== 'dark' && settings.themeMode !== 'light') settings.themeMode = 'light';
    if (typeof settings.chatBackgroundAssetId !== 'string') settings.chatBackgroundAssetId = null;
    s.settings = settings;
    s.schemaVersion = 17;
    return s;
  },

  // v17 -> v18（V13.5 每聊天室聲景 + 淡化）：
  //   - settings.chatBackgroundDim 預設 72
  //   - conversations 補 chatBackgroundAssetId / chatBackgroundDim
  17: (s) => {
    const settings = (s.settings && typeof s.settings === 'object') ? { ...s.settings } : {};
    if (typeof settings.chatBackgroundDim !== 'number' || !Number.isFinite(settings.chatBackgroundDim)) {
      settings.chatBackgroundDim = 72;
    }
    settings.chatBackgroundDim = Math.min(90, Math.max(20, Math.floor(settings.chatBackgroundDim)));
    s.settings = settings;
    if (Array.isArray(s.conversations)) {
      s.conversations = s.conversations.map((conversation) => {
        if (!conversation || typeof conversation !== 'object') return conversation;
        return {
          ...conversation,
          chatBackgroundAssetId: typeof conversation.chatBackgroundAssetId === 'string'
            ? conversation.chatBackgroundAssetId
            : null,
          chatBackgroundDim: typeof conversation.chatBackgroundDim === 'number' &&
            Number.isFinite(conversation.chatBackgroundDim)
            ? Math.min(90, Math.max(20, Math.floor(conversation.chatBackgroundDim)))
            : null
        };
      });
    }
    s.schemaVersion = 18;
    return s;
  },

  // v18 -> v19（V14 紙上手帳 I）：
  //   - settings.theme 合法值加入 washi
  //   - 不改任何既有欄位值；只防禦性修正非法主題值
  18: (s) => {
    const settings = (s.settings && typeof s.settings === 'object') ? { ...s.settings } : {};
    if (settings.theme === 'brown') {
      settings.theme = 'violet';
    } else if (!['blue', 'pink', 'green', 'violet', 'aurora', 'washi'].includes(settings.theme)) {
      settings.theme = 'blue';
    }
    if (settings.themeMode !== 'dark' && settings.themeMode !== 'light') settings.themeMode = 'light';
    s.settings = settings;
    s.schemaVersion = 19;
    return s;
  },

  // v19 -> v20（V15 約定日期）：
  //   - wishlists 每筆新增 date，null = 未定
  19: (s) => {
    if (Array.isArray(s.wishlists)) {
      s.wishlists = s.wishlists.map((wish) => {
        if (!wish || typeof wish !== 'object') return wish;
        return {
          ...wish,
          date: /^\d{4}-\d{2}-\d{2}$/.test(String(wish.date || '')) ? wish.date : null
        };
      });
    }
    s.schemaVersion = 20;
    return s;
  },

  // v20 -> v21（V16 外觀工作室）：
  //   - settings.appearance 補齊全域背景、粒子聲景、樣式微調、首頁模組
  //   - 極光舊使用者預設寫入 stars；其他主題預設 none
  20: (s) => {
    const settings = (s.settings && typeof s.settings === 'object') ? { ...s.settings } : {};
    const defaults = createDefaultAppearance(settings.theme);
    const source = (settings.appearance && typeof settings.appearance === 'object' && !Array.isArray(settings.appearance))
      ? settings.appearance
      : {};
    settings.appearance = {
      ...defaults,
      ...source,
      particles: {
        ...defaults.particles,
        ...((source.particles && typeof source.particles === 'object' && !Array.isArray(source.particles)) ? source.particles : {})
      },
      homeModules: {
        ...defaults.homeModules,
        ...((source.homeModules && typeof source.homeModules === 'object' && !Array.isArray(source.homeModules)) ? source.homeModules : {})
      }
    };
    s.settings = settings;
    s.schemaVersion = 21;
    return s;
  },
};

function localDateKey(ts) {
  const d = new Date(ts || Date.now());
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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
  if (s.schemaVersion >= 5 && s.schemaVersion < 10 && Array.isArray(s.journals) && s.journals.length) {
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

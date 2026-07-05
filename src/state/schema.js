// src/state/schema.js
//
// createDefaultState：第一次建立 default state 時使用 config.json 的值。
// normalizeState  ：補齊缺少的預設欄位（只處理欄位缺漏，不處理版本升級）。
//
// 分工（第九節）：migrations 管版本升級，schema.normalizeState 管欄位補齊，
// 兩者不重疊。

import { generateId } from '../utils/id.js';

// V2 範例全域 Prompt：首次升級（migration）與全新安裝（createDefaultState）都放入一個
// enabled=false 的示範區塊，讓使用者一眼看懂「全域 Prompt 存放區」怎麼用。
// 以 factory 產生（每次呼叫給新 id / 時間戳），migrations 與 schema 共用同一份定義。
export function createExampleGlobalPrompt() {
  const ts = Date.now();
  return {
    id: generateId('gp'),
    title: '範例：通用回覆守則',
    content: [
      '（這是範例，預設關閉。你可以編輯或刪除它。）',
      '',
      '1. 回覆長度適中，一次聚焦一個重點，避免長篇大論。',
      '2. 旁白（動作、神態、場景）請以全形星號包裹，例如：＊他輕輕闔上筆記本。＊',
      '3. 始終保持角色口吻，不要跳出角色說明自己是 AI。',
      '4. 尊重使用者設定的世界觀與情境，不擅自更動既定事實。'
    ].join('\n'),
    enabled: false,
    order: 0,
    createdAt: ts,
    updatedAt: ts
  };
}

// state record 完整結構（第六節）。
export function createDefaultState(config) {
  const defaultPlayer = (config && config.defaultPlayer) || {
    id: 'player',
    playerName: '',
    playerDescription: '',
    avatar: { type: 'emoji', value: '🙂' }
  };
  const defaultSettings = (config && config.defaultSettings) || {
    theme: 'blue',
    themeMode: 'light',
    messageDisplayMode: 'mixed',
    memoryInjectionLimit: 10
  };

  return {
    // schemaVersion 的唯一真相來源是 state；config 只在此第一次建立時提供初值。
    schemaVersion: (config && config.schemaVersion) || 1,
    currentConversationId: '',
    currentCharacterId: '',
    player: {
      id: defaultPlayer.id || 'player',
      playerName: defaultPlayer.playerName || '',
      playerDescription: defaultPlayer.playerDescription || '',
      avatar: cloneAvatar(defaultPlayer.avatar)
    },
    characters: [],
    conversations: [],
    // 以下陣列供未來擴充；V2 起 journals / globalPrompts 正式啟用，
    // V3 起 memories / wishlists / relationshipData / anniversaries 正式啟用。
    memories: [],
    worldbooks: [],
    journals: [],
    globalPrompts: [createExampleGlobalPrompt()],
    posts: [],
    stickers: [],
    heartVoices: [],
    keepsakes: [],
    relationshipData: [],
    wishlists: [],
    anniversaries: [],
    notifications: [],
    usageLog: [],
    pendingGreeting: null,
    dailyCounters: { date: '', feed: 0, dream: 0, background: 0 },
    lastOpenedAt: 0,
    lastGreetingAt: 0,
    lastFeedAutoPostAt: 0,
    feedAutoPostLog: {},
    // V2 新增：上次成功匯出備份的時間戳（0 = 從未備份），供首頁備份提醒使用。
    lastBackupAt: 0,
    settings: {
      // V5.6：theme = 配色（blue 藍噪 / pink 粉噪 / green 綠噪 / violet 紫噪），
      // themeMode = 明暗（light / dark）。舊主題值由 migration 6→7 轉換。
      theme: defaultSettings.theme || 'blue',
      themeMode: defaultSettings.themeMode === 'dark' ? 'dark' : 'light',
      messageDisplayMode: defaultSettings.messageDisplayMode || 'mixed',
      // V3：非 locked 記憶注入的筆數上限（locked 不占名額）。
      memoryInjectionLimit: typeof defaultSettings.memoryInjectionLimit === 'number'
        ? defaultSettings.memoryInjectionLimit
        : 10,
      timeAwareness: defaultSettings.timeAwareness !== false,
      feedReactorsPerPost: typeof defaultSettings.feedReactorsPerPost === 'number'
        ? defaultSettings.feedReactorsPerPost
        : 2,
      feedDailyLimit: typeof defaultSettings.feedDailyLimit === 'number'
        ? defaultSettings.feedDailyLimit
        : 20,
      feedAutoPost: defaultSettings.feedAutoPost !== false,
      greetingAfterDays: typeof defaultSettings.greetingAfterDays === 'number'
        ? defaultSettings.greetingAfterDays
        : 3,
      dreamEnabled: defaultSettings.dreamEnabled !== false,
      dreamEveryMessages: typeof defaultSettings.dreamEveryMessages === 'number'
        ? defaultSettings.dreamEveryMessages
        : 20,
      dreamDailyLimit: typeof defaultSettings.dreamDailyLimit === 'number'
        ? defaultSettings.dreamDailyLimit
        : 10
    },
    apiSettings: {
      provider: '',
      model: '',
      baseUrl: '',
      rememberApiKey: false,
      apiKey: '',
      utilityModel: '',
      // V1 新增：temperature（0–2，預設 1）、maxTokens（預設 1024）。
      temperature: 1,
      maxTokens: 1024,
      visionEnabled: false,
      showThinking: false,
      thinkingBudget: 1024
    }
  };
}

// avatar 支援兩型（V2）：
//   { type: "emoji", value: "🙂" }
//   { type: "image", assetId: "asset_xxx" }
function cloneAvatar(avatar) {
  if (avatar && typeof avatar === 'object') {
    if (avatar.type === 'image' && avatar.assetId) {
      return { type: 'image', assetId: avatar.assetId };
    }
    return { type: 'emoji', value: avatar.value || '🙂' };
  }
  return { type: 'emoji', value: '🙂' };
}

// 補齊缺漏欄位，回傳一個新物件（不深層修改輸入）。
// 只負責「欄位存在性」與型別修正，不動 schemaVersion 的升級邏輯。
export function normalizeState(state) {
  const base = createDefaultState({ schemaVersion: state && state.schemaVersion });
  const s = state && typeof state === 'object' ? state : {};

  const merged = {
    ...base,
    ...s,
    // schemaVersion 以 state 內為準（若缺則用 base）。
    schemaVersion: typeof s.schemaVersion === 'number' ? s.schemaVersion : base.schemaVersion,
    player: {
      ...base.player,
      ...(s.player || {}),
      avatar: cloneAvatar(s.player && s.player.avatar)
    },
    settings: { ...base.settings, ...(s.settings || {}) },
    apiSettings: { ...base.apiSettings, ...(s.apiSettings || {}) }
  };

  // 確保所有陣列欄位存在且為陣列。
  const arrayFields = [
    'characters', 'conversations', 'memories', 'worldbooks',
    'journals', 'globalPrompts', 'posts', 'heartVoices', 'keepsakes', 'relationshipData',
    'wishlists', 'anniversaries', 'notifications', 'usageLog', 'stickers'
  ];
  for (const f of arrayFields) {
    if (!Array.isArray(merged[f])) merged[f] = [];
  }

  // V3：memoryInjectionLimit 型別 / 範圍修正（至少 0）。
  if (typeof merged.settings.memoryInjectionLimit !== 'number' ||
      !Number.isFinite(merged.settings.memoryInjectionLimit)) {
    merged.settings.memoryInjectionLimit = 10;
  }
  merged.settings.memoryInjectionLimit = Math.max(0, Math.floor(merged.settings.memoryInjectionLimit));

  const numericSettings = {
    feedReactorsPerPost: [0, 10, 2],
    feedDailyLimit: [0, 200, 20],
    greetingAfterDays: [0, 365, 3],
    dreamEveryMessages: [1, 1000, 20],
    dreamDailyLimit: [0, 200, 10]
  };
  for (const [key, [min, max, fallback]] of Object.entries(numericSettings)) {
    const n = Number(merged.settings[key]);
    merged.settings[key] = Number.isFinite(n)
      ? Math.min(max, Math.max(min, Math.floor(n)))
      : fallback;
  }
  merged.settings.timeAwareness = merged.settings.timeAwareness !== false;
  merged.settings.feedAutoPost = !!merged.settings.feedAutoPost;
  merged.settings.dreamEnabled = merged.settings.dreamEnabled !== false;
  merged.apiSettings.visionEnabled = merged.apiSettings.visionEnabled === true;
  merged.apiSettings.showThinking = merged.apiSettings.showThinking === true;
  if (typeof merged.apiSettings.thinkingBudget !== 'number' ||
      !Number.isFinite(merged.apiSettings.thinkingBudget)) {
    merged.apiSettings.thinkingBudget = 1024;
  }
  merged.apiSettings.thinkingBudget = Math.max(1024, Math.floor(merged.apiSettings.thinkingBudget));

  if (merged.settings.theme === 'brown') merged.settings.theme = 'violet';
  if (!['blue', 'pink', 'green', 'violet'].includes(merged.settings.theme)) merged.settings.theme = 'blue';
  merged.settings.themeMode = merged.settings.themeMode === 'dark' ? 'dark' : 'light';

  if (typeof merged.lastOpenedAt !== 'number') merged.lastOpenedAt = 0;
  if (typeof merged.lastGreetingAt !== 'number') merged.lastGreetingAt = 0;
  if (typeof merged.lastFeedAutoPostAt !== 'number') merged.lastFeedAutoPostAt = 0;
  if (!merged.feedAutoPostLog || typeof merged.feedAutoPostLog !== 'object' || Array.isArray(merged.feedAutoPostLog)) {
    merged.feedAutoPostLog = {};
  }
  if (!merged.pendingGreeting || typeof merged.pendingGreeting !== 'object') merged.pendingGreeting = null;
  if (!merged.dailyCounters || typeof merged.dailyCounters !== 'object') {
    merged.dailyCounters = { date: '', feed: 0, dream: 0, background: 0 };
  }

  merged.usageLog = merged.usageLog
    .filter((u) => u && typeof u === 'object')
    .slice(-500);

  // 角色頭貼型別修正（image / emoji 兩型）。
  merged.characters = merged.characters.map((c) => {
    if (!c || typeof c !== 'object') return c;
    return { ...c, avatar: cloneAvatar(c.avatar) };
  });

  merged.conversations = merged.conversations.map((c) => {
    if (!c || typeof c !== 'object') return c;
    if (typeof c.lastDreamMessageCount !== 'number') {
      return { ...c, lastDreamMessageCount: 0 };
    }
    return c;
  });

  merged.memories = merged.memories.map((m) => {
    if (!m || typeof m !== 'object') return m;
    return { ...m, enabled: m.enabled !== false };
  });

  merged.stickers = merged.stickers
    .filter((s) => s && typeof s === 'object')
    .map((s) => ({
      id: String(s.id || generateId('sticker')),
      assetId: String(s.assetId || ''),
      label: String(s.label || '').trim(),
      contextText: String(s.contextText || '').trim(),
      createdAt: typeof s.createdAt === 'number' ? s.createdAt : Date.now()
    }));

  if (typeof merged.lastBackupAt !== 'number') merged.lastBackupAt = 0;

  if (typeof merged.currentConversationId !== 'string') merged.currentConversationId = '';
  if (typeof merged.currentCharacterId !== 'string') merged.currentCharacterId = '';

  return merged;
}

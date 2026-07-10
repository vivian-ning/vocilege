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

export function createDefaultVigil() {
  return {
    enabled: false,
    dailyLimit: 2,
    nickname: '',
    pushPersona: '',
    fallbackLines: []
  };
}

export function createDefaultEcho() {
  return {
    summary: '',
    coveredUntil: 0,
    coveredUntilId: '',
    dirty: false,
    updatedAt: 0
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
  const defaultApiSettings = (config && config.defaultApiSettings) || {};

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
    letters: [],
    keepsakes: [],
    relationshipData: [],
    wishlists: [],
    anniversaries: [],
    notifications: [],
    usageLog: [],
    // V12.5：日課（習慣打卡）。habits 上限 8（含封存）；habitLogs 同 habitId＋entryDate 唯一。
    habits: [],
    habitLogs: [],
    pendingGreeting: null,
    dailyCounters: { date: '', feed: 0, dream: 0, life: 0, nightPatrol: 0, background: 0 },
    lastOpenedAt: 0,
    lastGreetingAt: 0,
    lastFeedAutoPostAt: 0,
    feedAutoPostLog: {},
    lifeGenLog: {},
    // V2 新增：上次成功匯出備份的時間戳（0 = 從未備份），供首頁備份提醒使用。
    lastBackupAt: 0,
    // V10.5：上次成功自動備份的時間戳（0 = 從未自動備份）。
    lastAutoBackupAt: 0,
    // V12.5：上次成功產生「週回顧聲箋」的時間戳（0 = 從未產生）。
    lastWeeklyReviewAt: 0,
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
        : 10,
      lifeEnabled: defaultSettings.lifeEnabled !== false,
      lifeEveryDays: typeof defaultSettings.lifeEveryDays === 'number'
        ? defaultSettings.lifeEveryDays
        : 3,
      lifeDailyLimit: typeof defaultSettings.lifeDailyLimit === 'number'
        ? defaultSettings.lifeDailyLimit
        : 5,
      dailyAwarenessEnabled: defaultSettings.dailyAwarenessEnabled !== false,
      // 0 = 關閉自動備份與提醒。
      backupEveryDays: typeof defaultSettings.backupEveryDays === 'number'
        ? defaultSettings.backupEveryDays
        : 3,
      // V12.5：週回顧聲箋，預設關閉；角色下拉預設未選。
      weeklyReviewEnabled: defaultSettings.weeklyReviewEnabled === true,
      weeklyReviewCharacterId: typeof defaultSettings.weeklyReviewCharacterId === 'string'
        ? defaultSettings.weeklyReviewCharacterId
        : '',
      // V13：聲景，null = 使用主題預設聊天背景。
      chatBackgroundAssetId: typeof defaultSettings.chatBackgroundAssetId === 'string'
        ? defaultSettings.chatBackgroundAssetId
        : null,
      chatBackgroundDim: typeof defaultSettings.chatBackgroundDim === 'number'
        ? Math.min(90, Math.max(20, Math.floor(defaultSettings.chatBackgroundDim)))
        : 72
    },
    apiSettings: {
      provider: '',
      model: '',
      baseUrl: '',
      rememberApiKey: false,
      apiKey: '',
      utilityModel: '',
      // V1 新增：temperature（0–2，預設 1）；V9.1 起新預設 maxTokens 2048。
      temperature: 1,
      maxTokens: typeof defaultApiSettings.maxTokens === 'number' ? defaultApiSettings.maxTokens : 2048,
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

function localDateKey(ts) {
  const d = new Date(ts || Date.now());
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function normalizeJournal(j) {
  const createdAt = typeof j.createdAt === 'number' ? j.createdAt : Date.now();
  const ownerType = j.ownerType === 'character' ? 'character' : 'player';
  const base = {
    id: String(j.id || generateId('journal')),
    ownerType,
    ownerId: String(j.ownerId || j.characterId || (ownerType === 'player' ? 'player' : '')),
    content: String(j.content || ''),
    createdAt
  };
  if (ownerType === 'character') return base;
  const moodLevel = Number(j.moodLevel);
  return {
    ...base,
    entryDate: typeof j.entryDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(j.entryDate)
      ? j.entryDate
      : localDateKey(createdAt),
    moodLevel: Number.isInteger(moodLevel) && moodLevel >= 1 && moodLevel <= 5 ? moodLevel : null,
    mood: String(j.mood || '').trim().slice(0, 8),
    share: j.share === 'aware' ? 'aware' : 'private',
    sharedPostId: typeof j.sharedPostId === 'string' && j.sharedPostId ? j.sharedPostId : null,
    updatedAt: typeof j.updatedAt === 'number' ? j.updatedAt : createdAt
  };
}

export function normalizeVigil(vigil) {
  const base = createDefaultVigil();
  const source = vigil && typeof vigil === 'object' && !Array.isArray(vigil) ? vigil : {};
  const dailyLimit = Number(source.dailyLimit);
  return {
    enabled: source.enabled === true,
    dailyLimit: Number.isFinite(dailyLimit) ? Math.max(0, Math.floor(dailyLimit)) : base.dailyLimit,
    nickname: typeof source.nickname === 'string' ? source.nickname : base.nickname,
    pushPersona: typeof source.pushPersona === 'string' ? source.pushPersona : base.pushPersona,
    fallbackLines: Array.isArray(source.fallbackLines)
      ? source.fallbackLines.filter((line) => typeof line === 'string')
      : [...base.fallbackLines]
  };
}

export function normalizeEcho(echo) {
  const source = echo && typeof echo === 'object' && !Array.isArray(echo) ? echo : {};
  return {
    summary: typeof source.summary === 'string' ? source.summary : '',
    coveredUntil: typeof source.coveredUntil === 'number' && Number.isFinite(source.coveredUntil)
      ? source.coveredUntil
      : 0,
    coveredUntilId: typeof source.coveredUntilId === 'string' ? source.coveredUntilId : '',
    dirty: source.dirty === true,
    updatedAt: typeof source.updatedAt === 'number' && Number.isFinite(source.updatedAt)
      ? source.updatedAt
      : 0
  };
}

function normalizeLike(like) {
  const source = like && typeof like === 'object' && !Array.isArray(like) ? like : {};
  return {
    userType: source.userType === 'character' ? 'character' : 'player',
    userId: String(source.userId || (source.userType === 'character' ? '' : 'player')),
    at: typeof source.at === 'number' && Number.isFinite(source.at) ? source.at : Date.now()
  };
}

function normalizeFeedComment(comment) {
  const source = comment && typeof comment === 'object' && !Array.isArray(comment) ? comment : {};
  const authorType = source.authorType === 'character' ? 'character' : 'player';
  return {
    id: String(source.id || generateId('comment')),
    authorType,
    authorId: String(source.authorId || (authorType === 'player' ? 'player' : '')),
    content: String(source.content || ''),
    likes: Array.isArray(source.likes) ? source.likes.map((like) => normalizeLike(like)) : [],
    createdAt: typeof source.createdAt === 'number' && Number.isFinite(source.createdAt) ? source.createdAt : Date.now()
  };
}

function normalizeFeedPost(post) {
  const source = post && typeof post === 'object' && !Array.isArray(post) ? post : {};
  const authorType = source.authorType === 'character' ? 'character' : 'player';
  return {
    ...source,
    id: String(source.id || generateId('post')),
    authorType,
    authorId: String(source.authorId || (authorType === 'player' ? 'player' : '')),
    content: String(source.content || ''),
    mood: String(source.mood || ''),
    likes: Array.isArray(source.likes) ? source.likes.map((like) => normalizeLike(like)) : [],
    comments: Array.isArray(source.comments) ? source.comments.map((comment) => normalizeFeedComment(comment)) : [],
    createdAt: typeof source.createdAt === 'number' && Number.isFinite(source.createdAt) ? source.createdAt : Date.now()
  };
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
    'journals', 'globalPrompts', 'posts', 'heartVoices', 'letters', 'keepsakes', 'relationshipData',
    'wishlists', 'anniversaries', 'notifications', 'usageLog', 'stickers', 'habits', 'habitLogs'
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
    dreamDailyLimit: [0, 200, 10],
    lifeEveryDays: [0, 365, 3],
    lifeDailyLimit: [0, 200, 5],
    backupEveryDays: [0, 365, 3]
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
  merged.settings.lifeEnabled = merged.settings.lifeEnabled !== false;
  merged.settings.dailyAwarenessEnabled = merged.settings.dailyAwarenessEnabled !== false;
  merged.settings.weeklyReviewEnabled = merged.settings.weeklyReviewEnabled === true;
  merged.settings.weeklyReviewCharacterId = typeof merged.settings.weeklyReviewCharacterId === 'string'
    ? merged.settings.weeklyReviewCharacterId
    : '';
  merged.apiSettings.visionEnabled = merged.apiSettings.visionEnabled === true;
  merged.apiSettings.showThinking = merged.apiSettings.showThinking === true;
  if (typeof merged.apiSettings.thinkingBudget !== 'number' ||
      !Number.isFinite(merged.apiSettings.thinkingBudget)) {
    merged.apiSettings.thinkingBudget = 1024;
  }
  merged.apiSettings.thinkingBudget = Math.max(1024, Math.floor(merged.apiSettings.thinkingBudget));

  if (merged.settings.theme === 'brown') merged.settings.theme = 'violet';
  if (!['blue', 'pink', 'green', 'violet', 'aurora'].includes(merged.settings.theme)) merged.settings.theme = 'blue';
  merged.settings.themeMode = merged.settings.themeMode === 'dark' ? 'dark' : 'light';
  merged.settings.chatBackgroundAssetId = typeof merged.settings.chatBackgroundAssetId === 'string'
    ? merged.settings.chatBackgroundAssetId
    : null;
  merged.settings.chatBackgroundDim = typeof merged.settings.chatBackgroundDim === 'number' &&
    Number.isFinite(merged.settings.chatBackgroundDim)
    ? Math.min(90, Math.max(20, Math.floor(merged.settings.chatBackgroundDim)))
    : 72;

  if (typeof merged.lastOpenedAt !== 'number') merged.lastOpenedAt = 0;
  if (typeof merged.lastGreetingAt !== 'number') merged.lastGreetingAt = 0;
  if (typeof merged.lastFeedAutoPostAt !== 'number') merged.lastFeedAutoPostAt = 0;
  if (!merged.feedAutoPostLog || typeof merged.feedAutoPostLog !== 'object' || Array.isArray(merged.feedAutoPostLog)) {
    merged.feedAutoPostLog = {};
  }
  if (!merged.lifeGenLog || typeof merged.lifeGenLog !== 'object' || Array.isArray(merged.lifeGenLog)) {
    merged.lifeGenLog = {};
  }
  if (!merged.pendingGreeting || typeof merged.pendingGreeting !== 'object') merged.pendingGreeting = null;
  if (!merged.dailyCounters || typeof merged.dailyCounters !== 'object') {
    merged.dailyCounters = { date: '', feed: 0, dream: 0, life: 0, nightPatrol: 0, background: 0 };
  }

  merged.usageLog = merged.usageLog
    .filter((u) => u && typeof u === 'object')
    .slice(-500);

  // 角色頭貼型別修正（image / emoji 兩型）與駐守欄位補齊。
  merged.characters = merged.characters.map((c) => {
    if (!c || typeof c !== 'object') return c;
    return { ...c, avatar: cloneAvatar(c.avatar), vigil: normalizeVigil(c.vigil) };
  });

  merged.conversations = merged.conversations.map((c) => {
    if (!c || typeof c !== 'object') return c;
    const type = c.type === 'group' ? 'group' : 'direct';
    const memberIds = Array.isArray(c.memberIds)
      ? [...new Set(c.memberIds.filter((id) => typeof id === 'string' && id))]
      : [];
    const normalizedMemberIds = ['player', ...memberIds.filter((id) => id !== 'player')];
    const normalized = {
      ...c,
      type,
      title: type === 'group' ? String(c.title || '合聲') : null,
      memberIds: memberIds.length ? normalizedMemberIds : ['player'].concat(c.primaryCharacterId ? [c.primaryCharacterId] : []),
      primaryCharacterId: type === 'group' ? null : (typeof c.primaryCharacterId === 'string' ? c.primaryCharacterId : ''),
      lastDreamMessageCount: typeof c.lastDreamMessageCount === 'number' ? c.lastDreamMessageCount : 0,
      echo: normalizeEcho(c.echo),
      chatBackgroundAssetId: typeof c.chatBackgroundAssetId === 'string' ? c.chatBackgroundAssetId : null,
      chatBackgroundDim: typeof c.chatBackgroundDim === 'number' && Number.isFinite(c.chatBackgroundDim)
        ? Math.min(90, Math.max(20, Math.floor(c.chatBackgroundDim)))
        : null
    };
    return normalized;
  });

  merged.memories = merged.memories.map((m) => {
    if (!m || typeof m !== 'object') return m;
    return {
      ...m,
      enabled: m.enabled !== false,
      recallCount: typeof m.recallCount === 'number' && Number.isFinite(m.recallCount) ? m.recallCount : 0,
      lastRecalledAt: typeof m.lastRecalledAt === 'number' && Number.isFinite(m.lastRecalledAt) ? m.lastRecalledAt : 0,
      source: typeof m.source === 'string' ? m.source : '',
      sourceId: typeof m.sourceId === 'string' ? m.sourceId : '',
      summary: typeof m.summary === 'string' ? m.summary : ''
    };
  });

  merged.stickers = merged.stickers
    .filter((s) => s && typeof s === 'object')
    .map((s) => ({
      id: String(s.id || generateId('sticker')),
      assetId: String(s.assetId || ''),
      contextText: String(s.contextText || s.label || '').trim(),
      createdAt: typeof s.createdAt === 'number' ? s.createdAt : Date.now()
    }));

  merged.journals = merged.journals
    .filter((j) => j && typeof j === 'object')
    .map((j) => normalizeJournal(j));

  merged.posts = merged.posts
    .filter((p) => p && typeof p === 'object')
    .map((p) => normalizeFeedPost(p));

  merged.heartVoices = merged.heartVoices
    .filter((h) => h && typeof h === 'object')
    .map((h) => ({
      id: String(h.id || generateId('heart')),
      characterId: String(h.characterId || ''),
      content: String(h.content || ''),
      revealed: h.revealed === true,
      createdAt: typeof h.createdAt === 'number' ? h.createdAt : Date.now()
    }));

  merged.letters = merged.letters
    .filter((l) => l && typeof l === 'object')
    .map((l) => {
      const item = {
        id: String(l.id || generateId('letter')),
        characterId: String(l.characterId || ''),
        content: String(l.content || ''),
        isRead: l.isRead === true,
        createdAt: typeof l.createdAt === 'number' ? l.createdAt : Date.now()
      };
      // V12.5：kind 選填（例如 'weeklyReview'）；舊資料無此欄位時不補值，維持原樣渲染。
      if (typeof l.kind === 'string' && l.kind) item.kind = l.kind;
      return item;
    });

  // V12.5：日課（habits）與打卡紀錄（habitLogs）。
  merged.habits = merged.habits
    .filter((h) => h && typeof h === 'object')
    .map((h) => ({
      id: String(h.id || generateId('habit')),
      emoji: String(h.emoji || '✅').trim().slice(0, 8) || '✅',
      name: String(h.name || '').trim().slice(0, 6),
      order: typeof h.order === 'number' && Number.isFinite(h.order) ? h.order : 0,
      archived: h.archived === true,
      createdAt: typeof h.createdAt === 'number' ? h.createdAt : Date.now()
    }));

  merged.habitLogs = merged.habitLogs
    .filter((l) => l && typeof l === 'object' && l.habitId)
    .map((l) => ({
      id: String(l.id || generateId('habitlog')),
      habitId: String(l.habitId || ''),
      entryDate: typeof l.entryDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(l.entryDate)
        ? l.entryDate
        : localDateKey(Date.now()),
      createdAt: typeof l.createdAt === 'number' ? l.createdAt : Date.now()
    }));

  if (typeof merged.lastBackupAt !== 'number') merged.lastBackupAt = 0;
  if (typeof merged.lastAutoBackupAt !== 'number') merged.lastAutoBackupAt = 0;
  if (typeof merged.lastWeeklyReviewAt !== 'number') merged.lastWeeklyReviewAt = 0;

  if (typeof merged.currentConversationId !== 'string') merged.currentConversationId = '';
  if (typeof merged.currentCharacterId !== 'string') merged.currentCharacterId = '';

  return merged;
}

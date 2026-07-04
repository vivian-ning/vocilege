// src/state/schema.js
//
// createDefaultState：第一次建立 default state 時使用 config.json 的值。
// normalizeState  ：補齊缺少的預設欄位（只處理欄位缺漏，不處理版本升級）。
//
// 分工（第九節）：migrations 管版本升級，schema.normalizeState 管欄位補齊，
// 兩者不重疊。

// state record 完整結構（第六節）。V0 只實作 characters、conversations、messages、
// player、settings、apiSettings 的基礎保存，其餘陣列保留為空供未來擴充。
export function createDefaultState(config) {
  const defaultPlayer = (config && config.defaultPlayer) || {
    id: 'player',
    playerName: '',
    playerDescription: '',
    avatar: { type: 'emoji', value: '🙂' }
  };
  const defaultSettings = (config && config.defaultSettings) || {
    theme: 'cream',
    messageDisplayMode: 'mixed'
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
    // 以下陣列 V0 保留為空，供未來擴充（日記 / 貼文 / 心聲 / 世界書 / 記憶等）。
    memories: [],
    worldbooks: [],
    journals: [],
    posts: [],
    heartVoices: [],
    relationshipData: [],
    wishlists: [],
    notifications: [],
    settings: {
      theme: defaultSettings.theme || 'cream',
      messageDisplayMode: defaultSettings.messageDisplayMode || 'mixed'
    },
    apiSettings: {
      provider: '',
      model: '',
      baseUrl: '',
      rememberApiKey: false,
      apiKey: '',
      // V1 新增：temperature（0–2，預設 1）、maxTokens（預設 1024）。
      temperature: 1,
      maxTokens: 1024
    }
  };
}

function cloneAvatar(avatar) {
  if (avatar && typeof avatar === 'object') {
    return { type: avatar.type || 'emoji', value: avatar.value || '🙂' };
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
    'journals', 'posts', 'heartVoices', 'relationshipData',
    'wishlists', 'notifications'
  ];
  for (const f of arrayFields) {
    if (!Array.isArray(merged[f])) merged[f] = [];
  }

  if (typeof merged.currentConversationId !== 'string') merged.currentConversationId = '';
  if (typeof merged.currentCharacterId !== 'string') merged.currentCharacterId = '';

  return merged;
}

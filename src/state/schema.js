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
    // 以下陣列供未來擴充；V2 起 journals / globalPrompts 正式啟用。
    memories: [],
    worldbooks: [],
    journals: [],
    globalPrompts: [createExampleGlobalPrompt()],
    posts: [],
    heartVoices: [],
    relationshipData: [],
    wishlists: [],
    notifications: [],
    // V2 新增：上次成功匯出備份的時間戳（0 = 從未備份），供首頁備份提醒使用。
    lastBackupAt: 0,
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
    'journals', 'globalPrompts', 'posts', 'heartVoices', 'relationshipData',
    'wishlists', 'notifications'
  ];
  for (const f of arrayFields) {
    if (!Array.isArray(merged[f])) merged[f] = [];
  }

  // 角色頭貼型別修正（image / emoji 兩型）。
  merged.characters = merged.characters.map((c) => {
    if (!c || typeof c !== 'object') return c;
    return { ...c, avatar: cloneAvatar(c.avatar) };
  });

  if (typeof merged.lastBackupAt !== 'number') merged.lastBackupAt = 0;

  if (typeof merged.currentConversationId !== 'string') merged.currentConversationId = '';
  if (typeof merged.currentCharacterId !== 'string') merged.currentCharacterId = '';

  return merged;
}

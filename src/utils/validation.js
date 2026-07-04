// src/utils/validation.js
// 匯入資料前的結構驗證（第十三節）。回傳 { ok, errors }。
// 不修改輸入，只做檢查。

const CURRENT_SCHEMA_VERSION = 5;

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// 驗證匯出檔（backup）整體結構。
// 預期形狀：{ exportedAt, state, messages, avatarAssets? }
export function validateBackup(data) {
  const errors = [];

  if (!isObject(data)) {
    return { ok: false, errors: ['備份檔不是有效的 JSON 物件'] };
  }

  if (!isObject(data.state)) {
    errors.push('缺少 state 物件');
  }
  if (!Array.isArray(data.messages)) {
    errors.push('缺少 messages 陣列');
  }

  // state 內部檢查
  if (isObject(data.state)) {
    const s = data.state;

    if (typeof s.schemaVersion !== 'number') {
      // schemaVersion 缺失屬於語意錯誤，交由呼叫端（backupService）判斷拒絕。
      errors.push('state 缺少 schemaVersion（或型別錯誤）');
    }

    const arrayFields = [
      'characters', 'conversations', 'memories', 'worldbooks',
      'journals', 'globalPrompts', 'posts', 'heartVoices', 'keepsakes', 'relationshipData',
      'wishlists', 'anniversaries', 'notifications', 'usageLog'
    ];
    for (const f of arrayFields) {
      if (f in s && !Array.isArray(s[f])) {
        errors.push(`state.${f} 應為陣列`);
      }
    }

    if ('player' in s && !isObject(s.player)) {
      errors.push('state.player 應為物件');
    }
    if ('settings' in s && !isObject(s.settings)) {
      errors.push('state.settings 應為物件');
    }
    if ('apiSettings' in s && !isObject(s.apiSettings)) {
      errors.push('state.apiSettings 應為物件');
    }

    // characters / conversations 基本欄位型別
    if (Array.isArray(s.characters)) {
      s.characters.forEach((c, i) => {
        if (!isObject(c) || typeof c.id !== 'string') {
          errors.push(`characters[${i}] 缺少字串 id`);
        }
      });
    }
    if (Array.isArray(s.conversations)) {
      s.conversations.forEach((c, i) => {
        if (!isObject(c) || typeof c.id !== 'string') {
          errors.push(`conversations[${i}] 缺少字串 id`);
        }
      });
    }
  }

  // avatarAssets 為 V2 新增的頂層區塊（選填）；若存在必須是陣列。
  // 缺 avatarAssets 或個別 asset 缺漏不算結構錯誤（匯入時 fallback 回 emoji）。
  if ('avatarAssets' in data && !Array.isArray(data.avatarAssets)) {
    errors.push('avatarAssets 應為陣列');
  }

  // messages 基本欄位型別
  if (Array.isArray(data.messages)) {
    data.messages.forEach((m, i) => {
      if (!isObject(m)) {
        errors.push(`messages[${i}] 不是物件`);
        return;
      }
      if (typeof m.id !== 'string') errors.push(`messages[${i}] 缺少字串 id`);
      if (typeof m.conversationId !== 'string') errors.push(`messages[${i}] 缺少 conversationId`);
      if (!Array.isArray(m.parts)) errors.push(`messages[${i}] 缺少 parts 陣列`);
    });
  }

  return { ok: errors.length === 0, errors };
}

export { CURRENT_SCHEMA_VERSION };

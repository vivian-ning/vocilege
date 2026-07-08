// src/utils/validation.js
// 匯入資料前的結構驗證（第十三節）。回傳 { ok, errors }。
// 不修改輸入，只做檢查。

import { CURRENT_SCHEMA_VERSION } from '../state/migrations.js';

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
      'wishlists', 'anniversaries', 'notifications', 'usageLog', 'stickers', 'letters'
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
    } else if (isObject(s.settings) && 'backupEveryDays' in s.settings && typeof s.settings.backupEveryDays !== 'number') {
      errors.push('state.settings.backupEveryDays 應為數字');
    }
    if ('apiSettings' in s && !isObject(s.apiSettings)) {
      errors.push('state.apiSettings 應為物件');
    }
    if ('lastAutoBackupAt' in s && typeof s.lastAutoBackupAt !== 'number') {
      errors.push('state.lastAutoBackupAt 應為數字');
    }

    // characters / conversations 基本欄位型別
    if (Array.isArray(s.characters)) {
      s.characters.forEach((c, i) => {
        if (!isObject(c) || typeof c.id !== 'string') {
          errors.push(`characters[${i}] 缺少字串 id`);
          return;
        }
        if ('vigil' in c) {
          if (!isObject(c.vigil)) {
            errors.push(`characters[${i}].vigil 應為物件`);
          } else {
            if ('enabled' in c.vigil && typeof c.vigil.enabled !== 'boolean') {
              errors.push(`characters[${i}].vigil.enabled 應為布林值`);
            }
            if ('dailyLimit' in c.vigil && typeof c.vigil.dailyLimit !== 'number') {
              errors.push(`characters[${i}].vigil.dailyLimit 應為數字`);
            }
            for (const key of ['nickname', 'pushPersona']) {
              if (key in c.vigil && typeof c.vigil[key] !== 'string') {
                errors.push(`characters[${i}].vigil.${key} 應為字串`);
              }
            }
            if ('fallbackLines' in c.vigil && !Array.isArray(c.vigil.fallbackLines)) {
              errors.push(`characters[${i}].vigil.fallbackLines 應為陣列`);
            }
            if (Array.isArray(c.vigil.fallbackLines)) {
              c.vigil.fallbackLines.forEach((line, lineIndex) => {
                if (typeof line !== 'string') {
                  errors.push(`characters[${i}].vigil.fallbackLines[${lineIndex}] 應為字串`);
                }
              });
            }
          }
        }
      });
    }
    if (Array.isArray(s.conversations)) {
      s.conversations.forEach((c, i) => {
        if (!isObject(c) || typeof c.id !== 'string') {
          errors.push(`conversations[${i}] 缺少字串 id`);
          return;
        }
        if (c.type === 'group') {
          if (c.primaryCharacterId !== null) errors.push(`conversations[${i}].primaryCharacterId 應為 null`);
          if (!Array.isArray(c.memberIds) || c.memberIds.length < 3) {
            errors.push(`conversations[${i}].memberIds 應包含 player 與至少 2 位角色`);
          }
        } else if (c.type === 'direct' || !('type' in c)) {
          if (typeof c.primaryCharacterId !== 'string') {
            errors.push(`conversations[${i}].primaryCharacterId 應為字串`);
          }
        }
        if ('echo' in c) {
          if (!isObject(c.echo)) {
            errors.push(`conversations[${i}].echo 應為物件`);
          } else {
            if ('summary' in c.echo && typeof c.echo.summary !== 'string') errors.push(`conversations[${i}].echo.summary 應為字串`);
            if ('coveredUntil' in c.echo && typeof c.echo.coveredUntil !== 'number') errors.push(`conversations[${i}].echo.coveredUntil 應為數字`);
            if ('coveredUntilId' in c.echo && typeof c.echo.coveredUntilId !== 'string') errors.push(`conversations[${i}].echo.coveredUntilId 應為字串`);
            if ('dirty' in c.echo && typeof c.echo.dirty !== 'boolean') errors.push(`conversations[${i}].echo.dirty 應為布林值`);
            if ('updatedAt' in c.echo && typeof c.echo.updatedAt !== 'number') errors.push(`conversations[${i}].echo.updatedAt 應為數字`);
          }
        }
      });
    }
    if (Array.isArray(s.memories)) {
      s.memories.forEach((m, i) => {
        if (!isObject(m)) return;
        if ('recallCount' in m && typeof m.recallCount !== 'number') errors.push(`memories[${i}].recallCount 應為數字`);
        if ('lastRecalledAt' in m && typeof m.lastRecalledAt !== 'number') errors.push(`memories[${i}].lastRecalledAt 應為數字`);
        if ('source' in m && typeof m.source !== 'string') errors.push(`memories[${i}].source 應為字串`);
        if ('sourceId' in m && typeof m.sourceId !== 'string') errors.push(`memories[${i}].sourceId 應為字串`);
        if ('summary' in m && typeof m.summary !== 'string') errors.push(`memories[${i}].summary 應為字串`);
      });
    }
  }

  // avatarAssets 為 V2 新增的頂層區塊（選填）；若存在必須是陣列。
  // 缺 avatarAssets 或個別 asset 缺漏不算結構錯誤（匯入時 fallback 回 emoji）。
  if ('avatarAssets' in data && !Array.isArray(data.avatarAssets)) {
    errors.push('avatarAssets 應為陣列');
  }
  if ('assets' in data && !Array.isArray(data.assets)) {
    errors.push('assets 應為陣列');
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

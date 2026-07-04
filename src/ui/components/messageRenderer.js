// src/ui/components/messageRenderer.js
//
// 訊息渲染（第十二節）。全程使用 createElement + textContent，禁止 innerHTML。
//
// V0 支援三種 part：
//   - message    ：聊天泡泡（player 靠右、character 靠左）
//   - narration  ：中間淡色旁白
//   - systemNote ：系統提示
//
// settings.messageDisplayMode 在 V0 為唯讀（固定 "mixed"），渲染行為即混合模式。
// 未來三種顯示模式的切換點就在本檔 renderMessage / renderMessagePart：
//   - message  （手機訊息模式）：只渲染 message part，narration 收合或忽略
//   - narrative（劇情敘事模式）：message 也以敘事段落呈現，弱化泡泡
//   - mixed    （混合模式）    ：目前行為，泡泡 + 旁白交錯
// 屆時依 context.settings.messageDisplayMode 分支即可。

import { formatTime } from '../../utils/time.js';
import { createAvatarEl } from '../avatar.js';

export function renderMessage(message, context) {
  const wrap = document.createElement('div');
  wrap.className = 'msg-group';
  wrap.dataset.messageId = message.id;

  const parts = Array.isArray(message.parts) ? message.parts : [];
  for (const part of parts) {
    const el = renderMessagePart(part, message, context);
    if (el) wrap.appendChild(el);
  }

  // Token 用量（只有真 API 回覆的 assistant message 會帶 usage）：
  // 氣泡下方以極小 muted 字顯示「↑輸入 ↓輸出」。
  if (message.usage && (message.usage.promptTokens || message.usage.completionTokens)) {
    const usageEl = document.createElement('div');
    usageEl.className = 'msg-usage';
    usageEl.textContent = `↑${message.usage.promptTokens} ↓${message.usage.completionTokens}`;
    if (message.usage.model) usageEl.title = message.usage.model;
    wrap.appendChild(usageEl);
  }

  return wrap;
}

export function renderMessagePart(part, message, context) {
  const type = part && part.type ? part.type : 'message';
  const content = part && part.content != null ? String(part.content) : '';

  if (type === 'narration') {
    const row = document.createElement('div');
    row.className = 'part-narration';
    row.textContent = content;
    return row;
  }

  if (type === 'systemNote') {
    const row = document.createElement('div');
    row.className = 'part-system';
    row.textContent = content;
    return row;
  }

  // 預設：message 泡泡
  const isPlayer = message.senderType === 'player';
  const row = document.createElement('div');
  row.className = `bubble-row ${isPlayer ? 'from-player' : 'from-character'}`;

  // 頭貼（V2）：玩家靠右、角色靠左，各放一個小頭貼。
  const avatarSource = isPlayer
    ? (context && context.playerAvatar)
    : (context && context.characterAvatar);
  const avatarEl = createAvatarEl(avatarSource, 'bubble-avatar');

  const bubble = document.createElement('div');
  bubble.className = `bubble ${isPlayer ? 'bubble-player' : 'bubble-character'}`;

  // 角色訊息顯示發話者名稱（群聊時特別有用）。
  if (!isPlayer && context && context.characterName) {
    const nameEl = document.createElement('div');
    nameEl.className = 'bubble-name';
    nameEl.textContent = context.characterName;
    bubble.appendChild(nameEl);
  }

  const textEl = document.createElement('div');
  textEl.className = 'bubble-text';
  textEl.textContent = content;
  bubble.appendChild(textEl);

  const timeEl = document.createElement('div');
  timeEl.className = 'bubble-time';
  timeEl.textContent = formatTime(message.createdAt);
  bubble.appendChild(timeEl);

  // 玩家：泡泡在左、頭貼在右；角色：頭貼在左、泡泡在右。
  if (isPlayer) {
    row.appendChild(bubble);
    row.appendChild(avatarEl);
  } else {
    row.appendChild(avatarEl);
    row.appendChild(bubble);
  }
  return row;
}

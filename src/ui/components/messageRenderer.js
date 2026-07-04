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
import {
  addKeepsakeFromMessage,
  regenerateMessage,
  editMessageParts,
  switchMessageVersion
} from '../../state/store.js';

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
    let text = `↑${message.usage.promptTokens} ↓${message.usage.completionTokens}`;
    // 快取命中（Anthropic）：顯示 ⚡{cacheRead}，讓使用者看到省下的輸入 token。
    if (message.usage.cacheRead) text += `　⚡${message.usage.cacheRead}`;
    usageEl.textContent = text;
    if (message.usage.model) usageEl.title = message.usage.model;
    wrap.appendChild(usageEl);
  }

  if (message.senderType === 'character') {
    wrap.appendChild(renderMessageTools(message, context));
  }

  return wrap;
}

function renderMessageTools(message, context) {
  const tools = document.createElement('div');
  tools.className = 'msg-tools';

  const keepsake = toolBtn('拾貝');
  keepsake.addEventListener('click', () => {
    const note = window.prompt('替這段拾貝加一點備註（可留白）', '');
    if (note === null) return;
    addKeepsakeFromMessage(message.id, note);
  });
  tools.appendChild(keepsake);

  const isLastCharacter = context && context.lastCharacterMessageId === message.id;
  if (isLastCharacter) {
    const regen = toolBtn('再說一次');
    regen.addEventListener('click', () => regenerateMessage(message.id));
    tools.appendChild(regen);

    const edit = toolBtn('修飾');
    edit.addEventListener('click', () => openEditModal(message));
    tools.appendChild(edit);
  }

  const versions = Array.isArray(message.versions) ? message.versions.length : 0;
  if (versions > 1) {
    const prev = toolBtn('上一版');
    prev.disabled = (Number(message.activeVersion) || 0) <= 0;
    prev.addEventListener('click', () => switchMessageVersion(message.id, -1));
    tools.appendChild(prev);

    const tag = document.createElement('span');
    tag.className = 'msg-version-tag';
    tag.textContent = `${(Number(message.activeVersion) || 0) + 1}/${versions}`;
    tools.appendChild(tag);

    const next = toolBtn('下一版');
    next.disabled = (Number(message.activeVersion) || 0) >= versions - 1;
    next.addEventListener('click', () => switchMessageVersion(message.id, 1));
    tools.appendChild(next);
  }

  return tools;
}

function openEditModal(message) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const modal = document.createElement('div');
  modal.className = 'modal edit-message-modal';
  const title = document.createElement('h2');
  title.className = 'modal-title';
  title.textContent = '修飾回覆';
  modal.appendChild(title);
  const ta = document.createElement('textarea');
  ta.className = 'form-control';
  ta.rows = 8;
  ta.value = (message.parts || [])
    .map((p) => {
      const content = p && p.content ? String(p.content) : '';
      return p && p.type === 'narration' ? `＊${content}＊` : content;
    })
    .join('\n\n')
    .trim();
  modal.appendChild(ta);
  const actions = document.createElement('div');
  actions.className = 'form-actions';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'btn';
  cancel.textContent = '取消';
  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'btn btn-primary';
  save.textContent = '儲存';
  cancel.addEventListener('click', close);
  save.addEventListener('click', async () => {
    await editMessageParts(message.id, ta.value);
    close();
  });
  actions.appendChild(cancel);
  actions.appendChild(save);
  modal.appendChild(actions);
  overlay.appendChild(modal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  function close() {
    if (overlay.parentNode) document.body.removeChild(overlay);
  }
  document.body.appendChild(overlay);
  ta.focus();
}

function toolBtn(text) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'msg-tool-btn';
  btn.textContent = text;
  return btn;
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

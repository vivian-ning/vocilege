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
  toggleKeepsakeFromMessage,
  regenerateMessage,
  editMessageParts,
  switchMessageVersion
} from '../../state/store.js';
import { getObjectURL } from '../../services/assetService.js';
import { iconButton } from '../icons.js';

export function renderMessage(message, context) {
  const wrap = document.createElement('div');
  wrap.className = 'msg-group';
  wrap.dataset.messageId = message.id;

  const parts = Array.isArray(message.parts) ? message.parts : [];
  if (message.senderType === 'character' && message.thinking) {
    wrap.appendChild(renderThinkingBlock(message.thinking));
  }
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

  wrap.appendChild(renderMessageTools(message, context));

  return wrap;
}

function renderMessageTools(message, context) {
  const tools = document.createElement('div');
  tools.className = 'msg-tools';

  const saved = (context.keepsakes || []).some((k) => k.messageId === message.id);
  const keepsake = toolBtn('heart', saved ? '取消拾貝' : '拾貝');
  if (saved) keepsake.classList.add('active');
  keepsake.addEventListener('click', () => toggleKeepsakeFromMessage(message.id));
  tools.appendChild(keepsake);

  const isLastCharacter = context && context.lastCharacterMessageId === message.id;
  if (message.senderType === 'character' && isLastCharacter) {
    const regen = toolBtn('refresh', '再說一次');
    regen.addEventListener('click', () => regenerateMessage(message.id));
    tools.appendChild(regen);

    const edit = toolBtn('edit', '修飾');
    edit.addEventListener('click', () => openEditModal(message));
    tools.appendChild(edit);
  }

  const versions = Array.isArray(message.versions) ? message.versions.length : 0;
  if (versions > 1) {
    const prev = toolBtn('left', '上一版');
    prev.disabled = (Number(message.activeVersion) || 0) <= 0;
    prev.addEventListener('click', () => switchMessageVersion(message.id, -1));
    tools.appendChild(prev);

    const tag = document.createElement('span');
    tag.className = 'msg-version-tag';
    tag.textContent = `${(Number(message.activeVersion) || 0) + 1}/${versions}`;
    tools.appendChild(tag);

    const next = toolBtn('right', '下一版');
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

function toolBtn(icon, label) {
  return iconButton(icon, label || icon, { className: 'msg-tool-btn icon-btn msg-icon-btn', size: 17, title: label || icon });
}

function renderThinkingBlock(text) {
  const card = document.createElement('div');
  card.className = 'thinking-card collapsed';

  const head = document.createElement('button');
  head.type = 'button';
  head.className = 'thinking-toggle';
  head.setAttribute('aria-expanded', 'false');

  const label = document.createElement('span');
  label.className = 'thinking-label';
  label.textContent = 'THINKING';
  head.appendChild(label);

  const action = document.createElement('span');
  action.className = 'thinking-action';
  action.textContent = '展開思考';
  head.appendChild(action);
  card.appendChild(head);

  const body = document.createElement('div');
  body.className = 'thinking-body';
  body.textContent = text;
  card.appendChild(body);

  head.addEventListener('click', () => {
    const open = card.classList.toggle('expanded');
    card.classList.toggle('collapsed', !open);
    head.setAttribute('aria-expanded', open ? 'true' : 'false');
    action.textContent = open ? '收起' : '展開思考';
  });

  return card;
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

  if (type === 'sticker') {
    return renderMediaPart(part, message, context, 'sticker');
  }

  if (type === 'image') {
    return renderMediaPart(part, message, context, 'image');
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

function renderMediaPart(part, message, context, kind) {
  const isPlayer = message.senderType === 'player';
  const row = document.createElement('div');
  row.className = `bubble-row ${isPlayer ? 'from-player' : 'from-character'}`;
  const avatarSource = isPlayer
    ? (context && context.playerAvatar)
    : (context && context.characterAvatar);
  const avatarEl = createAvatarEl(avatarSource, 'bubble-avatar');
  const bubble = document.createElement('div');
  bubble.className = `bubble media-bubble ${isPlayer ? 'bubble-player' : 'bubble-character'}`;
  const img = document.createElement('button');
  img.type = 'button';
  img.className = kind === 'sticker' ? 'sticker-thumb' : 'photo-thumb';
  const label = mediaLabel(part, context, kind);
  img.textContent = label;
  const assetId = kind === 'sticker'
    ? stickerAssetId(part.stickerId, context)
    : part.assetId;
  if (assetId) {
    getObjectURL(assetId).then((url) => {
      if (!url) return;
      img.textContent = '';
      const image = document.createElement('img');
      image.src = url;
      image.alt = label;
      img.appendChild(image);
      img.addEventListener('click', () => openLightbox(url, label));
    });
  }
  bubble.appendChild(img);
  if (kind === 'image' && part.altText) {
    const alt = document.createElement('div');
    alt.className = 'media-alt';
    alt.textContent = part.altText;
    bubble.appendChild(alt);
  }
  if (isPlayer) {
    row.appendChild(bubble);
    row.appendChild(avatarEl);
  } else {
    row.appendChild(avatarEl);
    row.appendChild(bubble);
  }
  return row;
}

function stickerAssetId(stickerId, context) {
  const sticker = (context.stickers || []).find((s) => s.id === stickerId);
  return sticker && sticker.assetId;
}

function mediaLabel(part, context, kind) {
  if (kind === 'sticker') {
    const sticker = (context.stickers || []).find((s) => s.id === part.stickerId);
    return sticker ? `（貼圖：${sticker.label}）` : '（貼圖缺失）';
  }
  return part.altText ? `（照片：${part.altText}）` : '（照片）';
}

function openLightbox(url, label) {
  const overlay = document.createElement('div');
  overlay.className = 'media-lightbox';
  const img = document.createElement('img');
  img.src = url;
  img.alt = label || '';
  overlay.appendChild(img);
  overlay.addEventListener('click', () => overlay.remove());
  document.body.appendChild(overlay);
}

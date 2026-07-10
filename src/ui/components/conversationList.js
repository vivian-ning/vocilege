// src/ui/components/conversationList.js
//
// V7 對話列表：direct 聊天列表 + group 佔位。可作為整頁列表或桌面 master 欄。

import { createGroupConversation, deleteCharacter, deleteGroupConversation, selectConversation } from '../../state/store.js';
import { getStats } from '../../services/statsService.js';
import { applyAvatar } from '../avatar.js';
import { navigate } from '../router.js';
import { openCharacterCreator } from './characterEditor.js';
import { confirmDialog } from '../dialog.js';

let activeType = 'direct';

export function renderConversationList(container, state, options = {}) {
  container.textContent = '';
  const showTabs = options.showTabs !== false;
  const showAdd = options.showAdd !== false;

  const shell = document.createElement('div');
  shell.className = 'conversation-list-view';

  const head = document.createElement('div');
  head.className = 'conversation-list-head';
  const title = document.createElement('h1');
  title.className = 'conversation-list-title';
  title.textContent = '聊天';
  head.appendChild(title);
  if (showAdd) {
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'btn btn-primary conversation-add';
    add.textContent = activeType === 'group' ? '+ 新增群聊' : '+ 新增角色';
    add.addEventListener('click', () => {
      if (activeType === 'group') openGroupCreator(state);
      else openCharacterCreator();
    });
    head.appendChild(add);
  }
  shell.appendChild(head);

  if (showTabs) shell.appendChild(typeTabs(container, state, options));

  const body = document.createElement('div');
  body.className = 'conversation-list-body';
  shell.appendChild(body);

  if (activeType === 'group') {
    const group = (state.conversations || [])
      .filter((c) => c.type === 'group')
      .sort((a, b) => (b.lastMessageAt || b.updatedAt || b.createdAt || 0) - (a.lastMessageAt || a.updatedAt || a.createdAt || 0));
    if (group.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'list-empty group-empty';
      empty.textContent = '還沒有群聊。至少選 2 位角色開始合聲。';
      body.appendChild(empty);
    } else {
      for (const conv of group) body.appendChild(renderItem(conv, state));
      fillConversationPreviews(body, state);
    }
    container.appendChild(shell);
    return;
  }

  const direct = (state.conversations || [])
    .filter((c) => c.type === 'direct')
    .sort((a, b) => (b.lastMessageAt || b.updatedAt || b.createdAt || 0) - (a.lastMessageAt || a.updatedAt || a.createdAt || 0));

  if (direct.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'list-empty';
    empty.textContent = '還沒有角色。點「新增角色」開始。';
    body.appendChild(empty);
  } else {
    for (const conv of direct) body.appendChild(renderItem(conv, state));
    fillConversationPreviews(body, state);
  }

  container.appendChild(shell);
}

function typeTabs(container, state, options) {
  const tabs = document.createElement('div');
  tabs.className = 'conversation-tabs';
  for (const tab of [{ key: 'direct', label: '聊天' }, { key: 'group', label: '群聊' }]) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'conversation-tab' + (activeType === tab.key ? ' active' : '');
    btn.textContent = tab.label;
    btn.setAttribute('aria-pressed', activeType === tab.key ? 'true' : 'false');
    btn.addEventListener('click', () => {
      activeType = tab.key;
      renderConversationList(container, state, options);
    });
    tabs.appendChild(btn);
  }
  return tabs;
}

function renderItem(conv, state) {
  const item = document.createElement('div');
  item.tabIndex = 0;
  item.setAttribute('role', 'button');
  item.className = 'conv-item';
  if (conv.id === state.currentConversationId) item.classList.add('active');

  const character = (state.characters || []).find((c) => c.id === conv.primaryCharacterId);
  const members = conv.type === 'group'
    ? (conv.memberIds || [])
        .filter((id) => id !== 'player')
        .map((id) => (state.characters || []).find((c) => c.id === id))
        .filter(Boolean)
    : [];

  const avatar = document.createElement('span');
  avatar.className = 'conv-avatar avatar';
  if (conv.type === 'group') {
    avatar.classList.add('group-conv-avatar');
    avatar.textContent = '合';
  } else {
    applyAvatar(avatar, character ? character.avatar : null);
  }

  const meta = document.createElement('span');
  meta.className = 'conv-meta';

  const top = document.createElement('span');
  top.className = 'conv-topline';
  const name = document.createElement('span');
  name.className = 'conv-name';
  name.textContent = deriveTitle(conv, character);
  const time = document.createElement('span');
  time.className = 'conv-time';
  time.dataset.convTime = conv.id;
  time.textContent = conv.lastMessageAt ? formatRelative(conv.lastMessageAt) : '';
  top.appendChild(name);
  top.appendChild(time);

  const desc = document.createElement('span');
  desc.className = 'conv-desc';
  desc.dataset.convId = conv.id;
  desc.textContent = '讀取最後一句…';

  const unread = document.createElement('span');
  unread.className = 'conv-unread';
  unread.dataset.convUnread = conv.id;
  unread.setAttribute('aria-hidden', 'true');

  meta.appendChild(top);
  meta.appendChild(desc);

  const del = document.createElement('button');
  del.className = 'conv-delete';
  del.type = 'button';
  del.title = conv.type === 'group' ? '刪除群聊' : '刪除角色';
  del.setAttribute('aria-label', conv.type === 'group' ? '刪除群聊' : '刪除角色');
  del.textContent = '×';
  del.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (conv.type === 'group') {
      const ok = await confirmDialog({
        title: '刪除群聊',
        message: `確定要刪除群聊「${deriveTitle(conv, character)}」嗎？\n\n將刪除此群聊與聊天紀錄，但不會刪除任何角色、聲痕、節拍或約定。`,
        confirmText: '刪除',
        danger: true
      });
      if (!ok) return;
      const wasCurrent = conv.id === state.currentConversationId;
      await deleteGroupConversation(conv.id);
      if (wasCurrent) navigate('/chats');
      return;
    }
    if (!character) return;
    const ok = await confirmDialog({
      title: '刪除角色',
      message: `確定要刪除角色「${character.name}」嗎？\n\n將同時刪除該角色的所有對話與聊天紀錄，此動作無法復原。`,
      confirmText: '刪除',
      danger: true
    });
    if (ok) deleteCharacter(character.id);
  });

  item.addEventListener('click', () => navigate(`/chat/${conv.id}`));
  item.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      navigate(`/chat/${conv.id}`);
    }
  });
  item.appendChild(avatar);
  item.appendChild(meta);
  item.appendChild(unread);
  item.appendChild(del);
  if (conv.type === 'group' && members.length) {
    desc.textContent = members.map((m) => m.name || '角色').join('、');
  }
  return item;
}

function openGroupCreator(state) {
  const characters = state.characters || [];
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const modal = document.createElement('div');
  modal.className = 'modal group-create-modal';

  const form = document.createElement('div');
  form.className = 'char-form group-create-form';

  const title = document.createElement('h2');
  title.className = 'modal-title';
  title.textContent = '新增群聊';
  form.appendChild(title);

  const name = document.createElement('input');
  name.type = 'text';
  name.className = 'form-control';
  name.placeholder = '群聊名稱（預設：合聲）';
  form.appendChild(name);

  const first = document.createElement('textarea');
  first.className = 'form-control';
  first.rows = 3;
  first.placeholder = '開場備註（選填，會以系統提示放入群聊）';
  form.appendChild(first);

  const list = document.createElement('div');
  list.className = 'group-member-list';
  for (const character of characters) {
    const label = document.createElement('label');
    label.className = 'group-member-option';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = character.id;
    const text = document.createElement('span');
    text.textContent = character.name || '未命名角色';
    label.appendChild(input);
    label.appendChild(text);
    list.appendChild(label);
  }
  form.appendChild(list);

  const hint = document.createElement('div');
  hint.className = 'form-hint';
  hint.textContent = characters.length < 2 ? '至少需要 2 位角色才能建立群聊。' : '被 @ 的角色會先回覆，其餘角色隨機接續。';
  form.appendChild(hint);

  const actions = document.createElement('div');
  actions.className = 'form-actions';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'btn';
  cancel.textContent = '取消';
  cancel.addEventListener('click', () => overlay.remove());
  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'btn btn-primary';
  save.textContent = '建立';
  save.disabled = characters.length < 2;
  save.addEventListener('click', async () => {
    const ids = Array.from(list.querySelectorAll('input[type="checkbox"]:checked')).map((input) => input.value);
    if (ids.length < 2) {
      hint.textContent = '請至少選擇 2 位角色。';
      return;
    }
    const conv = await createGroupConversation({
      title: name.value,
      firstMessage: first.value,
      memberIds: ids
    });
    overlay.remove();
    if (conv) {
      await selectConversation(conv.id);
      navigate(`/chat/${conv.id}`);
    }
  });
  actions.appendChild(cancel);
  actions.appendChild(save);
  form.appendChild(actions);
  modal.appendChild(form);

  overlay.appendChild(modal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  name.focus();
}

async function fillConversationPreviews(scope, state) {
  let stats;
  try {
    stats = await getStats(state);
  } catch (e) {
    return;
  }
  scope.querySelectorAll('.conv-desc[data-conv-id]').forEach((node) => {
    const last = stats.lastByConversation[node.dataset.convId];
    node.textContent = last && last.snippet ? last.snippet : '還沒有對話';
    const item = node.closest('.conv-item');
    if (item) {
      const hasUnread = !!(last && last.senderType === 'character' && node.dataset.convId !== state.currentConversationId);
      item.classList.toggle('has-unread', hasUnread);
    }
  });
  scope.querySelectorAll('.conv-time[data-conv-time]').forEach((node) => {
    const last = stats.lastByConversation[node.dataset.convTime];
    node.textContent = last && last.createdAt ? formatRelative(last.createdAt) : node.textContent;
  });
}

function deriveTitle(conv, character) {
  if (conv.type === 'group') return conv.title || '群組聊天';
  return character ? (character.name || '未命名角色') : '（角色已不存在）';
}

const DAY_MS = 86400000;

function formatRelative(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 60000) return '剛剛';
  if (diff < DAY_MS) return `${Math.max(1, Math.floor(diff / 3600000))} 小時前`;
  const days = Math.floor(diff / DAY_MS);
  if (days < 30) return `${days} 天前`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// src/ui/components/conversationList.js
//
// 左欄列表元件，「以 conversation 為單位」渲染（第四節說明）。
// V0 中每個 direct conversation 顯示其對應角色的 avatar / name / description，
// 看起來就是角色列表；未來加入群聊時，同一個元件可直接渲染 group conversation，
// 不需重寫左欄（group 顯示 conversation.title 與成員頭像）。

import { deleteCharacter } from '../../state/store.js';
import { applyAvatar } from '../avatar.js';
import { navigate } from '../router.js';

export function renderConversationList(container, state, handlers) {
  container.textContent = '';

  const conversations = state.conversations || [];

  if (conversations.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'list-empty';
    empty.textContent = '還沒有角色。點下方「+ 新增角色」開始。';
    container.appendChild(empty);
    return;
  }

  // 依 lastMessageAt 由新到舊排序。
  const sorted = [...conversations].sort(
    (a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0)
  );

  for (const conv of sorted) {
    container.appendChild(renderItem(conv, state, handlers));
  }
}

function renderItem(conv, state, handlers) {
  const item = document.createElement('div');
  item.className = 'conv-item';
  if (conv.id === state.currentConversationId) {
    item.classList.add('active');
  }

  // V0：direct conversation → 派生自角色。
  const character = state.characters.find((c) => c.id === conv.primaryCharacterId);

  const avatar = document.createElement('div');
  avatar.className = 'conv-avatar avatar';
  applyAvatar(avatar, character ? character.avatar : null);

  const meta = document.createElement('div');
  meta.className = 'conv-meta';

  const name = document.createElement('div');
  name.className = 'conv-name';
  // direct title 派生自角色 name；group 未來用 conv.title。
  name.textContent = deriveTitle(conv, character);

  const desc = document.createElement('div');
  desc.className = 'conv-desc';
  desc.textContent = character ? (character.description || '') : '';

  meta.appendChild(name);
  meta.appendChild(desc);

  const del = document.createElement('button');
  del.className = 'conv-delete';
  del.type = 'button';
  del.title = '刪除角色';
  del.textContent = '🗑';
  del.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!character) return;
    const ok = window.confirm(
      `確定要刪除角色「${character.name}」嗎？\n\n將同時刪除該角色的所有對話與聊天紀錄，此動作無法復原。`
    );
    if (ok) {
      deleteCharacter(character.id);
    }
  });

  // 點擊導向 #/chat/:conversationId（指標同步由聊天頁 render 走 selectConversation）。
  item.addEventListener('click', () => {
    navigate(`/chat/${conv.id}`);
  });

  item.appendChild(avatar);
  item.appendChild(meta);
  item.appendChild(del);
  return item;
}

function deriveTitle(conv, character) {
  if (conv.type === 'group') {
    return conv.title || '群組聊天';
  }
  return character ? character.name : '（角色已不存在）';
}

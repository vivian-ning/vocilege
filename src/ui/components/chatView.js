// src/ui/components/chatView.js
//
// 中欄聊天室（第八節）。標題從目前角色 name 派生；訊息列表由 messageRenderer 渲染；
// 底部輸入框 + 送出按鈕，走 store.sendPlayerMessage。

import { renderMessage } from './messageRenderer.js';
import {
  sendPlayerMessage,
  getCurrentMessages,
  isTyping,
  getPendingError,
  retryLastReply,
  updateConversationPersona,
  maybeExtractDreamMemories,
  addMemory,
  updateMemory,
  deleteMemory,
  sendStickerMessage,
  sendPhotoMessage,
  exportConversationBook,
  selectCharacter,
  deleteGroupConversation
} from '../../state/store.js';
import { usesMock } from '../../services/aiService.js';
import { getObjectURL, saveImageAsset } from '../../services/assetService.js';
import { applyAvatar } from '../avatar.js';
import { navigate } from '../router.js';
import { createWaveBars } from '../wave.js';
import { iconButton } from '../icons.js';
import { createToggle } from '../toggle.js';

export function renderChatView(container, state) {
  container.textContent = '';

  const character = state.characters.find((c) => c.id === state.currentCharacterId);
  const conversation = state.conversations.find((c) => c.id === state.currentConversationId);
  const isGroup = conversation && conversation.type === 'group';
  const groupMembers = isGroup
    ? (conversation.memberIds || [])
        .filter((id) => id !== 'player')
        .map((id) => state.characters.find((c) => c.id === id))
        .filter(Boolean)
    : [];

  // 空狀態：沒有選取任何角色 / 對話。
  if (!conversation || (!isGroup && !character)) {
    const empty = document.createElement('div');
    empty.className = 'chat-empty';
    empty.textContent = '選擇左側角色開始對話，或先新增一個角色。';
    container.appendChild(empty);
    return;
  }

  // 標題
  const header = document.createElement('div');
  header.className = 'chat-header';
  if (window.matchMedia && window.matchMedia('(max-width: 760px)').matches) {
    const back = iconButton('left', '返回聊天列表', { className: 'icon-btn chat-back-btn', title: '返回' });
    back.addEventListener('click', () => navigate('/chats'));
    header.appendChild(back);
  }
  const profileBtn = document.createElement('button');
  profileBtn.type = 'button';
  profileBtn.className = 'chat-header-profile';
  profileBtn.setAttribute('aria-label', isGroup ? '群聊' : `回到 ${character.name || '角色'} 的聲庭`);
  profileBtn.title = isGroup ? '群聊' : `回到 ${character.name || '角色'} 的聲庭`;
  profileBtn.addEventListener('click', async () => {
    if (isGroup) return;
    await selectCharacter(character.id);
    navigate('/home');
  });

  const avatar = document.createElement('span');
  avatar.className = 'chat-header-avatar avatar';
  if (isGroup) {
    avatar.classList.add('group-conv-avatar');
    avatar.textContent = '合';
  } else {
    applyAvatar(avatar, character.avatar);
  }
  const titleWrap = document.createElement('span');
  titleWrap.className = 'chat-header-titlewrap';
  const title = document.createElement('span');
  title.className = 'chat-header-title';
  title.textContent = isGroup ? (conversation.title || '合聲') : character.name; // direct 派生自角色 name
  titleWrap.appendChild(title);
  if (isGroup && groupMembers.length) {
    const memberLine = document.createElement('span');
    memberLine.className = 'chat-header-mock';
    memberLine.textContent = groupMembers.map((c) => c.name || '角色').join('、');
    titleWrap.appendChild(memberLine);
  }

  // 未設定 API 時，標題列以小字提示「模擬回覆中」。
  if (usesMock(state.apiSettings)) {
    const mockHint = document.createElement('span');
    mockHint.className = 'chat-header-mock';
    mockHint.textContent = '模擬回覆中（未設定 API）';
    titleWrap.appendChild(mockHint);
  }

  profileBtn.appendChild(avatar);
  profileBtn.appendChild(titleWrap);
  header.appendChild(profileBtn);

  const headerActions = document.createElement('div');
  headerActions.className = 'chat-header-actions';

  if (!isGroup) {
    const enabledMemCount = (state.memories || []).filter((m) => m.characterId === character.id && (m.status || 'active') === 'active' && m.enabled !== false).length;
    const memoryBtn = iconButton('brain', `開啟聲痕（${enabledMemCount} 筆）`, { className: 'icon-btn chat-icon-btn', title: '聲痕' });
    const badge = document.createElement('span');
    badge.className = 'icon-badge';
    badge.textContent = String(enabledMemCount);
    memoryBtn.appendChild(badge);
    memoryBtn.addEventListener('click', () => openMemoryDrawer(state, character, conversation));
    headerActions.appendChild(memoryBtn);
  }

  const moreBtn = iconButton('ellipsis', '開啟更多聊天操作', { className: 'icon-btn chat-icon-btn', title: '更多' });
  moreBtn.addEventListener('click', () => openChatOverflowMenu(moreBtn, conversation));
  headerActions.appendChild(moreBtn);

  header.appendChild(headerActions);
  container.appendChild(header);

  // 訊息列表
  const list = document.createElement('div');
  list.className = 'chat-messages';

  const messages = getCurrentMessages();
  const ctx = {
    player: state.player,
    playerAvatar: state.player ? state.player.avatar : null,
    characterName: character ? character.name : '',
    characterAvatar: character ? character.avatar : null,
    characters: state.characters || [],
    settings: state.settings,
    lastCharacterMessageId: findLastCharacterMessageId(messages),
    keepsakes: state.keepsakes || [],
    stickers: state.stickers || []
  };

  for (const msg of messages) {
    list.appendChild(renderMessage(msg, ctx));
  }

  // 「輸入中」指示：聲波跳動 + 文字
  const typingNow = isTyping();
  if (typingNow) {
    const typing = document.createElement('div');
    typing.className = 'typing-indicator';
    typing.appendChild(createWaveBars());
    const label = document.createElement('span');
    label.textContent = isGroup ? '群聊正在回覆…' : `${character.name} 正在輸入…`;
    typing.appendChild(label);
    list.appendChild(typing);
  }

  // 錯誤條（非 message、不存入 DB）：API 失敗時顯示可讀訊息 + 「重試」按鈕。
  const pendingError = getPendingError();
  if (pendingError && !typingNow) {
    const errBar = document.createElement('div');
    errBar.className = 'error-bar';

    const errText = document.createElement('span');
    errText.className = 'error-bar-text';
    errText.textContent = `⚠ ${pendingError.message}`;
    errBar.appendChild(errText);

    const retryBtn = document.createElement('button');
    retryBtn.type = 'button';
    retryBtn.className = 'error-bar-retry';
    retryBtn.textContent = '重試';
    retryBtn.addEventListener('click', () => {
      retryLastReply();
    });
    errBar.appendChild(retryBtn);

    list.appendChild(errBar);
  }

  container.appendChild(list);

  // 捲到底部（渲染後）。
  requestAnimationFrame(() => {
    list.scrollTop = list.scrollHeight;
  });

  // 輸入區
  const inputBar = document.createElement('form');
  inputBar.className = 'chat-input-bar';

  const textarea = document.createElement('textarea');
  textarea.className = 'chat-input';
  textarea.placeholder = '輸入訊息…';
  textarea.title = 'Enter 送出，Shift+Enter 換行';
  textarea.rows = 1;

  const sendBtn = iconButton('send', '送出訊息', { className: 'icon-btn chat-send', title: '送出' });
  sendBtn.type = 'submit';

  // 等待回覆期間停用輸入框與送出鈕。
  if (typingNow) {
    textarea.disabled = true;
    sendBtn.disabled = true;
  }

  const stickerBtn = iconButton('smile', '選擇貼圖', { className: 'icon-btn chat-send', title: '貼圖' });
  stickerBtn.disabled = typingNow || !(state.stickers || []).length;
  stickerBtn.addEventListener('click', () => openStickerMenu(state.stickers || []));

  const photoInput = document.createElement('input');
  photoInput.type = 'file';
  photoInput.accept = 'image/*';
  photoInput.style.display = 'none';
  const photoBtn = iconButton('image', '加入照片', { className: 'icon-btn chat-send', title: '照片' });
  photoBtn.disabled = typingNow;
  photoBtn.addEventListener('click', () => photoInput.click());
  photoInput.addEventListener('change', async () => {
    const file = photoInput.files && photoInput.files[0];
    if (!file) return;
    openPhotoDialog(file);
    photoInput.value = '';
  });

  const submit = () => {
    if (typingNow) return;
    const text = textarea.value;
    if (!text.trim()) return;
    textarea.value = '';
    closeMentionMenu();
    sendPlayerMessage(text);
  };

  inputBar.addEventListener('submit', (e) => {
    e.preventDefault();
    submit();
  });

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeMentionMenu();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  });
  if (isGroup) {
    textarea.addEventListener('input', () => updateMentionMenu());
    textarea.addEventListener('keyup', () => updateMentionMenu());
    textarea.addEventListener('click', () => updateMentionMenu());
    textarea.addEventListener('blur', () => {
      window.setTimeout(() => {
        const menu = document.querySelector('.mention-menu');
        if (menu && !menu.matches(':hover')) closeMentionMenu();
      }, 120);
    });
  }

  inputBar.appendChild(stickerBtn);
  inputBar.appendChild(photoBtn);
  inputBar.appendChild(photoInput);
  inputBar.appendChild(textarea);
  inputBar.appendChild(sendBtn);
  container.appendChild(inputBar);

  function getMentionQuery() {
    const cursor = textarea.selectionStart || 0;
    const before = textarea.value.slice(0, cursor);
    const match = /(^|\s)@([^\s@]*)$/.exec(before);
    if (!match) return null;
    return {
      query: match[2] || '',
      start: cursor - (match[2] || '').length - 1,
      end: cursor
    };
  }

  function updateMentionMenu() {
    if (!isGroup || textarea.disabled) {
      closeMentionMenu();
      return;
    }
    const mention = getMentionQuery();
    if (!mention) {
      closeMentionMenu();
      return;
    }
    const q = mention.query.trim().toLowerCase();
    const matched = groupMembers.filter((member) => {
      const name = String(member.name || '角色').toLowerCase();
      return !q || name.includes(q);
    });
    if (!matched.length) {
      closeMentionMenu();
      return;
    }
    openMentionMenu(matched, mention);
  }

  function openMentionMenu(members, mention) {
    closeMentionMenu();
    const menu = document.createElement('div');
    menu.className = 'mention-menu';
    menu.setAttribute('role', 'listbox');
    menu.setAttribute('aria-label', '提及群聊成員');
    const rect = textarea.getBoundingClientRect();
    menu.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - 292))}px`;
    menu.style.bottom = `${Math.max(12, window.innerHeight - rect.top + 8)}px`;
    menu.style.maxHeight = `${Math.min(260, window.innerHeight - 24)}px`;
    for (const member of members) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mention-option';
      btn.setAttribute('role', 'option');
      btn.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        insertMention(member, mention);
      });
      const avatarEl = document.createElement('span');
      avatarEl.className = 'mention-avatar avatar';
      applyAvatar(avatarEl, member.avatar);
      const nameEl = document.createElement('span');
      nameEl.className = 'mention-name';
      nameEl.textContent = member.name || '角色';
      btn.appendChild(avatarEl);
      btn.appendChild(nameEl);
      menu.appendChild(btn);
    }
    const closeOnPointer = (event) => {
      if (!menu.contains(event.target) && event.target !== textarea) closeMentionMenu();
    };
    const closeOnKey = (event) => {
      if (event.key === 'Escape') closeMentionMenu();
    };
    menu._cleanup = () => {
      document.removeEventListener('pointerdown', closeOnPointer);
      document.removeEventListener('keydown', closeOnKey);
    };
    document.body.appendChild(menu);
    requestAnimationFrame(() => {
      document.addEventListener('pointerdown', closeOnPointer);
      document.addEventListener('keydown', closeOnKey);
    });
  }

  function insertMention(member, mention) {
    const name = member.name || '角色';
    const before = textarea.value.slice(0, mention.start);
    const after = textarea.value.slice(mention.end);
    const inserted = `@${name} `;
    textarea.value = before + inserted + after;
    const pos = before.length + inserted.length;
    closeMentionMenu();
    textarea.focus();
    textarea.setSelectionRange(pos, pos);
  }

  function closeMentionMenu() {
    const old = document.querySelector('.mention-menu');
    if (!old) return;
    if (typeof old._cleanup === 'function') old._cleanup();
    old.remove();
  }

  function openChatOverflowMenu(anchor, conv) {
    closeChatOverflowMenu();
    const menu = document.createElement('div');
    menu.className = 'chat-overflow-menu';
    menu.setAttribute('role', 'menu');
    menu.tabIndex = -1;
    const rect = anchor.getBoundingClientRect();
    menu.style.top = `${Math.min(window.innerHeight - 12, rect.bottom + 8)}px`;
    menu.style.right = `${Math.max(12, window.innerWidth - rect.right)}px`;

    const addItem = (label, onClick, active = false) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chat-overflow-item' + (active ? ' active' : '');
      btn.setAttribute('role', 'menuitem');
      btn.textContent = label;
      btn.addEventListener('click', () => {
        closeChatOverflowMenu();
        onClick();
      });
      menu.appendChild(btn);
    };
    addItem('成書（HTML）', () => exportConversationBook('html'));
    addItem('成書（Markdown）', () => exportConversationBook('markdown'));
    if (conv.type !== 'group') addItem('此對話的我', () => openPersonaPanel(conv), !!conv.playerPersona);
    if (conv.type === 'group') {
      addItem('刪除群聊', async () => {
        const ok = window.confirm(
          `確定要刪除群聊「${conv.title || '合聲'}」嗎？\n\n將刪除此群聊與聊天紀錄，但不會刪除任何角色、聲痕、節拍或約定。`
        );
        if (!ok) return;
        await deleteGroupConversation(conv.id);
        navigate('/chats');
      });
    }

    const closeOnPointer = (event) => {
      if (!menu.contains(event.target) && event.target !== anchor) closeChatOverflowMenu();
    };
    const closeOnKey = (event) => {
      if (event.key === 'Escape') closeChatOverflowMenu();
    };
    menu._cleanup = () => {
      document.removeEventListener('pointerdown', closeOnPointer);
      document.removeEventListener('keydown', closeOnKey);
    };
    document.body.appendChild(menu);
    requestAnimationFrame(() => {
      document.addEventListener('pointerdown', closeOnPointer);
      document.addEventListener('keydown', closeOnKey);
      menu.focus();
    });
  }

  function closeChatOverflowMenu() {
    const old = document.querySelector('.chat-overflow-menu');
    if (!old) return;
    if (typeof old._cleanup === 'function') old._cleanup();
    old.remove();
  }

  function openStickerMenu(stickers) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const modal = document.createElement('div');
    modal.className = 'modal sticker-picker-modal';
    const title = document.createElement('h2');
    title.className = 'modal-title';
    title.textContent = '貼圖';
    modal.appendChild(title);
    const grid = document.createElement('div');
    grid.className = 'sticker-picker-grid';
    for (const sticker of stickers) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sticker-picker-item';
      btn.textContent = sticker.contextText || '貼圖';
      getObjectURL(sticker.assetId).then((url) => {
        if (!url) return;
        btn.textContent = '';
        const img = document.createElement('img');
        img.src = url;
        img.alt = sticker.contextText || '貼圖';
        const cap = document.createElement('span');
        cap.textContent = sticker.contextText || '貼圖';
        btn.appendChild(img);
        btn.appendChild(cap);
      });
      btn.addEventListener('click', async () => {
        await sendStickerMessage(sticker.id);
        overlay.remove();
      });
      grid.appendChild(btn);
    }
    modal.appendChild(grid);
    overlay.appendChild(modal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }

  function openPhotoDialog(file) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const modal = document.createElement('div');
    modal.className = 'modal';
    const title = document.createElement('h2');
    title.className = 'modal-title';
    title.textContent = '照片';
    modal.appendChild(title);
    const alt = document.createElement('input');
    alt.type = 'text';
    alt.className = 'form-control';
    alt.placeholder = '描述這張照片（選填）';
    modal.appendChild(alt);
    const actions = document.createElement('div');
    actions.className = 'form-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn';
    cancel.textContent = '取消';
    cancel.addEventListener('click', () => overlay.remove());
    const send = document.createElement('button');
    send.type = 'button';
    send.className = 'btn btn-primary';
    send.textContent = '送出';
    send.addEventListener('click', async () => {
      send.disabled = true;
      const assetId = await saveImageAsset(file, 'photo', 1280);
      await sendPhotoMessage(assetId, alt.value);
      overlay.remove();
    });
    actions.appendChild(cancel);
    actions.appendChild(send);
    modal.appendChild(actions);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    alt.focus();
  }
}

function findLastCharacterMessageId(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].senderType === 'character') return messages[i].id;
  }
  return '';
}

// 「此對話的我」面板（任務四）：編輯 conversation.playerPersona。
// 兩欄皆留空（或清除）代表使用設定頁的全域玩家設定。
function openPersonaPanel(conversation) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'modal persona-modal';

  const title = document.createElement('h2');
  title.className = 'modal-title';
  title.textContent = '此對話的我';
  modal.appendChild(title);

  const hint = document.createElement('p');
  hint.className = 'form-hint';
  hint.textContent = '為這個對話設定專屬的玩家名稱與描述。留空則使用設定頁的玩家設定。';
  modal.appendChild(hint);

  const persona = conversation.playerPersona || { name: '', description: '' };

  const nameField = personaField('對話中的我（名稱）', 'input', persona.name || '', '留空 = 用全域玩家名稱');
  const descField = personaField('對話中的我（描述）', 'textarea', persona.description || '', '留空 = 用全域玩家描述');
  modal.appendChild(nameField.el);
  modal.appendChild(descField.el);

  const actions = document.createElement('div');
  actions.className = 'form-actions';

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'btn';
  clearBtn.textContent = '清除覆蓋';
  clearBtn.addEventListener('click', async () => {
    await updateConversationPersona(conversation.id, { name: '', description: '' });
    close();
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn';
  cancelBtn.textContent = '取消';
  cancelBtn.addEventListener('click', close);

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn btn-primary';
  saveBtn.textContent = '儲存';
  saveBtn.addEventListener('click', async () => {
    await updateConversationPersona(conversation.id, {
      name: nameField.getValue(),
      description: descField.getValue()
    });
    close();
  });

  actions.appendChild(clearBtn);
  actions.appendChild(cancelBtn);
  actions.appendChild(saveBtn);
  modal.appendChild(actions);

  function close() {
    if (overlay.parentNode) document.body.removeChild(overlay);
  }
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  const firstInput = modal.querySelector('input, textarea');
  if (firstInput) firstInput.focus();
}

function personaField(label, type, value, placeholder) {
  const el = document.createElement('label');
  el.className = 'form-field';
  const labelEl = document.createElement('span');
  labelEl.className = 'form-label';
  labelEl.textContent = label;
  el.appendChild(labelEl);
  let control;
  if (type === 'textarea') {
    control = document.createElement('textarea');
    control.rows = 2;
  } else {
    control = document.createElement('input');
    control.type = 'text';
  }
  control.className = 'form-control';
  control.value = value;
  control.placeholder = placeholder || '';
  el.appendChild(control);
  return { el, getValue: () => control.value };
}

export function openMemoryDrawer(state, character, conversation) {
  const overlay = document.createElement('div');
  overlay.className = 'memory-drawer-overlay';
  const panel = document.createElement('div');
  panel.className = 'memory-drawer';

  const head = document.createElement('div');
  head.className = 'memory-drawer-head';
  const title = document.createElement('h2');
  title.textContent = '聲痕';
  head.appendChild(title);
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn';
  addBtn.className = 'icon-btn';
  addBtn.setAttribute('aria-label', '手動新增聲痕');
  addBtn.title = '手動新增聲痕';
  addBtn.appendChild(document.createTextNode('+'));
  addBtn.addEventListener('click', () => openMemoryEditor(character.id));
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'btn';
  close.className = 'icon-btn';
  close.setAttribute('aria-label', '關閉聲痕抽屜');
  close.title = '關閉';
  close.appendChild(document.createTextNode('×'));
  const closeMemoryDrawer = () => {
    window.removeEventListener('hashchange', closeMemoryDrawer);
    overlay.remove();
  };
  close.addEventListener('click', closeMemoryDrawer);
  head.appendChild(addBtn);
  head.appendChild(close);
  panel.appendChild(head);

  const dreamBtn = document.createElement('button');
  dreamBtn.type = 'button';
  dreamBtn.className = 'btn btn-primary memory-dream-btn';
  dreamBtn.textContent = `AI 總結近期 ${state.settings.dreamEveryMessages} 則對話`;
  dreamBtn.disabled = !conversation;
  if (!conversation) dreamBtn.title = '尚未建立對話，無法夢釀';
  dreamBtn.addEventListener('click', async () => {
    if (!conversation) return;
    dreamBtn.disabled = true;
    try {
      const added = await maybeExtractDreamMemories(conversation.id, { automatic: false });
      if (added && added.length) showToast('夢釀完成');
    } finally {
      dreamBtn.disabled = false;
    }
  });
  panel.appendChild(dreamBtn);

  const list = document.createElement('div');
  list.className = 'memory-drawer-list';
  const memories = (state.memories || [])
    .filter((m) => m.characterId === character.id && (m.status || 'active') === 'active')
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  for (const m of memories) list.appendChild(memoryDrawerItem(m, character.id));
  if (!memories.length) {
    const empty = document.createElement('div');
    empty.className = 'form-hint';
    empty.textContent = '還沒有聲痕。';
    list.appendChild(empty);
  }
  panel.appendChild(list);

  const enabled = memories.filter((m) => m.enabled !== false);
  const chars = enabled.reduce((n, m) => n + String(m.content || '').length, 0);
  const foot = document.createElement('div');
  foot.className = 'memory-drawer-foot';
  foot.textContent = `已開啟 ${enabled.length} 筆 · 約 ${Math.ceil(chars / 2)} token`;
  panel.appendChild(foot);

  overlay.appendChild(panel);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeMemoryDrawer(); });
  window.addEventListener('hashchange', closeMemoryDrawer);
  document.body.appendChild(overlay);
}

function memoryDrawerItem(m, characterId) {
  const row = document.createElement('div');
  row.className = 'memory-drawer-item';
  const toggle = createToggle({
    checked: m.enabled !== false,
    label: '',
    className: 'memory-toggle',
    onChange: (checked) => updateMemory(m.id, { enabled: checked })
  });
  row.appendChild(toggle.el);
  const body = document.createElement('div');
  body.className = 'memory-drawer-item-body';
  const title = document.createElement('div');
  title.className = 'memory-drawer-item-title';
  title.textContent = m.source === 'extracted' ? `${dateStamp(m.createdAt)} 對話摘要` : (m.summary || firstLine(m.content));
  body.appendChild(title);
  const preview = document.createElement('div');
  preview.className = 'memory-drawer-preview';
  preview.textContent = firstLine(m.content);
  body.appendChild(preview);
  row.appendChild(body);
  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'msg-tool-btn';
  edit.setAttribute('aria-label', '編輯聲痕');
  edit.title = '編輯聲痕';
  edit.textContent = '✎';
  edit.addEventListener('click', () => openMemoryEditor(characterId, m));
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'msg-tool-btn';
  del.setAttribute('aria-label', '刪除聲痕');
  del.title = '刪除聲痕';
  del.textContent = '×';
  del.addEventListener('click', () => {
    if (window.confirm('確定要刪除這筆聲痕嗎？')) deleteMemory(m.id);
  });
  row.appendChild(edit);
  row.appendChild(del);
  return row;
}

function openMemoryEditor(characterId, initial) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const modal = document.createElement('div');
  modal.className = 'modal';
  const title = document.createElement('h2');
  title.className = 'modal-title';
  title.textContent = initial ? '編輯聲痕' : '新增聲痕';
  modal.appendChild(title);
  const content = document.createElement('textarea');
  content.className = 'form-control';
  content.rows = 4;
  content.value = initial ? initial.content || '' : '';
  modal.appendChild(content);
  const summary = document.createElement('input');
  summary.type = 'text';
  summary.className = 'form-control';
  summary.placeholder = '摘要（選填）';
  summary.value = initial ? initial.summary || '' : '';
  modal.appendChild(summary);
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
  save.textContent = '儲存';
  save.addEventListener('click', async () => {
    const data = { content: content.value, summary: summary.value, enabled: true };
    if (initial) await updateMemory(initial.id, data);
    else await addMemory(characterId, data);
    overlay.remove();
  });
  actions.appendChild(cancel);
  actions.appendChild(save);
  modal.appendChild(actions);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  content.focus();
}

function firstLine(text) {
  return String(text || '').split(/\n/)[0].trim();
}

function dateStamp(ts) {
  const d = new Date(ts || Date.now());
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function showToast(message) {
  window.dispatchEvent(new CustomEvent('vocilege:toast', { detail: { message } }));
}

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
  exportConversationBook
} from '../../state/store.js';
import { usesMock } from '../../services/aiService.js';
import { getObjectURL, saveImageAsset } from '../../services/assetService.js';
import { applyAvatar } from '../avatar.js';
import { navigate } from '../router.js';

export function renderChatView(container, state) {
  container.textContent = '';

  const character = state.characters.find((c) => c.id === state.currentCharacterId);
  const conversation = state.conversations.find((c) => c.id === state.currentConversationId);

  // 空狀態：沒有選取任何角色 / 對話。
  if (!character || !conversation) {
    const empty = document.createElement('div');
    empty.className = 'chat-empty';
    empty.textContent = '選擇左側角色開始對話，或先新增一個角色。';
    container.appendChild(empty);
    return;
  }

  // 標題
  const header = document.createElement('div');
  header.className = 'chat-header';
  const avatar = document.createElement('span');
  avatar.className = 'chat-header-avatar avatar';
  applyAvatar(avatar, character.avatar);
  const titleWrap = document.createElement('span');
  titleWrap.className = 'chat-header-titlewrap';
  const title = document.createElement('span');
  title.className = 'chat-header-title';
  title.textContent = character.name; // 派生自角色 name
  titleWrap.appendChild(title);

  // 未設定 API 時，標題列以小字提示「模擬回覆中」。
  if (usesMock(state.apiSettings)) {
    const mockHint = document.createElement('span');
    mockHint.className = 'chat-header-mock';
    mockHint.textContent = '模擬回覆中（未設定 API）';
    titleWrap.appendChild(mockHint);
  }

  header.appendChild(avatar);
  header.appendChild(titleWrap);

  // 標題列動作按鈕（靠右）：角色頁 / 此對話的我。
  const headerActions = document.createElement('div');
  headerActions.className = 'chat-header-actions';

  const charPageBtn = document.createElement('button');
  charPageBtn.type = 'button';
  charPageBtn.className = 'chat-header-btn';
  charPageBtn.textContent = '角色頁';
  charPageBtn.title = '相處紀錄與角色設定';
  charPageBtn.addEventListener('click', () => navigate(`/character/${character.id}`));
  headerActions.appendChild(charPageBtn);

  const enabledMemCount = (state.memories || []).filter((m) => m.characterId === character.id && (m.status || 'active') === 'active' && m.enabled !== false).length;
  const memoryBtn = document.createElement('button');
  memoryBtn.type = 'button';
  memoryBtn.className = 'chat-header-btn';
  memoryBtn.textContent = `聲痕 ${enabledMemCount}`;
  memoryBtn.title = '記憶抽屜';
  memoryBtn.addEventListener('click', () => openMemoryDrawer(state, character, conversation));
  headerActions.appendChild(memoryBtn);

  const bookHtml = document.createElement('button');
  bookHtml.type = 'button';
  bookHtml.className = 'chat-header-btn';
  bookHtml.textContent = '成書 HTML';
  bookHtml.addEventListener('click', () => exportConversationBook('html'));
  headerActions.appendChild(bookHtml);

  const bookMd = document.createElement('button');
  bookMd.type = 'button';
  bookMd.className = 'chat-header-btn';
  bookMd.textContent = 'Markdown';
  bookMd.addEventListener('click', () => exportConversationBook('markdown'));
  headerActions.appendChild(bookMd);

  const personaBtn = document.createElement('button');
  personaBtn.type = 'button';
  personaBtn.className = 'chat-header-btn';
  personaBtn.textContent = '此對話的我';
  personaBtn.title = '為這個對話設定專屬的玩家人設（選填）';
  if (conversation.playerPersona) personaBtn.classList.add('active');
  personaBtn.addEventListener('click', () => openPersonaPanel(conversation));
  headerActions.appendChild(personaBtn);

  header.appendChild(headerActions);
  container.appendChild(header);

  // 訊息列表
  const list = document.createElement('div');
  list.className = 'chat-messages';

  const messages = getCurrentMessages();
  const ctx = {
    player: state.player,
    playerAvatar: state.player ? state.player.avatar : null,
    characterName: character.name,
    characterAvatar: character.avatar,
    settings: state.settings,
    lastCharacterMessageId: findLastCharacterMessageId(messages),
    keepsakes: state.keepsakes || [],
    stickers: state.stickers || []
  };

  for (const msg of messages) {
    list.appendChild(renderMessage(msg, ctx));
  }

  // 「輸入中」指示
  const typingNow = isTyping();
  if (typingNow) {
    const typing = document.createElement('div');
    typing.className = 'typing-indicator';
    typing.textContent = `${character.name} 正在輸入…`;
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
  textarea.placeholder = '輸入訊息…（Enter 送出，Shift+Enter 換行）';
  textarea.rows = 1;

  const sendBtn = document.createElement('button');
  sendBtn.type = 'submit';
  sendBtn.className = 'chat-send';
  sendBtn.textContent = '送出';

  // 等待回覆期間停用輸入框與送出鈕。
  if (typingNow) {
    textarea.disabled = true;
    sendBtn.disabled = true;
  }

  const stickerBtn = document.createElement('button');
  stickerBtn.type = 'button';
  stickerBtn.className = 'chat-send';
  stickerBtn.textContent = '小劇場';
  stickerBtn.disabled = typingNow || !(state.stickers || []).length;
  stickerBtn.addEventListener('click', () => openStickerMenu(state.stickers || []));

  const photoInput = document.createElement('input');
  photoInput.type = 'file';
  photoInput.accept = 'image/*';
  photoInput.style.display = 'none';
  const photoBtn = document.createElement('button');
  photoBtn.type = 'button';
  photoBtn.className = 'chat-send';
  photoBtn.textContent = '照片';
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
    sendPlayerMessage(text);
  };

  inputBar.addEventListener('submit', (e) => {
    e.preventDefault();
    submit();
  });

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  });

  inputBar.appendChild(stickerBtn);
  inputBar.appendChild(photoBtn);
  inputBar.appendChild(photoInput);
  inputBar.appendChild(textarea);
  inputBar.appendChild(sendBtn);
  container.appendChild(inputBar);

  function openStickerMenu(stickers) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const modal = document.createElement('div');
    modal.className = 'modal sticker-picker-modal';
    const title = document.createElement('h2');
    title.className = 'modal-title';
    title.textContent = '小劇場';
    modal.appendChild(title);
    const grid = document.createElement('div');
    grid.className = 'sticker-picker-grid';
    for (const sticker of stickers) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sticker-picker-item';
      btn.textContent = sticker.label || '貼圖';
      getObjectURL(sticker.assetId).then((url) => {
        if (!url) return;
        btn.textContent = '';
        const img = document.createElement('img');
        img.src = url;
        img.alt = sticker.label || '';
        const cap = document.createElement('span');
        cap.textContent = sticker.label || '貼圖';
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

function openMemoryDrawer(state, character, conversation) {
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
  addBtn.textContent = '＋';
  addBtn.title = '手動新增聲痕';
  addBtn.addEventListener('click', () => openMemoryEditor(character.id));
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'btn';
  close.textContent = '關閉';
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
  dreamBtn.addEventListener('click', async () => {
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
  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.checked = m.enabled !== false;
  toggle.addEventListener('change', () => updateMemory(m.id, { enabled: toggle.checked }));
  row.appendChild(toggle);
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
  edit.textContent = '✎';
  edit.addEventListener('click', () => openMemoryEditor(characterId, m));
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'msg-tool-btn';
  del.textContent = '🗑';
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

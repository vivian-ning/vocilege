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
  updateConversationPersona
} from '../../state/store.js';
import { usesMock } from '../../services/aiService.js';
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
    lastCharacterMessageId: findLastCharacterMessageId(messages)
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

  inputBar.appendChild(textarea);
  inputBar.appendChild(sendBtn);
  container.appendChild(inputBar);
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

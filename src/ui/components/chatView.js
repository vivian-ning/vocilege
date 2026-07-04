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
  retryLastReply
} from '../../state/store.js';
import { usesMock } from '../../services/aiService.js';
import { countEnabledGlobalPrompts } from '../../services/promptBuilder.js';
import { applyAvatar } from '../avatar.js';
import { navigate } from '../router.js';
import { setSettingsTab } from './settingsPage.js';

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
  container.appendChild(header);

  // 全域 Prompt 生效提示（V2 任務三）：點擊導向設定頁的 Prompt 存放區。
  const gpCount = countEnabledGlobalPrompts(state.globalPrompts);
  if (gpCount > 0) {
    const gpBar = document.createElement('button');
    gpBar.type = 'button';
    gpBar.className = 'global-prompt-indicator';
    gpBar.textContent = `目前有 ${gpCount} 個全域 Prompt 生效 ›`;
    gpBar.title = '前往「設定 → Prompt 存放區」管理';
    gpBar.addEventListener('click', () => { setSettingsTab('prompts'); navigate('/settings'); });
    container.appendChild(gpBar);
  }

  // 訊息列表
  const list = document.createElement('div');
  list.className = 'chat-messages';

  const messages = getCurrentMessages();
  const ctx = {
    player: state.player,
    playerAvatar: state.player ? state.player.avatar : null,
    characterName: character.name,
    characterAvatar: character.avatar,
    settings: state.settings
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

// src/ui/tabs.js
//
// 聊天頁右欄側邊面板（V2 導航改版後的分工）：只保留「角色設定」「玩家設定」——
// 聊天當下會用到的東西。「API 設定」「資料」「Prompt 存放區」已移到設定頁（settingsPage.js）。
//
// active tab 屬於「UI 狀態」而非「資料狀態」，保存在本模組的模組變數，不進入全域 state。

import { renderCharacterEditor } from './components/characterEditor.js';
import { renderPlayerEditor } from './components/playerEditor.js';

const TABS = [
  { key: 'character', label: '角色設定' },
  { key: 'player', label: '玩家設定' }
];

let activeTab = 'character';

export function renderChatSidePanel(container, state) {
  container.textContent = '';

  // 分頁列
  const header = document.createElement('div');
  header.className = 'tab-header';
  for (const tab of TABS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tab-btn' + (tab.key === activeTab ? ' active' : '');
    btn.textContent = tab.label;
    btn.addEventListener('click', () => {
      activeTab = tab.key;
      renderChatSidePanel(container, state); // 只重繪右欄
    });
    header.appendChild(btn);
  }
  container.appendChild(header);

  // 分頁內容
  const body = document.createElement('div');
  body.className = 'tab-body';
  container.appendChild(body);

  if (activeTab === 'player') {
    renderPlayerEditor(body, state);
  } else {
    renderCharacterEditor(body, state);
  }
}

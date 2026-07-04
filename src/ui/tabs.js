// src/ui/tabs.js
//
// 右欄分頁：角色設定 / 玩家設定 / 資料（第八節）。
//
// active tab 屬於「UI 狀態」而非「資料狀態」，因此保存在本模組的模組變數，不進入
// 全域 state / IndexedDB。切換分頁時只重繪右欄。

import { renderCharacterEditor } from './components/characterEditor.js';
import { renderPlayerEditor } from './components/playerEditor.js';
import { renderBackupPanel } from './components/backupPanel.js';
import { renderApiSettingsEditor } from './components/apiSettingsEditor.js';

const TABS = [
  { key: 'character', label: '角色設定' },
  { key: 'player', label: '玩家設定' },
  { key: 'api', label: 'API 設定' },
  { key: 'data', label: '資料' }
];

let activeTab = 'character';

export function renderSettingsPanel(container, state) {
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
      renderSettingsPanel(container, state); // 只重繪右欄
    });
    header.appendChild(btn);
  }
  container.appendChild(header);

  // 分頁內容
  const body = document.createElement('div');
  body.className = 'tab-body';
  container.appendChild(body);

  if (activeTab === 'character') {
    renderCharacterEditor(body, state);
  } else if (activeTab === 'player') {
    renderPlayerEditor(body, state);
  } else if (activeTab === 'api') {
    renderApiSettingsEditor(body, state);
  } else {
    renderBackupPanel(body);
  }
}

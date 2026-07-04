// src/ui/components/settingsPage.js
//
// 設定頁（#/settings，V2 任務一；V3 新增玩家設定分頁）。容納：
//   - API 設定（原右欄「API 設定」分頁）
//   - Prompt 存放區（V2 任務三）
//   - 玩家設定（V3：從聊天頁右欄移入；全域玩家設定，對所有角色生效）
//   - 資料（原右欄「資料」分頁：匯出 / 匯入 / 清空）
//
// 以內部分頁切換；activeTab 為 UI 狀態，存模組變數。可由外部（如首頁備份提醒）
// 以 setSettingsTab 預先指定要落在哪個分頁。

import { renderApiSettingsEditor } from './apiSettingsEditor.js';
import { renderGlobalPromptsEditor } from './globalPromptsEditor.js';
import { renderPlayerEditor } from './playerEditor.js';
import { renderBackupPanel } from './backupPanel.js';

const TABS = [
  { key: 'api', label: 'API 設定' },
  { key: 'prompts', label: 'Prompt 存放區' },
  { key: 'player', label: '玩家設定' },
  { key: 'data', label: '資料' }
];

let activeTab = 'api';

export function setSettingsTab(key) {
  if (TABS.some((t) => t.key === key)) activeTab = key;
}

export function renderSettingsPage(container, state) {
  container.textContent = '';

  const page = document.createElement('div');
  page.className = 'settings-page';

  const title = document.createElement('h1');
  title.className = 'page-title';
  title.textContent = '設定';
  page.appendChild(title);

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
      renderSettingsPage(container, state);
    });
    header.appendChild(btn);
  }
  page.appendChild(header);

  const body = document.createElement('div');
  body.className = 'tab-body settings-body';
  page.appendChild(body);

  if (activeTab === 'prompts') {
    renderGlobalPromptsEditor(body, state);
  } else if (activeTab === 'player') {
    renderPlayerEditor(body, state);
  } else if (activeTab === 'data') {
    renderBackupPanel(body);
  } else {
    renderApiSettingsEditor(body, state);
  }

  container.appendChild(page);
}

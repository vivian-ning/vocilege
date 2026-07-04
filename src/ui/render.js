// src/ui/render.js
//
// 主渲染函式。作為 store 的唯一訂閱者（在 app.js 註冊），任何 action 完成後由 store
// 統一呼叫本函式重繪三欄。元件本身不自行決定何時重新渲染（第九節）。

import { renderConversationList } from './components/conversationList.js';
import { renderChatView } from './components/chatView.js';
import { renderSettingsPanel } from './tabs.js';
import { openCharacterCreator } from './components/characterEditor.js';

let refs = null;
let appName = 'Vocilège';
let appNameLatin = '';

export function setAppName(name, latin) {
  if (name) appName = name;
  if (latin != null) appNameLatin = latin;
}

// 一次性建立三欄骨架，回傳各欄容器參照。之後每次 render 只更新內容。
export function mountLayout(root, state) {
  root.textContent = '';
  root.className = 'app-layout';

  // 套用主題（V0 僅 cream，仍以 data 屬性驅動，方便未來切換）。
  applyTheme(state.settings.theme);

  // 左欄
  const left = document.createElement('aside');
  left.className = 'col col-left';

  const appTitle = document.createElement('div');
  appTitle.className = 'app-title';
  const appTitleMain = document.createElement('div');
  appTitleMain.className = 'app-title-main';
  appTitleMain.textContent = appName;
  appTitle.appendChild(appTitleMain);
  if (appNameLatin) {
    const appTitleLatin = document.createElement('div');
    appTitleLatin.className = 'app-title-latin';
    appTitleLatin.textContent = appNameLatin;
    appTitle.appendChild(appTitleLatin);
  }
  left.appendChild(appTitle);

  const listWrap = document.createElement('div');
  listWrap.className = 'conv-list';
  left.appendChild(listWrap);

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn btn-primary add-character';
  addBtn.textContent = '+ 新增角色';
  addBtn.addEventListener('click', () => openCharacterCreator());
  left.appendChild(addBtn);

  // 中欄
  const center = document.createElement('main');
  center.className = 'col col-center';

  // 右欄
  const right = document.createElement('aside');
  right.className = 'col col-right';

  root.appendChild(left);
  root.appendChild(center);
  root.appendChild(right);

  refs = { root, listWrap, center, right };
  return refs;
}

export function render(state) {
  if (!refs) return;
  applyTheme(state.settings.theme);
  renderConversationList(refs.listWrap, state, {});
  renderChatView(refs.center, state);
  renderSettingsPanel(refs.right, state);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme || 'cream');
}

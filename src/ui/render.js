// src/ui/render.js
//
// 主渲染函式（V2 導航改版）。作為 store 的唯一資料訂閱者（app.js 註冊），並由
// router 的 hashchange 一併呼叫。每次 render 依目前路由決定顯示哪一頁：
//   #/home     → 首頁主控台（homeView）
//   #/chat/:id → 聊天頁（三欄式：左對話列表 / 中聊天 / 右角色+玩家設定）
//   #/settings → 設定頁（API / Prompt 存放區 / 資料）
//
// 常駐頂部導航列：拾聲 logo（回首頁）、聊天、設定。

import { renderConversationList } from './components/conversationList.js';
import { renderChatView } from './components/chatView.js';
import { renderChatSidePanel } from './tabs.js';
import { renderSettingsPage } from './components/settingsPage.js';
import { renderHomeView } from './components/homeView.js';
import { openCharacterCreator } from './components/characterEditor.js';
import { getRoute, navigate } from './router.js';
import { selectConversation, getState } from '../state/store.js';

let refs = null;
let appName = 'Vocilège';
let appNameLatin = '';

export function setAppName(name, latin) {
  if (name) appName = name;
  if (latin != null) appNameLatin = latin;
}

// 一次性建立外層骨架：頂部導航 + 內容容器。之後每次 render 只更新內容。
export function mountLayout(root, state) {
  root.textContent = '';
  root.className = 'app-root';

  applyTheme(state.settings.theme);

  const nav = document.createElement('nav');
  nav.className = 'top-nav';
  root.appendChild(nav);

  const content = document.createElement('div');
  content.className = 'page-content';
  root.appendChild(content);

  refs = { root, nav, content };
  return refs;
}

export function render(state) {
  if (!refs) return;
  applyTheme(state.settings.theme);

  const route = getRoute();
  renderNav(refs.nav, route, state);

  refs.content.textContent = '';
  if (route.name === 'settings') {
    renderSettingsPage(refs.content, state);
  } else if (route.name === 'chat') {
    renderChatPage(refs.content, state, route.params.conversationId);
  } else {
    renderHomeView(refs.content, state);
  }
}

// ---- 頂部導航 ----
function renderNav(nav, route, state) {
  nav.textContent = '';

  // logo（回首頁）
  const logo = document.createElement('button');
  logo.type = 'button';
  logo.className = 'nav-logo';
  const logoMain = document.createElement('span');
  logoMain.className = 'nav-logo-main';
  logoMain.textContent = appName;
  logo.appendChild(logoMain);
  if (appNameLatin) {
    const logoLatin = document.createElement('span');
    logoLatin.className = 'nav-logo-latin';
    logoLatin.textContent = appNameLatin;
    logo.appendChild(logoLatin);
  }
  logo.addEventListener('click', () => navigate('/home'));
  nav.appendChild(logo);

  const links = document.createElement('div');
  links.className = 'nav-links';

  links.appendChild(navLink('首頁', route.name === 'home', () => navigate('/home')));

  // 聊天：導向目前（或第一個）對話；沒有角色則回首頁。
  links.appendChild(navLink('聊天', route.name === 'chat', () => {
    const target = pickChatConversationId(state);
    navigate(target ? `/chat/${target}` : '/home');
  }));

  links.appendChild(navLink('設定', route.name === 'settings', () => navigate('/settings')));

  nav.appendChild(links);
}

function navLink(label, active, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'nav-link' + (active ? ' active' : '');
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function pickChatConversationId(state) {
  if (state.currentConversationId) return state.currentConversationId;
  const direct = (state.conversations || []).filter((c) => c.type === 'direct');
  if (direct.length === 0) return '';
  // 依 lastMessageAt 新到舊取第一個。
  direct.sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));
  return direct[0].id;
}

// ---- 聊天頁（三欄式）----
function renderChatPage(container, state, conversationId) {
  // 指標同步：URL 指定的對話與 store 目前對話不一致時，走唯一的 selectConversation
  // 更新指標（會再次 notify → 重繪）。無效 id 則不動指標，改顯示空狀態。
  if (conversationId && conversationId !== state.currentConversationId) {
    const exists = (state.conversations || []).some((c) => c.id === conversationId);
    if (exists) {
      selectConversation(conversationId);
      return; // 等 selectConversation 的 notify 觸發下一次 render。
    }
  }

  const layout = document.createElement('div');
  layout.className = 'app-layout';

  // 左欄：對話列表 + 新增角色
  const left = document.createElement('aside');
  left.className = 'col col-left';
  const listWrap = document.createElement('div');
  listWrap.className = 'conv-list';
  left.appendChild(listWrap);
  renderConversationList(listWrap, state, {});
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn btn-primary add-character';
  addBtn.textContent = '+ 新增角色';
  addBtn.addEventListener('click', () => openCharacterCreator());
  left.appendChild(addBtn);

  // 中欄：聊天
  const center = document.createElement('main');
  center.className = 'col col-center';
  renderChatView(center, state);

  // 右欄：角色設定 / 玩家設定
  const right = document.createElement('aside');
  right.className = 'col col-right';
  renderChatSidePanel(right, state);

  layout.appendChild(left);
  layout.appendChild(center);
  layout.appendChild(right);
  container.appendChild(layout);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme || 'cream');
}

// 便於 router callback 直接取用最新 state 重繪。
export function rerender() {
  render(getState());
}

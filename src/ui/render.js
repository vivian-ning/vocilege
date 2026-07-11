// src/ui/render.js
//
// 主渲染函式（V2 導航改版；V3 介面重組）。作為 store 的唯一資料訂閱者（app.js
// 註冊），並由 router 的 hashchange 一併呼叫。每次 render 依目前路由決定顯示哪一頁：
//   #/home         → 首頁主控台（homeView）
//   #/chats        → 對話列表
//   #/chat/:id     → 聊天頁（桌面：左列表 / 右聊天；手機：聊天整頁）
//   #/settings     → 設定頁（API / Prompt 存放區 / 玩家設定 / 資料）
//
// 常駐頂部導航列：拾聲 logo（回首頁）、聊天、設定。

import { renderConversationList } from './components/conversationList.js';
import { renderChatView } from './components/chatView.js';
import { renderSettingsPage } from './components/settingsPage.js';
import { renderHomeView } from './components/homeView.js';
import { renderFeedView } from './components/feedView.js';
import { renderDailyView } from './components/dailyView.js';
import { renderLettersInboxView } from './components/lettersInboxView.js';
import { getRoute, navigate } from './router.js';
import { selectCharacter, selectConversation, getState } from '../state/store.js';
import { createWaveBars } from './wave.js';
import { createIcon } from './icons.js';
import { getObjectURL } from '../services/assetService.js';

let refs = null;
let appName = 'Vocilège';
let appNameLatin = '';
let toastReady = false;
let resizeReady = false;
let appearancePreviewReady = false;

export function setAppName(name, latin) {
  if (name) appName = name;
  if (latin != null) appNameLatin = latin;
}

// 一次性建立外層骨架：頂部導航 + 內容容器。之後每次 render 只更新內容。
export function mountLayout(root, state) {
  root.textContent = '';
  root.className = 'app-root';

  applyTheme(state.settings.theme, state.settings.themeMode);

  const appBackground = document.createElement('div');
  appBackground.className = 'app-background-scene';
  appBackground.setAttribute('aria-hidden', 'true');
  root.appendChild(appBackground);

  const aurora = document.createElement('div');
  aurora.className = 'aurora-scene';
  aurora.setAttribute('aria-hidden', 'true');
  root.appendChild(aurora);

  const particles = document.createElement('div');
  particles.className = 'particle-scene';
  particles.setAttribute('aria-hidden', 'true');
  root.appendChild(particles);

  const nav = document.createElement('nav');
  nav.className = 'top-nav';
  root.appendChild(nav);

  const content = document.createElement('div');
  content.className = 'page-content';
  root.appendChild(content);

  const bottomNav = document.createElement('nav');
  bottomNav.className = 'bottom-nav';
  bottomNav.setAttribute('aria-label', '底部導航');
  root.appendChild(bottomNav);

  refs = { root, appBackground, aurora, particles, nav, bottomNav, content };
  applyAppearance(state);
  syncAuroraScene(state.settings.theme, state.settings.themeMode);
  syncParticleScene(state);
  installToastHost(root);
  installResizeRerender();
  installAppearancePreview();
  return refs;
}

function installToastHost(root) {
  if (toastReady) return;
  toastReady = true;
  window.addEventListener('vocilege:toast', (event) => {
    const message = event && event.detail ? event.detail.message : '';
    if (!message) return;
    const action = event && event.detail ? event.detail.action : null;
    const clickable = action && action.type === 'heartVoice' && action.characterId;
    const toast = document.createElement(clickable ? 'button' : 'div');
    toast.className = 'app-toast';
    if (clickable) {
      toast.type = 'button';
      toast.classList.add('app-toast-clickable');
      toast.title = '開啟弦外之音';
      toast.addEventListener('click', async () => {
        sessionStorage.setItem('vocilege:openHeartVoice', JSON.stringify({
          characterId: action.characterId,
          itemId: action.itemId || ''
        }));
        await selectCharacter(action.characterId);
        navigate('/home');
        toast.remove();
      });
    }
    toast.textContent = message;
    root.appendChild(toast);
    window.setTimeout(() => toast.remove(), 2400);
  });
}

function installResizeRerender() {
  if (resizeReady) return;
  resizeReady = true;
  let timer = 0;
  window.addEventListener('resize', () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => rerender(), 120);
  });
}

function installAppearancePreview() {
  if (appearancePreviewReady) return;
  appearancePreviewReady = true;
  window.addEventListener('vocilege:appearance-preview', (event) => {
    if (!refs || !event || !event.detail) return;
    const state = getState();
    if (!state) return;
    const currentAppearance = appearanceOf(state);
    const previewAppearance = {
      ...currentAppearance,
      ...event.detail
    };
    if (event.detail.particles) {
      previewAppearance.particles = {
        ...((currentAppearance && currentAppearance.particles) || {}),
        ...event.detail.particles
      };
    }
    if ('appBackgroundDim' in event.detail) {
      syncAppBackground(previewAppearance);
    }
    if (event.detail.particles) {
      syncParticleScene({
        ...state,
        settings: {
          ...state.settings,
          appearance: previewAppearance
        }
      });
    }
  });
}

export function render(state) {
  if (!refs) return;
  applyTheme(state.settings.theme, state.settings.themeMode);
  applyAppearance(state);
  syncAuroraScene(state.settings.theme, state.settings.themeMode);
  syncParticleScene(state);

  const route = getRoute();
  renderNav(refs.nav, route, state);
  renderBottomNav(refs.bottomNav, route, state);

  refs.content.textContent = '';
  if (route.name === 'settings') {
    renderSettingsPage(refs.content, state);
  } else if (route.name === 'daily') {
    renderDailyView(refs.content, state);
  } else if (route.name === 'letters') {
    renderLettersInboxView(refs.content, state);
  } else if (route.name === 'feed') {
    renderFeedView(refs.content, state);
  } else if (route.name === 'chats') {
    renderChatsPage(refs.content, state);
  } else if (route.name === 'chat') {
    renderChatPage(refs.content, state, route.params.conversationId);
  } else if (route.name === 'legacyCharacter') {
    redirectLegacyCharacter(state, route.params.characterId);
  } else {
    renderHomeView(refs.content, state);
  }
}

// ---- 頂部導航 ----
function renderNav(nav, route, state) {
  nav.textContent = '';

  // logo（回首頁）：聲波等化器 + 名稱
  const logo = document.createElement('button');
  logo.type = 'button';
  logo.className = 'nav-logo';
  logo.appendChild(createWaveBars());
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
  links.appendChild(navLink('日常', route.name === 'daily', () => navigate('/daily')));
  links.appendChild(navLink('迴聲', route.name === 'feed', () => navigate('/feed')));

  links.appendChild(navLink('聊天', route.name === 'chat' || route.name === 'chats', () => navigate('/chats')));

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

function renderBottomNav(nav, route, state) {
  nav.textContent = '';
  const items = [
    { label: '首頁', icon: 'home', active: route.name === 'home', onClick: () => navigate('/home') },
    { label: '日常', icon: 'daily', active: route.name === 'daily', onClick: () => navigate('/daily') },
    { label: '聊天', icon: 'chat', active: route.name === 'chat' || route.name === 'chats', onClick: () => navigate('/chats') },
    { label: '迴聲', icon: 'feed', active: route.name === 'feed', onClick: () => navigate('/feed') },
    { label: '設定', icon: 'settings', active: route.name === 'settings', onClick: () => navigate('/settings') }
  ];
  for (const item of items) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bottom-nav-link' + (item.active ? ' active' : '');
    btn.setAttribute('aria-current', item.active ? 'page' : 'false');
    btn.appendChild(createIcon(item.icon, { size: 21 }));
    const text = document.createElement('span');
    text.textContent = item.label;
    btn.appendChild(text);
    btn.addEventListener('click', item.onClick);
    nav.appendChild(btn);
  }
}

function pickChatConversationId(state) {
  if (state.currentConversationId) return state.currentConversationId;
  const direct = (state.conversations || []).filter((c) => c.type === 'direct');
  if (direct.length === 0) return '';
  // 依 lastMessageAt 新到舊取第一個。
  direct.sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));
  return direct[0].id;
}

function redirectLegacyCharacter(state, characterId) {
  const exists = (state.characters || []).some((c) => c.id === characterId);
  if (exists) selectCharacter(characterId).finally(() => navigate('/home'));
  else navigate('/home');
}

function isMobileViewport() {
  return window.matchMedia && window.matchMedia('(max-width: 760px)').matches;
}

function renderChatsPage(container, state) {
  if (isMobileViewport()) {
    const page = document.createElement('div');
    page.className = 'chats-page';
    renderConversationList(page, state, { showTabs: true, showAdd: true });
    container.appendChild(page);
    return;
  }
  renderChatShell(container, state, '');
}

// ---- 聊天頁 ----
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

  if (isMobileViewport()) {
    const page = document.createElement('main');
    page.className = 'chat-mobile-page';
    renderChatView(page, state);
    container.appendChild(page);
    return;
  }

  renderChatShell(container, state, conversationId);
}

function renderChatShell(container, state, conversationId) {
  const layout = document.createElement('div');
  layout.className = 'app-layout chat-master-detail';

  // 左欄：對話列表 + 新增角色
  const left = document.createElement('aside');
  left.className = 'col col-left';
  const listWrap = document.createElement('div');
  listWrap.className = 'conv-list';
  left.appendChild(listWrap);
  renderConversationList(listWrap, state, { showTabs: true, showAdd: true });

  // 中欄：聊天（佔滿剩餘寬度）
  const center = document.createElement('main');
  center.className = 'col col-center';
  if (conversationId) {
    renderChatView(center, state);
  } else {
    const empty = document.createElement('div');
    empty.className = 'chat-empty';
    empty.textContent = '從左側選擇一段聊天。';
    center.appendChild(empty);
  }

  layout.appendChild(left);
  layout.appendChild(center);
  container.appendChild(layout);
}

// 主題 = 配色（blue/pink/green/violet/washi）×明暗（light/dark）。
// 舊值（cream/night 等）由 migration 轉換；此處仍防禦性映射一次。
const LEGACY_THEME_MAP = {
  cream: ['violet', 'light'], warm: ['violet', 'light'], brown: ['violet', 'light'],
  night: ['blue', 'dark'], sea: ['blue', 'light'],
  fog: ['blue', 'light'], rose: ['pink', 'light']
};

function effectiveTheme(theme, themeMode) {
  let palette = theme || 'blue';
  let mode = themeMode === 'dark' ? 'dark' : 'light';
  if (LEGACY_THEME_MAP[palette]) {
    const mapped = LEGACY_THEME_MAP[palette];
    palette = mapped[0];
    if (!themeMode) mode = mapped[1];
  }
  if (!['blue', 'pink', 'green', 'violet', 'aurora', 'washi'].includes(palette)) palette = 'blue';
  if (palette === 'aurora' || palette === 'washi') mode = 'light';
  return { palette, mode };
}

function applyTheme(theme, themeMode) {
  const { palette, mode } = effectiveTheme(theme, themeMode);
  document.documentElement.setAttribute('data-theme', `${palette}-${mode}`);
}

function appearanceOf(state) {
  return (state && state.settings && state.settings.appearance) || {};
}

function applyAppearance(state) {
  const appearance = appearanceOf(state);
  const root = document.documentElement;
  root.setAttribute('data-bubble-style', appearance.bubbleStyle === 'classic' ? 'classic' : 'paper');
  root.setAttribute('data-corner-scale', ['soft', 'crisp'].includes(appearance.cornerScale) ? appearance.cornerScale : 'standard');
  root.setAttribute('data-display-font', appearance.displayFont === 'sans' ? 'sans' : 'serif');
  syncAppBackground(appearance);
}

function syncAppBackground(appearance) {
  if (!refs || !refs.appBackground) return;
  const scene = refs.appBackground;
  const assetId = appearance && typeof appearance.appBackgroundAssetId === 'string'
    ? appearance.appBackgroundAssetId
    : '';
  const dim = normalizeDim(appearance && appearance.appBackgroundDim);
  scene.style.setProperty('--app-bg-dim', `${dim}%`);
  scene.classList.remove('has-image');
  scene.style.removeProperty('--app-bg-url');
  scene.style.removeProperty('--app-bg-id');
  if (!assetId) return;
  const expected = assetId;
  scene.style.setProperty('--app-bg-id', expected);
  getObjectURL(assetId).then((url) => {
    if (!url || !scene.isConnected) return;
    const current = scene.style.getPropertyValue('--app-bg-id');
    if (current && current !== expected) return;
    scene.style.setProperty('--app-bg-url', `url("${url}")`);
    scene.classList.add('has-image');
  });
}

function normalizeDim(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 72;
  return Math.min(90, Math.max(20, Math.floor(n)));
}

function syncAuroraScene(theme, themeMode) {
  if (!refs || !refs.aurora) return;
  const { palette } = effectiveTheme(theme, themeMode);
  const scene = refs.aurora;
  if (palette !== 'aurora') {
    scene.textContent = '';
    scene.hidden = true;
    delete scene.dataset.ready;
    return;
  }
  scene.hidden = false;
  if (scene.dataset.ready === 'true') return;
  scene.textContent = '';

  for (let i = 0; i < 3; i += 1) {
    const glow = document.createElement('span');
    glow.className = `aurora-glow aurora-glow-${i + 1}`;
    scene.appendChild(glow);
  }
  scene.dataset.ready = 'true';
}

function syncParticleScene(state) {
  if (!refs || !refs.particles) return;
  const appearance = appearanceOf(state);
  const particles = appearance.particles || {};
  const key = [
    particles.kind || 'none',
    particles.density || 2,
    particles.speed || 2,
    particles.size || 2
  ].join(':');
  const scene = refs.particles;
  if (scene.dataset.key === key) return;
  scene.textContent = '';
  scene.dataset.key = key;
  const next = particleScene(particles.kind, particles.density, particles.speed, particles.size);
  if (next) scene.appendChild(next);
}

function particleScene(kind, density = 2, speed = 2, size = 2) {
  const particleKind = ['stars', 'sakura', 'snow', 'rain', 'fireflies', 'bubbles'].includes(kind) ? kind : 'none';
  if (particleKind === 'none') return null;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
  const wrap = document.createElement('div');
  wrap.className = `particle-layer particle-${particleKind}`;
  wrap.dataset.kind = particleKind;
  wrap.style.setProperty('--particle-size-scale', String([0.78, 1, 1.24][clampLevel(size) - 1]));
  wrap.style.setProperty('--particle-speed-scale', String([1.32, 1, 0.72][clampLevel(speed) - 1]));
  if (particleKind === 'stars') {
    buildStarParticles(wrap, clampLevel(density));
    return wrap;
  }
  const counts = particleKind === 'rain' ? [28, 54, 80] : [22, 42, 60];
  const count = counts[clampLevel(density) - 1];
  for (let i = 0; i < count; i += 1) {
    const node = document.createElement('span');
    node.className = `particle-item ${particleKind}-item`;
    const seed = pseudoRandom(i + particleKind.length * 97);
    node.style.setProperty('--p-left', `${Math.round(seed * 10000) / 100}%`);
    node.style.setProperty('--p-delay', `${Math.round(pseudoRandom(i + 17) * 900) / 100}s`);
    node.style.setProperty('--p-duration', `${particleDuration(particleKind, i)}s`);
    node.style.setProperty('--p-drift', `${Math.round((pseudoRandom(i + 31) * 80) - 40)}px`);
    node.style.setProperty('--p-top', `${Math.round(pseudoRandom(i + 43) * 100)}%`);
    if (particleKind === 'sakura') node.textContent = ['•', '✦', '·'][i % 3];
    wrap.appendChild(node);
  }
  return wrap;
}

function clampLevel(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 2;
  return Math.min(3, Math.max(1, Math.floor(n)));
}

function pseudoRandom(seed) {
  const x = Math.sin(seed * 999) * 10000;
  return x - Math.floor(x);
}

function particleDuration(kind, index) {
  const base = {
    sakura: 13,
    snow: 11,
    rain: 2.2,
    fireflies: 9.5,
    bubbles: 12
  }[kind] || 10;
  return Math.round((base + (index % 7) * (kind === 'rain' ? 0.18 : 0.8)) * 10) / 10;
}

function buildStarParticles(wrap, density) {
  const starCount = [22, 42, 60][density - 1];
  const meteorCount = [3, 5, 7][density - 1];
  const stars = baseStarData();
  while (stars.length < starCount) {
    const i = stars.length;
    stars.push([
      Math.round(pseudoRandom(i + 101) * 96),
      Math.round(pseudoRandom(i + 211) * 96),
      ['✦', '•', '✧'][i % 3],
      10.8 + (i % 5) * 0.8,
      (i * 1.7) % 18
    ]);
  }
  stars.slice(0, starCount).forEach(([top, left, mark, duration, delay], index) => {
    const star = document.createElement('span');
    star.className = 'particle-item particle-star-item';
    star.textContent = mark;
    star.style.setProperty('--star-top', `${top}%`);
    star.style.setProperty('--star-left', `${left}%`);
    star.style.setProperty('--star-duration', `${duration}s`);
    star.style.setProperty('--star-delay', `${delay}s`);
    star.style.setProperty('--star-drift', `${28 + (index % 4) * 8}px`);
    wrap.appendChild(star);
  });
  const meteors = baseMeteorData();
  while (meteors.length < meteorCount) {
    const i = meteors.length;
    meteors.push([8 + (i * 13) % 72, 58 + (i * 9) % 38, 19 + (i % 5) * 3, 3 + i * 5.2]);
  }
  meteors.slice(0, meteorCount).forEach(([top, left, duration, delay]) => {
    const meteor = document.createElement('span');
    meteor.className = 'particle-item particle-meteor-item';
    meteor.style.setProperty('--meteor-top', `${top}%`);
    meteor.style.setProperty('--meteor-left', `${left}%`);
    meteor.style.setProperty('--meteor-duration', `${duration}s`);
    meteor.style.setProperty('--meteor-delay', `${delay}s`);
    wrap.appendChild(meteor);
  });
}

function baseStarData() {
  return [
    [5, 8, '✦', 12.5, .2], [8, 22, '•', 13.8, 1.4], [10, 74, '✧', 11.4, 2.1],
    [12, 90, '•', 12.9, 3.7], [16, 12, '✦', 10.8, 4.6], [18, 34, '•', 14.2, 1.9],
    [20, 68, '✧', 12.2, 5.2], [22, 84, '•', 13.5, 2.8], [27, 6, '✦', 11.2, 6.1],
    [29, 24, '•', 12.6, 3.3], [31, 78, '✧', 10.6, 4.9], [34, 94, '•', 11.8, 6.8],
    [39, 14, '✦', 13.1, 1.1], [42, 30, '•', 12.4, 5.8], [44, 70, '✧', 11.5, 7.2],
    [47, 88, '•', 13.9, 8.1], [53, 9, '✦', 12.7, 6.4], [55, 26, '•', 11.9, 9.5],
    [57, 82, '✧', 13.3, 7.8], [61, 96, '•', 12.1, 10.4], [66, 16, '✦', 11.7, 8.8],
    [68, 38, '•', 13.6, 11.1], [70, 74, '✧', 12.8, 12.2], [73, 91, '•', 14.1, 9.1],
    [77, 8, '✦', 11.6, 13.4], [80, 28, '•', 12.9, 4.2], [82, 64, '✧', 13.7, 6.9],
    [84, 86, '•', 11.3, 12.8], [88, 18, '✦', 12.2, 2.4], [91, 42, '•', 13.4, 10.8],
    [92, 72, '✧', 11.9, 14.2], [6, 54, '•', 12.7, 15.1], [15, 48, '✦', 13.2, 8.7],
    [24, 58, '•', 11.8, 13.7], [36, 4, '✧', 12.6, 11.6], [50, 95, '✦', 13.1, 15.8],
    [64, 5, '•', 11.5, 5.5], [75, 55, '✧', 12.4, 16.4], [86, 58, '•', 13.9, 3.1],
    [94, 9, '✦', 12.1, 17.2], [11, 4, '•', 14.3, 7.4], [89, 94, '✧', 11.7, 18.1]
  ];
}

function baseMeteorData() {
  return [
    [14, 76, 18, 1.5], [28, 94, 24, 8.2], [48, 82, 27, 14.6],
    [68, 70, 31, 21.3], [22, 58, 29, 27.8]
  ];
}

// 便於 router callback 直接取用最新 state 重繪。
export function rerender() {
  render(getState());
}

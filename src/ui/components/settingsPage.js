// src/ui/components/settingsPage.js
//
// Settings is a single scrollable page. External callers may request a section
// by key through setSettingsTab for backward compatibility with older tab code.

import { renderApiSettingsEditor } from './apiSettingsEditor.js';
import { renderGlobalPromptsEditor } from './globalPromptsEditor.js';
import { renderPlayerEditor } from './playerEditor.js';
import { renderBackupPanel } from './backupPanel.js';
import { exportVigilCharacters } from '../../services/backupService.js';
import { getVigilHealthSettings, saveVigilHealthSettings, testVigilHealthConnection } from '../../services/vigilHealthService.js';
import {
  addSticker,
  updateSticker,
  deleteSticker,
  updateSettings,
  updateAppearance,
  updateAppBackgroundAsset,
  updateChatBackgroundAsset
} from '../../state/store.js';
import { saveImageAsset, getObjectURL } from '../../services/assetService.js';
import { getStats } from '../../services/statsService.js';
import { createIcon } from '../icons.js';
import { confirmDialog } from '../dialog.js';
import { showToast } from '../toast.js';

export const SECTION_KEYS = new Set(['player', 'api', 'appearance', 'life', 'daily', 'vigil', 'stickers', 'prompts', 'usage', 'data']);
const VIGIL_VAPID_KEY = 'vigilVapidKey';
let pendingScrollTarget = '';
const expandedSections = new Set();

// Kept for callers such as the home backup reminder. The page no longer has
// tabs; this records the section that should be scrolled into view.
export function setSettingsTab(key) {
  if (SECTION_KEYS.has(key)) pendingScrollTarget = key;
}

// 配色取自聲學的「噪音顏色」、極光玻璃與和紙手帳；swatch 圓點 = 該主題的 bg / primary / bubble。
const THEME_PALETTES = [
  { key: 'blue', label: '藍噪', hint: '清晨廣播的冷靜', dots: { light: ['#eef4f8', '#2f6f8f', '#d4e7ef'], dark: ['#101923', '#78bfe1', '#294f66'] } },
  { key: 'pink', label: '粉噪', hint: '溫柔的傍晚', dots: { light: ['#f7eef3', '#a94f76', '#f1d5e2'], dark: ['#21151d', '#e08aad', '#63384e'] } },
  { key: 'green', label: '綠噪', hint: '靜謐的森林', dots: { light: ['#eef6f0', '#387a57', '#d5eadb'], dark: ['#101d18', '#7ac99c', '#2c5d45'] } },
  { key: 'violet', label: '紫噪', hint: '深夜的紫煙', dots: { light: ['#f3effb', '#7552b8', '#e1d6f5'], dark: ['#181425', '#b59cff', '#433060'] } },
  { key: 'aurora', label: '極光', hint: '極光玻璃，暫僅亮色', dots: { light: ['#bfe9e2', '#aab3e8', '#f0d7e9'], dark: ['#bfe9e2', '#aab3e8', '#f0d7e9'] } },
  { key: 'washi', label: '和紙', hint: '紙上手帳，暫僅亮色', dots: { light: ['#fffdf7', '#a84b2f', '#f7f3ea'], dark: ['#fffdf7', '#a84b2f', '#f7f3ea'] } }
];

const CHAT_BACKGROUND_MAX_BYTES = 2 * 1024 * 1024;
const HOME_MODULES = [
  { key: 'todayList', label: '今日清單' },
  { key: 'recentChats', label: '最近聊天' },
  { key: 'characterRail', label: '角色列' },
  { key: 'oldReplay', label: '舊聲重播' }
];

export function renderSettingsPage(container, state) {
  container.textContent = '';
  if (pendingScrollTarget) expandedSections.add(pendingScrollTarget);

  const page = document.createElement('div');
  page.className = 'settings-page';

  const title = document.createElement('h1');
  title.className = 'page-title';
  title.textContent = '設定';
  page.appendChild(title);

  page.appendChild(playerSettingsSection(state));
  page.appendChild(settingsSection('api', 'API', (body) => renderApiSettingsEditor(body, state)));
  page.appendChild(settingsSection('appearance', '外觀', (body) => renderAppearance(body, state)));
  page.appendChild(settingsSection('life', '角色生活感', (body) => renderLifeSettings(body, state)));
  page.appendChild(settingsSection('daily', '日常', (body) => renderDailySettings(body, state)));
  page.appendChild(settingsSection('vigil', '駐守', (body) => renderVigilSettings(body, state)));
  page.appendChild(settingsSection('stickers', '貼圖', (body) => renderStickerManager(body, state)));
  page.appendChild(settingsSection('prompts', 'Prompt', (body) => renderGlobalPromptsEditor(body, state)));
  page.appendChild(settingsSection('usage', '聲量', (body) => renderUsageStats(body, state)));
  page.appendChild(settingsSection('data', '資料', (body) => renderBackupPanel(body)));

  container.appendChild(page);

  if (pendingScrollTarget) {
    const target = page.querySelector(`[data-settings-section="${pendingScrollTarget}"]`);
    pendingScrollTarget = '';
    if (target) {
      requestAnimationFrame(() => {
        const scroller = container.closest('.page-content');
        if (scroller) {
          scroller.scrollTo({
            top: target.offsetTop - 12,
            behavior: 'smooth'
          });
        } else {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    }
  }
}

function playerSettingsSection(state) {
  const key = 'player';
  const section = document.createElement('section');
  section.className = 'settings-section settings-player-section';
  section.dataset.settingsSection = key;
  section.id = `settings-${key}`;

  const expanded = expandedSections.has(key);
  const heading = buildPlayerProfileCard(state, true);
  heading.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  heading.setAttribute('aria-controls', `settings-panel-${key}`);
  const chevron = createIcon('chevron', { size: 18 });
  chevron.classList.add('settings-chevron');
  heading.appendChild(chevron);
  section.appendChild(heading);

  const card = document.createElement('div');
  card.className = 'settings-card settings-collapsible-card settings-player-editor-card';
  card.id = `settings-panel-${key}`;
  card.hidden = !expanded;
  if (expanded) {
    renderPlayerEditor(card, state);
    card.dataset.rendered = 'true';
  }

  heading.addEventListener('click', () => {
    const next = !expandedSections.has(key);
    if (next) expandedSections.add(key);
    else expandedSections.delete(key);
    heading.setAttribute('aria-expanded', next ? 'true' : 'false');
    card.hidden = !next;
    if (next && !card.dataset.rendered) {
      renderPlayerEditor(card, state);
      card.dataset.rendered = 'true';
    }
  });
  section.appendChild(card);
  return section;
}

function settingsSection(key, title, renderBody) {
  const section = document.createElement('section');
  section.className = 'settings-section';
  section.dataset.settingsSection = key;
  section.id = `settings-${key}`;

  const expanded = expandedSections.has(key);
  const heading = document.createElement('button');
  heading.type = 'button';
  heading.className = 'settings-section-title';
  heading.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  heading.setAttribute('aria-controls', `settings-panel-${key}`);
  const text = document.createElement('span');
  text.textContent = title;
  heading.appendChild(text);
  const icon = createIcon('chevron', { size: 18 });
  icon.classList.add('settings-chevron');
  heading.appendChild(icon);
  heading.addEventListener('click', () => {
    const next = !expandedSections.has(key);
    if (next) expandedSections.add(key);
    else expandedSections.delete(key);
    heading.setAttribute('aria-expanded', next ? 'true' : 'false');
    card.hidden = !next;
    if (next && !card.dataset.rendered) {
      renderBody(card);
      card.dataset.rendered = 'true';
    }
  });
  section.appendChild(heading);

  const card = document.createElement('div');
  card.className = 'settings-card settings-collapsible-card';
  card.id = `settings-panel-${key}`;
  card.hidden = !expanded;
  if (expanded) {
    renderBody(card);
    card.dataset.rendered = 'true';
  }
  section.appendChild(card);

  return section;
}

function buildPlayerProfileCard(state, asButton = false) {
  const profile = document.createElement(asButton ? 'button' : 'div');
  profile.className = 'settings-profile-card' + (asButton ? ' settings-profile-header' : '');
  if (asButton) profile.type = 'button';
  const avatar = document.createElement('div');
  avatar.className = 'settings-profile-avatar';
  const player = state.player || {};
  const source = player.avatar || { type: 'emoji', value: '🙂' };
  if (source.type === 'image' && source.assetId) {
    getObjectURL(source.assetId).then((url) => {
      if (!url) return;
      avatar.textContent = '';
      avatar.style.backgroundImage = `url("${url}")`;
      avatar.classList.add('avatar-image');
    });
  } else {
    avatar.textContent = source.value || '🙂';
  }
  profile.appendChild(avatar);

  const text = document.createElement('div');
  text.className = 'settings-profile-text';
  const name = document.createElement('div');
  name.className = 'settings-profile-name';
  name.textContent = player.playerName || '尚未設定名稱';
  const desc = document.createElement('div');
  desc.className = 'settings-profile-desc';
  desc.textContent = player.playerDescription || '設定你在所有對話中的稱呼與描述。';
  text.appendChild(name);
  text.appendChild(desc);
  profile.appendChild(text);
  return profile;
}

function renderPlayerProfile(container, state) {
  container.appendChild(buildPlayerProfileCard(state));
  const editor = document.createElement('div');
  editor.className = 'settings-card-inner';
  renderPlayerEditor(editor, state);
  container.appendChild(editor);
}

function renderVigilSettings(container, state) {
  const wrap = document.createElement('div');
  wrap.className = 'vigil-settings';

  const desc = document.createElement('p');
  desc.className = 'gp-desc';
  desc.textContent = '駐守需在電腦執行 vocilege-vigil；iPhone 需 iOS 16.4+，並從主畫面啟動拾聲後才能訂閱推播。';
  wrap.appendChild(desc);

  const exportBox = document.createElement('div');
  exportBox.className = 'vigil-export-box';
  const exportDesc = document.createElement('div');
  exportDesc.className = 'form-hint';
  exportDesc.textContent = '下載後把檔案放進電腦的 vocilege-vigil 資料夾即可生效';
  exportBox.appendChild(exportDesc);

  const exportStatus = document.createElement('div');
  exportStatus.className = 'form-hint';

  const exportBtn = document.createElement('button');
  exportBtn.type = 'button';
  exportBtn.className = 'btn btn-primary';
  exportBtn.textContent = '匯出駐守角色檔';
  exportBtn.addEventListener('click', () => {
    const result = exportVigilCharacters();
    if (!result.ok && result.reason === 'empty') {
      exportStatus.className = 'backup-status error';
      exportStatus.textContent = '還沒有角色開啟駐守推播';
      return;
    }
    exportStatus.className = 'backup-status success';
    exportStatus.textContent = `已匯出 ${result.count || 0} 位駐守角色。`;
  });
  exportBox.appendChild(exportBtn);
  exportBox.appendChild(exportStatus);
  wrap.appendChild(exportBox);

  const support = getPushSupportState();
  const supportNote = document.createElement('div');
  supportNote.className = support.ok ? 'form-hint' : 'backup-status error';
  supportNote.textContent = support.message;
  wrap.appendChild(supportNote);

  const keyInput = document.createElement('textarea');
  keyInput.className = 'form-control';
  keyInput.rows = 3;
  keyInput.placeholder = '貼上 python vigil.py show-key 輸出的 VAPID 公鑰';
  keyInput.value = localStorage.getItem(VIGIL_VAPID_KEY) || '';
  wrap.appendChild(wrapField('VAPID 公鑰', keyInput));

  const status = document.createElement('div');
  status.className = 'form-hint';
  wrap.appendChild(status);

  const actions = document.createElement('div');
  actions.className = 'form-actions';

  const saveKey = document.createElement('button');
  saveKey.type = 'button';
  saveKey.className = 'btn';
  saveKey.textContent = '儲存公鑰';
  saveKey.addEventListener('click', () => {
    const raw = keyInput.value.trim();
    const valid = validateVapidKey(raw);
    if (!valid.ok) {
      status.className = 'backup-status error';
      status.textContent = valid.message;
      return;
    }
    localStorage.setItem(VIGIL_VAPID_KEY, raw);
    status.className = 'backup-status success';
    status.textContent = '公鑰已儲存在此裝置。';
  });
  actions.appendChild(saveKey);

  const subscribe = document.createElement('button');
  subscribe.type = 'button';
  subscribe.className = 'btn btn-primary';
  subscribe.textContent = '訂閱推播';
  subscribe.disabled = !support.ok;
  actions.appendChild(subscribe);

  const unsubscribe = document.createElement('button');
  unsubscribe.type = 'button';
  unsubscribe.className = 'btn';
  unsubscribe.textContent = '取消訂閱';
  unsubscribe.disabled = !support.ok;
  actions.appendChild(unsubscribe);
  wrap.appendChild(actions);

  const output = document.createElement('textarea');
  output.className = 'form-control';
  output.rows = 8;
  output.readOnly = true;
  output.placeholder = '訂閱成功後，這裡會顯示要貼給 python vigil.py add-sub 的 JSON。';
  wrap.appendChild(wrapField('訂閱 JSON', output));

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'btn';
  copy.textContent = '複製訂閱 JSON';
  copy.disabled = true;
  copy.addEventListener('click', async () => {
    if (!output.value) return;
    try {
      await navigator.clipboard.writeText(output.value);
      status.className = 'backup-status success';
      status.textContent = '已複製。到電腦執行 python vigil.py add-sub 後貼上。';
    } catch (e) {
      output.select();
      status.className = 'form-hint';
      status.textContent = '無法自動複製，請手動複製文字。';
    }
  });
  wrap.appendChild(copy);

  renderVigilHealthSettings(wrap);

  refreshPushSubscriptionStatus(status, output, copy);

  subscribe.addEventListener('click', async () => {
    const raw = keyInput.value.trim() || localStorage.getItem(VIGIL_VAPID_KEY) || '';
    const valid = validateVapidKey(raw);
    if (!valid.ok) {
      status.className = 'backup-status error';
      status.textContent = valid.message;
      return;
    }
    localStorage.setItem(VIGIL_VAPID_KEY, raw);
    status.className = 'form-hint';
    status.textContent = '正在等待推播服務…';
    try {
      const registration = await serviceWorkerReadyWithTimeout();
      if (!registration) {
        status.className = 'backup-status error';
        status.textContent = '首次啟用請重新開啟拾聲再試。';
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        status.className = 'backup-status error';
        status.textContent = '你尚未允許拾聲傳送通知。';
        return;
      }
      const existing = await registration.pushManager.getSubscription();
      if (existing) await existing.unsubscribe();
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64urlToUint8Array(raw)
      });
      output.value = JSON.stringify(subscription.toJSON(), null, 2);
      copy.disabled = false;
      status.className = 'backup-status success';
      status.textContent = '已訂閱。複製後到電腦執行 python vigil.py add-sub 貼上。';
    } catch (err) {
      status.className = 'backup-status error';
      status.textContent = `訂閱失敗：${(err && err.message) || String(err)}`;
    }
  });

  unsubscribe.addEventListener('click', async () => {
    try {
      const registration = await serviceWorkerReadyWithTimeout();
      const subscription = registration ? await registration.pushManager.getSubscription() : null;
      if (!subscription) {
        status.className = 'form-hint';
        status.textContent = '目前沒有訂閱。';
        return;
      }
      await subscription.unsubscribe();
      output.value = '';
      copy.disabled = true;
      status.className = 'backup-status success';
      status.textContent = '已取消此裝置的推播訂閱。';
    } catch (err) {
      status.className = 'backup-status error';
      status.textContent = `取消失敗：${(err && err.message) || String(err)}`;
    }
  });

  container.appendChild(wrap);
}

function renderVigilHealthSettings(container) {
  const settings = getVigilHealthSettings();
  const box = document.createElement('div');
  box.className = 'vigil-export-box';

  const title = document.createElement('h3');
  title.className = 'settings-subtitle';
  title.textContent = '健康感知';
  box.appendChild(title);

  const desc = document.createElement('div');
  desc.className = 'form-hint';
  desc.textContent = '兩欄都填才啟用；資料只作為聊天語氣背景。設定存在此瀏覽器 localStorage，不會進備份。';
  box.appendChild(desc);

  const urlInput = document.createElement('input');
  urlInput.type = 'text';
  urlInput.className = 'form-control';
  urlInput.placeholder = '例如 https://<node>.ts.net:8443';
  urlInput.value = settings.url;
  box.appendChild(wrapField('駐守健康網址', urlInput));

  const tokenInput = document.createElement('input');
  tokenInput.type = 'password';
  tokenInput.className = 'form-control';
  tokenInput.placeholder = '貼上健康通行碼';
  tokenInput.autocomplete = 'off';
  tokenInput.value = settings.token;
  box.appendChild(wrapField('通行碼', tokenInput));

  const healthStatus = document.createElement('div');
  healthStatus.className = 'form-hint';
  box.appendChild(healthStatus);

  const actions = document.createElement('div');
  actions.className = 'form-actions';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn';
  saveBtn.textContent = '儲存健康感知';
  saveBtn.addEventListener('click', () => {
    saveVigilHealthSettings({ url: urlInput.value, token: tokenInput.value });
    healthStatus.className = 'backup-status success';
    healthStatus.textContent = '健康感知設定已儲存在此裝置。匯入備份後需重填。';
  });
  actions.appendChild(saveBtn);

  const testBtn = document.createElement('button');
  testBtn.type = 'button';
  testBtn.className = 'btn btn-primary';
  testBtn.textContent = '測試連線';
  testBtn.addEventListener('click', async () => {
    saveVigilHealthSettings({ url: urlInput.value, token: tokenInput.value });
    healthStatus.className = 'form-hint';
    healthStatus.textContent = '測試中…';
    testBtn.disabled = true;
    try {
      const result = await testVigilHealthConnection({ url: urlInput.value, token: tokenInput.value });
      healthStatus.className = 'backup-status success';
      healthStatus.textContent = result.entry
        ? '連線成功，已讀到最近 24 小時健康資料。'
        : '連線成功，目前沒有最近 24 小時健康資料。';
    } catch (err) {
      healthStatus.className = 'backup-status error';
      healthStatus.textContent = `連線失敗：${(err && err.message) || String(err)}`;
    } finally {
      testBtn.disabled = false;
    }
  });
  actions.appendChild(testBtn);
  box.appendChild(actions);

  container.appendChild(box);
}

function getPushSupportState() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return { ok: false, message: '此瀏覽器不支援推播。' };
  }
  if (isIosLike() && !isStandaloneWebApp()) {
    return { ok: false, message: '請先把拾聲加入主畫面，並從主畫面開啟後再訂閱。' };
  }
  return { ok: true, message: '此裝置可嘗試訂閱推播。訂閱 JSON 只會顯示在這裡，不會寫入拾聲資料。' };
}

function isIosLike() {
  const platform = navigator.platform || '';
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(platform) ||
    (/Macintosh/.test(platform) && navigator.maxTouchPoints > 1) ||
    /iPad|iPhone|iPod/.test(ua);
}

function isStandaloneWebApp() {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    navigator.standalone === true;
}

function validateVapidKey(raw) {
  const value = String(raw || '').trim();
  if (!value) return { ok: false, message: '請先貼上 VAPID 公鑰。' };
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.includes('=')) {
    return { ok: false, message: '公鑰格式不對：請貼 show-key 輸出的 base64url 字串，不要 PEM、JWK 或等號 padding。' };
  }
  try {
    const bytes = base64urlToUint8Array(value);
    if (bytes.length !== 65) {
      return { ok: false, message: `公鑰格式不對：解碼後應為 65 bytes，目前是 ${bytes.length} bytes。` };
    }
  } catch (e) {
    return { ok: false, message: '公鑰不是有效的 base64url 字串。' };
  }
  return { ok: true, message: '' };
}

function base64urlToUint8Array(raw) {
  const normalized = String(raw || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

async function serviceWorkerReadyWithTimeout() {
  if (!navigator.serviceWorker) return null;
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise((resolve) => window.setTimeout(() => resolve(null), 5000))
  ]);
}

async function refreshPushSubscriptionStatus(status, output, copy) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  const registration = await serviceWorkerReadyWithTimeout();
  if (!registration) return;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    status.textContent = status.textContent || '目前尚未訂閱。';
    return;
  }
  output.value = JSON.stringify(subscription.toJSON(), null, 2);
  copy.disabled = false;
  status.className = 'backup-status success';
  status.textContent = '此裝置已訂閱。若更換 VAPID 金鑰，請取消後重新訂閱。';
}

// ---- 外觀工作室 ----
function renderAppearance(container, state) {
  const wrap = document.createElement('div');
  wrap.className = 'theme-picker';

  const desc = document.createElement('p');
  desc.className = 'gp-desc';
  desc.textContent = '拾聲的配色取自聲學的「噪音顏色」、極光玻璃與和紙手帳。和紙與極光暫僅亮色；暗色模式下會自動沿用亮版。';
  wrap.appendChild(desc);

  const currentTheme = state.settings.theme || 'blue';
  const currentMode = state.settings.themeMode === 'dark' ? 'dark' : 'light';

  const modeRow = document.createElement('div');
  modeRow.className = 'theme-mode-row';
  for (const mode of [{ key: 'light', label: '亮' }, { key: 'dark', label: '暗' }]) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'theme-mode-btn' + (mode.key === currentMode ? ' active' : '');
    btn.textContent = mode.label;
    btn.addEventListener('click', () => updateSettings({ themeMode: mode.key }));
    modeRow.appendChild(btn);
  }
  wrap.appendChild(modeRow);

  const swatches = document.createElement('div');
  swatches.className = 'theme-swatches';
  for (const p of THEME_PALETTES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'theme-swatch' + (p.key === currentTheme ? ' active' : '');
    btn.setAttribute('aria-pressed', p.key === currentTheme ? 'true' : 'false');

    const dots = document.createElement('span');
    dots.className = 'theme-swatch-dots';
    for (const color of p.dots[currentMode]) {
      const dot = document.createElement('i');
      dot.style.background = color;
      dots.appendChild(dot);
    }
    btn.appendChild(dots);

    const name = document.createElement('span');
    name.textContent = p.label;
    btn.appendChild(name);

    const hint = document.createElement('span');
    hint.className = 'form-hint';
    hint.textContent = p.hint;
    btn.appendChild(hint);

    btn.addEventListener('click', () => updateSettings({ theme: p.key }));
    swatches.appendChild(btn);
  }
  wrap.appendChild(swatches);
  wrap.appendChild(renderAppBackgroundPicker(state));
  wrap.appendChild(renderParticleStudio(state));
  wrap.appendChild(renderStyleTuning(state));
  wrap.appendChild(renderHomeModules(state));
  wrap.appendChild(renderChatBackgroundPicker(state));
  container.appendChild(wrap);
}

function appearanceOf(state) {
  return (state.settings && state.settings.appearance) || {};
}

function renderAppBackgroundPicker(state) {
  const appearance = appearanceOf(state);
  const box = document.createElement('div');
  box.className = 'chat-bg-picker app-bg-picker';

  const title = document.createElement('h3');
  title.className = 'settings-subtitle';
  title.textContent = '背景';
  box.appendChild(title);

  const desc = document.createElement('p');
  desc.className = 'form-hint';
  desc.textContent = '全域背景會鋪在主題底色之上、內容之下；聊天背景仍依聊天室設定優先。';
  box.appendChild(desc);

  const preview = document.createElement('div');
  preview.className = 'chat-bg-preview app-bg-preview';
  const previewText = document.createElement('span');
  previewText.textContent = '主題預設';
  preview.appendChild(previewText);
  const assetId = appearance.appBackgroundAssetId;
  preview.style.setProperty('--preview-app-bg-dim', `${normalizeDim(appearance.appBackgroundDim)}%`);
  if (assetId) {
    previewText.textContent = '讀取中…';
    getObjectURL(assetId).then((url) => {
      if (!url || !preview.isConnected) {
        previewText.textContent = '找不到圖片，會回到主題預設';
        return;
      }
      previewText.textContent = '';
      preview.style.backgroundImage = `url("${url}")`;
      preview.classList.add('has-image');
    });
  }
  box.appendChild(preview);

  const file = document.createElement('input');
  file.type = 'file';
  file.accept = 'image/*';
  file.className = 'file-input';
  box.appendChild(file);

  const actions = document.createElement('div');
  actions.className = 'form-actions';
  const upload = document.createElement('button');
  upload.type = 'button';
  upload.className = 'btn btn-primary';
  upload.textContent = '上傳圖片';
  upload.addEventListener('click', () => file.click());
  actions.appendChild(upload);
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'btn';
  clear.textContent = '清除背景';
  clear.disabled = !assetId;
  clear.addEventListener('click', () => updateAppBackgroundAsset(null));
  actions.appendChild(clear);
  box.appendChild(actions);

  const dim = normalizeDim(appearance.appBackgroundDim);
  const dimValue = document.createElement('span');
  dimValue.className = 'range-value';
  dimValue.textContent = `${dim}%`;
  const dimInput = document.createElement('input');
  dimInput.type = 'range';
  dimInput.min = '20';
  dimInput.max = '90';
  dimInput.step = '1';
  dimInput.value = String(dim);
  dimInput.className = 'form-range';
  dimInput.addEventListener('input', () => {
    const value = normalizeDim(dimInput.value);
    dimValue.textContent = `${value}%`;
    preview.style.setProperty('--preview-app-bg-dim', `${value}%`);
    const scene = document.querySelector('.app-background-scene');
    if (scene) scene.style.setProperty('--app-bg-dim', `${value}%`);
  });
  dimInput.addEventListener('change', () => updateAppearance({ appBackgroundDim: normalizeDim(dimInput.value) }));
  const dimField = wrapField('背景淡化', dimInput);
  const label = dimField.querySelector('.form-label');
  if (label) label.appendChild(dimValue);
  box.appendChild(dimField);

  file.addEventListener('change', async () => {
    const selected = file.files && file.files[0];
    file.value = '';
    if (!selected) return;
    if (selected.size > CHAT_BACKGROUND_MAX_BYTES) {
      showToast('背景圖片需小於 2MB');
      return;
    }
    upload.disabled = true;
    try {
      const nextAssetId = await saveImageAsset(selected, 'appBackground', 1800);
      await updateAppBackgroundAsset(nextAssetId);
      showToast('背景已更新');
    } catch (err) {
      showToast('背景上傳失敗');
    } finally {
      upload.disabled = false;
    }
  });

  return box;
}

function renderParticleStudio(state) {
  const particles = appearanceOf(state).particles || {};
  const box = document.createElement('div');
  box.className = 'appearance-panel particle-studio';
  const title = document.createElement('h3');
  title.className = 'settings-subtitle';
  title.textContent = '粒子聲景';
  box.appendChild(title);

  const choices = [
    ['none', '無'], ['stars', '星光'], ['sakura', '櫻花'], ['snow', '雪'],
    ['rain', '雨'], ['fireflies', '螢火'], ['bubbles', '泡泡']
  ];
  const grid = document.createElement('div');
  grid.className = 'particle-kind-grid';
  for (const [key, label] of choices) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'particle-kind' + ((particles.kind || 'none') === key ? ' active' : '');
    btn.setAttribute('aria-pressed', (particles.kind || 'none') === key ? 'true' : 'false');
    const icon = document.createElement('span');
    icon.className = `particle-kind-icon particle-kind-${key}`;
    icon.textContent = key === 'none' ? '・' : label.slice(0, 1);
    const text = document.createElement('span');
    text.textContent = label;
    btn.appendChild(icon);
    btn.appendChild(text);
    btn.addEventListener('click', () => updateAppearance({ particles: { ...particles, kind: key } }));
    grid.appendChild(btn);
  }
  box.appendChild(grid);

  box.appendChild(particleRange('密度', particles.density,
    (value) => previewParticles({ ...particles, density: value }),
    (value) => updateAppearance({ particles: { ...particles, density: value } })));
  box.appendChild(particleRange('速度', particles.speed,
    (value) => previewParticles({ ...particles, speed: value }),
    (value) => updateAppearance({ particles: { ...particles, speed: value } })));
  box.appendChild(particleRange('大小', particles.size,
    (value) => previewParticles({ ...particles, size: value }),
    (value) => updateAppearance({ particles: { ...particles, size: value } })));
  return box;
}

function previewParticles(particles) {
  window.dispatchEvent(new CustomEvent('vocilege:appearance-preview', {
    detail: { particles }
  }));
}

function particleRange(label, value, onPreview, onCommit) {
  const current = clampLevel(value);
  const out = document.createElement('span');
  out.className = 'range-value';
  out.textContent = String(current);
  const input = document.createElement('input');
  input.type = 'range';
  input.min = '1';
  input.max = '3';
  input.step = '1';
  input.value = String(current);
  input.className = 'form-range';
  input.addEventListener('input', () => {
    const next = clampLevel(input.value);
    out.textContent = String(next);
    onPreview(next);
  });
  input.addEventListener('change', () => onCommit(clampLevel(input.value)));
  const field = wrapField(label, input);
  const labelNode = field.querySelector('.form-label');
  if (labelNode) labelNode.appendChild(out);
  return field;
}

function renderStyleTuning(state) {
  const appearance = appearanceOf(state);
  const box = document.createElement('div');
  box.className = 'appearance-panel style-tuning';
  const title = document.createElement('h3');
  title.className = 'settings-subtitle';
  title.textContent = '樣式微調';
  box.appendChild(title);
  box.appendChild(segmentedControl('聊天氣泡', [
    ['paper', '紙上'], ['classic', '傳統']
  ], appearance.bubbleStyle || 'paper', (value) => updateAppearance({ bubbleStyle: value })));
  box.appendChild(segmentedControl('圓角刻度', [
    ['soft', '柔和'], ['standard', '標準'], ['crisp', '俐落']
  ], appearance.cornerScale || 'standard', (value) => updateAppearance({ cornerScale: value })));
  box.appendChild(segmentedControl('展示字體', [
    ['serif', '襯線'], ['sans', '無襯線']
  ], appearance.displayFont || 'serif', (value) => updateAppearance({ displayFont: value })));
  return box;
}

function segmentedControl(labelText, options, value, onPick) {
  const field = document.createElement('div');
  field.className = 'form-field';
  const label = document.createElement('div');
  label.className = 'form-label';
  label.textContent = labelText;
  field.appendChild(label);
  const row = document.createElement('div');
  row.className = 'segmented-row';
  for (const [key, labelValue] of options) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'segment-btn' + (key === value ? ' active' : '');
    btn.setAttribute('aria-pressed', key === value ? 'true' : 'false');
    btn.textContent = labelValue;
    btn.addEventListener('click', () => onPick(key));
    row.appendChild(btn);
  }
  field.appendChild(row);
  return field;
}

function renderHomeModules(state) {
  const home = appearanceOf(state).homeModules || {};
  const order = Array.isArray(home.order) ? home.order.slice() : HOME_MODULES.map((m) => m.key);
  for (const item of HOME_MODULES) {
    if (!order.includes(item.key)) order.push(item.key);
  }
  const hidden = new Set(Array.isArray(home.hidden) ? home.hidden : []);
  const box = document.createElement('div');
  box.className = 'appearance-panel home-modules-panel';
  const title = document.createElement('h3');
  title.className = 'settings-subtitle';
  title.textContent = '首頁模組';
  box.appendChild(title);
  const list = document.createElement('div');
  list.className = 'home-module-list';
  order.forEach((key, index) => {
    const meta = HOME_MODULES.find((item) => item.key === key);
    if (!meta) return;
    const row = document.createElement('div');
    row.className = 'home-module-row';
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = !hidden.has(key);
    check.addEventListener('change', () => {
      const nextHidden = new Set(hidden);
      if (check.checked) nextHidden.delete(key);
      else nextHidden.add(key);
      updateAppearance({ homeModules: { order, hidden: [...nextHidden] } });
    });
    row.appendChild(check);
    const name = document.createElement('span');
    name.textContent = meta.label;
    row.appendChild(name);
    const actions = document.createElement('span');
    actions.className = 'home-module-actions';
    const up = moduleMoveButton('↑', index === 0, () => moveHomeModule(order, hidden, index, -1));
    const down = moduleMoveButton('↓', index === order.length - 1, () => moveHomeModule(order, hidden, index, 1));
    actions.appendChild(up);
    actions.appendChild(down);
    row.appendChild(actions);
    list.appendChild(row);
  });
  box.appendChild(list);
  return box;
}

function moduleMoveButton(label, disabled, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn home-module-move';
  btn.textContent = label;
  btn.disabled = disabled;
  btn.addEventListener('click', onClick);
  return btn;
}

function moveHomeModule(order, hidden, index, dir) {
  const next = order.slice();
  const target = index + dir;
  if (target < 0 || target >= next.length) return;
  const tmp = next[index];
  next[index] = next[target];
  next[target] = tmp;
  updateAppearance({ homeModules: { order: next, hidden: [...hidden] } });
}

function renderChatBackgroundPicker(state) {
  const box = document.createElement('div');
  box.className = 'chat-bg-picker';

  const title = document.createElement('h3');
  title.className = 'settings-subtitle';
  title.textContent = '聊天背景';
  box.appendChild(title);

  const desc = document.createElement('p');
  desc.className = 'form-hint';
  desc.textContent = '全域圖會套用到未自訂聲景的聊天；清除後回到目前主題預設。';
  box.appendChild(desc);

  const preview = document.createElement('div');
  preview.className = 'chat-bg-preview';
  const previewText = document.createElement('span');
  previewText.textContent = '主題預設';
  preview.appendChild(previewText);
  const assetId = state.settings && state.settings.chatBackgroundAssetId;
  if (assetId) {
    previewText.textContent = '讀取中…';
    getObjectURL(assetId).then((url) => {
      if (!url) {
        previewText.textContent = '找不到圖片，聊天會回到主題預設';
        return;
      }
      previewText.textContent = '';
      preview.style.backgroundImage = `url("${url}")`;
      preview.classList.add('has-image');
    });
  }
  box.appendChild(preview);

  const file = document.createElement('input');
  file.type = 'file';
  file.accept = 'image/*';
  file.className = 'file-input';
  box.appendChild(file);

  const actions = document.createElement('div');
  actions.className = 'form-actions';

  const upload = document.createElement('button');
  upload.type = 'button';
  upload.className = 'btn btn-primary';
  upload.textContent = '上傳圖片';
  upload.addEventListener('click', () => file.click());
  actions.appendChild(upload);

  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'btn';
  clear.textContent = '清除背景';
  clear.disabled = !assetId;
  clear.addEventListener('click', () => updateChatBackgroundAsset(null));
  actions.appendChild(clear);
  box.appendChild(actions);

  const dim = normalizeDim(state.settings && state.settings.chatBackgroundDim);
  const dimValue = document.createElement('span');
  dimValue.className = 'range-value';
  dimValue.textContent = `${dim}%`;
  const dimInput = document.createElement('input');
  dimInput.type = 'range';
  dimInput.min = '20';
  dimInput.max = '90';
  dimInput.step = '1';
  dimInput.value = String(dim);
  dimInput.className = 'form-range';
  dimInput.addEventListener('input', () => {
    const value = normalizeDim(dimInput.value);
    dimValue.textContent = `${value}%`;
    preview.style.setProperty('--preview-chat-bg-dim', `${value}%`);
  });
  dimInput.addEventListener('change', async () => {
    const value = normalizeDim(dimInput.value);
    await updateSettings({ chatBackgroundDim: value });
  });
  const dimField = wrapField('背景淡化', dimInput);
  const label = dimField.querySelector('.form-label');
  if (label) label.appendChild(dimValue);
  box.appendChild(dimField);

  const dimHint = document.createElement('div');
  dimHint.className = 'form-hint';
  dimHint.textContent = '數值越大越接近主題底色；未自訂淡化的聊天室會跟隨此設定。';
  box.appendChild(dimHint);

  file.addEventListener('change', async () => {
    const selected = file.files && file.files[0];
    file.value = '';
    if (!selected) return;
    if (selected.size > CHAT_BACKGROUND_MAX_BYTES) {
      showToast('聊天背景圖片需小於 2MB');
      return;
    }
    upload.disabled = true;
    try {
      const nextAssetId = await saveImageAsset(selected, 'chatBackground', 1600);
      await updateChatBackgroundAsset(nextAssetId);
      showToast('聊天背景已更新');
    } catch (err) {
      showToast('聊天背景上傳失敗');
    } finally {
      upload.disabled = false;
    }
  });

  return box;
}

function normalizeDim(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 72;
  return Math.min(90, Math.max(20, Math.floor(n)));
}

function clampLevel(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 2;
  return Math.min(3, Math.max(1, Math.floor(n)));
}

function renderLifeSettings(container, state) {
  const wrap = document.createElement('div');
  wrap.className = 'life-settings';

  const desc = document.createElement('p');
  desc.className = 'gp-desc';
  desc.textContent = '控制私語與聲箋的背景產生；弦外之音會在對話中自然產生。未連接 AI 服務時不會自動產生。';
  wrap.appendChild(desc);

  const enabled = document.createElement('label');
  enabled.className = 'form-field form-check';
  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.checked = state.settings.lifeEnabled !== false;
  toggle.addEventListener('change', () => updateSettings({ lifeEnabled: toggle.checked }));
  const enabledText = document.createElement('span');
  enabledText.className = 'form-check-label';
  enabledText.textContent = '啟用角色生活感背景產生';
  enabled.appendChild(toggle);
  enabled.appendChild(enabledText);
  wrap.appendChild(enabled);

  const every = document.createElement('input');
  every.type = 'number';
  every.min = '0';
  every.max = '365';
  every.step = '1';
  every.className = 'form-control';
  every.value = String(state.settings.lifeEveryDays ?? 3);
  every.addEventListener('change', () => updateSettings({ lifeEveryDays: Number(every.value) }));
  wrap.appendChild(wrapField('每隔幾天檢查一次', every));

  const limit = document.createElement('input');
  limit.type = 'number';
  limit.min = '0';
  limit.max = '200';
  limit.step = '1';
  limit.className = 'form-control';
  limit.value = String(state.settings.lifeDailyLimit ?? 5);
  limit.addEventListener('change', () => updateSettings({ lifeDailyLimit: Number(limit.value) }));
  wrap.appendChild(wrapField('每日生活內容聲量上限', limit));

  const hint = document.createElement('div');
  hint.className = 'form-hint';
  hint.textContent = '手動「讓 TA 寫一則」也會走真 AI 並計入此上限；上限 0 代表不限制。';
  wrap.appendChild(hint);

  container.appendChild(wrap);
}

function renderDailySettings(container, state) {
  const wrap = document.createElement('div');
  wrap.className = 'life-settings';

  const desc = document.createElement('p');
  desc.className = 'gp-desc';
  desc.textContent = '控制角色是否能感知妳主動勾選「讓 TA 們知道」的拾日。私密拾日永遠不會注入聊天。';
  wrap.appendChild(desc);

  const enabled = document.createElement('label');
  enabled.className = 'form-field form-check';
  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.checked = state.settings.dailyAwarenessEnabled !== false;
  toggle.addEventListener('change', () => updateSettings({ dailyAwarenessEnabled: toggle.checked }));
  const enabledText = document.createElement('span');
  enabledText.className = 'form-check-label';
  enabledText.textContent = '打開後，角色會知道妳最近勾了「讓 TA 們知道」的拾日';
  enabled.appendChild(toggle);
  enabled.appendChild(enabledText);
  wrap.appendChild(enabled);

  wrap.appendChild(buildWeeklyReviewSettings(state));

  container.appendChild(wrap);
}

// V12.5：週回顧聲箋——每週由指定角色寄一封信，回顧這週的拾日、日課與身體狀態。
function buildWeeklyReviewSettings(state) {
  const box = document.createElement('div');
  box.className = 'weekly-review-settings';

  const desc = document.createElement('p');
  desc.className = 'gp-desc';
  desc.textContent = '每週由 TA 寄一封信，幫妳回顧這週的拾日、日課與身體狀態。';
  box.appendChild(desc);

  const enabled = document.createElement('label');
  enabled.className = 'form-field form-check';
  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.checked = state.settings.weeklyReviewEnabled === true;
  const enabledText = document.createElement('span');
  enabledText.className = 'form-check-label';
  enabledText.textContent = '啟用週回顧聲箋';
  enabled.appendChild(toggle);
  enabled.appendChild(enabledText);
  box.appendChild(enabled);

  const select = document.createElement('select');
  select.className = 'form-control';
  const emptyOpt = document.createElement('option');
  emptyOpt.value = '';
  emptyOpt.textContent = '請選擇角色';
  select.appendChild(emptyOpt);
  for (const character of state.characters || []) {
    const opt = document.createElement('option');
    opt.value = character.id;
    opt.textContent = character.name || '未命名角色';
    if (character.id === state.settings.weeklyReviewCharacterId) opt.selected = true;
    select.appendChild(opt);
  }
  box.appendChild(wrapField('由誰寄信', select));

  const hint = document.createElement('div');
  box.appendChild(hint);

  function syncHint() {
    if (toggle.checked && !select.value) {
      hint.className = 'backup-status error';
      hint.textContent = '請選一位角色，週回顧才會寄出。';
    } else {
      hint.className = 'form-hint';
      hint.textContent = '開啟後每 7 天開 app 自動寄一封；也可以在「日常」頁手動觸發。';
    }
  }
  syncHint();

  toggle.addEventListener('change', () => {
    updateSettings({ weeklyReviewEnabled: toggle.checked });
    syncHint();
  });
  select.addEventListener('change', () => {
    updateSettings({ weeklyReviewCharacterId: select.value });
    syncHint();
  });

  return box;
}

function renderStickerManager(container, state) {
  const form = document.createElement('form');
  form.className = 'char-form sticker-form';

  const file = document.createElement('input');
  file.type = 'file';
  file.accept = 'image/*';
  form.appendChild(wrapField('上傳圖片', file));

  const context = document.createElement('input');
  context.type = 'text';
  context.className = 'form-control';
  context.placeholder = '（開心地轉圈圈）';
  form.appendChild(wrapField('語境文字', context));

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'btn btn-primary';
  submit.textContent = '新增貼圖';
  form.appendChild(submit);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = file.files && file.files[0];
    if (!f || !context.value.trim()) return;
    submit.disabled = true;
    try {
      const assetId = await saveImageAsset(f, 'sticker', 512);
      await addSticker({ assetId, contextText: context.value.trim() });
      file.value = '';
      context.value = '';
    } finally {
      submit.disabled = false;
    }
  });
  container.appendChild(form);

  const grid = document.createElement('div');
  grid.className = 'sticker-admin-grid';
  for (const sticker of (state.stickers || [])) {
    const item = document.createElement('div');
    item.className = 'sticker-admin-item';

    const preview = document.createElement('div');
    preview.className = 'sticker-admin-preview';
    preview.textContent = '貼圖';
    getObjectURL(sticker.assetId).then((url) => {
      if (!url) return;
      preview.textContent = '';
      const img = document.createElement('img');
      img.src = url;
      img.alt = sticker.contextText || '貼圖';
      preview.appendChild(img);
    });
    item.appendChild(preview);

    const ctxInput = document.createElement('input');
    ctxInput.type = 'text';
    ctxInput.className = 'form-control';
    ctxInput.value = sticker.contextText || '';
    ctxInput.placeholder = '語境文字';
    item.appendChild(ctxInput);

    const actions = document.createElement('div');
    actions.className = 'form-actions';
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'btn';
    save.textContent = '儲存';
    save.addEventListener('click', () => updateSticker(sticker.id, { contextText: ctxInput.value.trim() }));
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn btn-danger';
    del.textContent = '刪除';
    del.addEventListener('click', async () => {
      if (await confirmDialog({
        title: '刪除貼圖',
        message: '刪除這張貼圖？',
        confirmText: '刪除',
        danger: true
      })) deleteSticker(sticker.id);
    });
    actions.appendChild(save);
    actions.appendChild(del);
    item.appendChild(actions);
    grid.appendChild(item);
  }
  container.appendChild(grid);
}

async function renderUsageStats(container, state) {
  const box = document.createElement('div');
  box.className = 'stats-box settings-usage-box';
  box.textContent = '載入中…';
  container.appendChild(box);
  let stats;
  try {
    stats = await getStats(state);
  } catch (e) {
    box.textContent = '聲量讀取失敗';
    return;
  }
  box.textContent = '';
  const grid = document.createElement('div');
  grid.className = 'stats-grid';
  grid.appendChild(statCard('今日', stats.today));
  grid.appendChild(statCard('本月', stats.month));
  grid.appendChild(statCard('累計', stats.total));
  box.appendChild(grid);
  const note = document.createElement('div');
  note.className = 'form-hint';
  note.textContent = '統計聊天回覆與背景 AI 任務的真 API token；模擬回覆不計入。';
  box.appendChild(note);
}

function statCard(label, usage) {
  const card = document.createElement('div');
  card.className = 'stat-card';
  const l = document.createElement('div');
  l.className = 'stat-label';
  l.textContent = label;
  const total = (usage.prompt || 0) + (usage.completion || 0);
  const v = document.createElement('div');
  v.className = 'stat-value';
  v.textContent = total.toLocaleString();
  const detail = document.createElement('div');
  detail.className = 'stat-detail';
  detail.textContent = `↑${(usage.prompt || 0).toLocaleString()} ↓${(usage.completion || 0).toLocaleString()}`;
  card.appendChild(l);
  card.appendChild(v);
  card.appendChild(detail);
  return card;
}

function wrapField(label, control) {
  const el = document.createElement('label');
  el.className = 'form-field';
  const span = document.createElement('span');
  span.className = 'form-label';
  span.textContent = label;
  el.appendChild(span);
  el.appendChild(control);
  return el;
}

// src/ui/components/settingsPage.js
//
// Settings is a single scrollable page. External callers may request a section
// by key through setSettingsTab for backward compatibility with older tab code.

import { renderApiSettingsEditor } from './apiSettingsEditor.js';
import { renderGlobalPromptsEditor } from './globalPromptsEditor.js';
import { renderPlayerEditor } from './playerEditor.js';
import { renderBackupPanel } from './backupPanel.js';
import { addSticker, updateSticker, deleteSticker, updateSettings } from '../../state/store.js';
import { saveImageAsset, getObjectURL } from '../../services/assetService.js';
import { getStats } from '../../services/statsService.js';
import { createIcon } from '../icons.js';

const SECTION_KEYS = new Set(['player', 'api', 'appearance', 'life', 'stickers', 'prompts', 'usage', 'data']);
let pendingScrollTarget = '';
const expandedSections = new Set();

// Kept for callers such as the home backup reminder. The page no longer has
// tabs; this records the section that should be scrolled into view.
export function setSettingsTab(key) {
  if (SECTION_KEYS.has(key)) pendingScrollTarget = key;
}

// 四種配色取自聲學的「噪音顏色」；swatch 圓點 = 該主題的 bg / primary / bubble。
const THEME_PALETTES = [
  { key: 'blue', label: '藍噪', hint: '清晨廣播的冷靜', dots: { light: ['#eef4f8', '#2f6f8f', '#d4e7ef'], dark: ['#101923', '#78bfe1', '#294f66'] } },
  { key: 'pink', label: '粉噪', hint: '溫柔的傍晚', dots: { light: ['#f7eef3', '#a94f76', '#f1d5e2'], dark: ['#21151d', '#e08aad', '#63384e'] } },
  { key: 'green', label: '綠噪', hint: '靜謐的森林', dots: { light: ['#eef6f0', '#387a57', '#d5eadb'], dark: ['#101d18', '#7ac99c', '#2c5d45'] } },
  { key: 'violet', label: '紫噪', hint: '深夜的紫煙', dots: { light: ['#f3effb', '#7552b8', '#e1d6f5'], dark: ['#181425', '#b59cff', '#433060'] } }
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

// ---- 外觀：四配色 × 明暗 ----
function renderAppearance(container, state) {
  const wrap = document.createElement('div');
  wrap.className = 'theme-picker';

  const desc = document.createElement('p');
  desc.className = 'gp-desc';
  desc.textContent = '拾聲的四種配色取自聲學的「噪音顏色」。明版清淡，暗版保留主色微光，內容卡片維持可讀。';
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
  container.appendChild(wrap);
}

function renderLifeSettings(container, state) {
  const wrap = document.createElement('div');
  wrap.className = 'life-settings';

  const desc = document.createElement('p');
  desc.className = 'gp-desc';
  desc.textContent = '控制私語、弦外之音與聲箋的背景產生。未連接 AI 服務時不會自動產生。';
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
    del.addEventListener('click', () => {
      if (window.confirm('刪除這張貼圖？')) deleteSticker(sticker.id);
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

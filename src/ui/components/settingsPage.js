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

const SECTION_KEYS = new Set(['player', 'api', 'appearance', 'stickers', 'prompts', 'data']);
let pendingScrollTarget = '';

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

  const page = document.createElement('div');
  page.className = 'settings-page';

  const title = document.createElement('h1');
  title.className = 'page-title';
  title.textContent = '設定';
  page.appendChild(title);

  page.appendChild(settingsSection('player', '玩家設定', (body) => renderPlayerProfile(body, state)));
  page.appendChild(settingsSection('api', 'API 設定', (body) => renderApiSettingsEditor(body, state)));
  page.appendChild(settingsSection('appearance', '外觀', (body) => renderAppearance(body, state)));
  page.appendChild(settingsSection('stickers', '貼圖', (body) => renderStickerManager(body, state)));
  page.appendChild(settingsSection('prompts', 'Prompt 存放區', (body) => renderGlobalPromptsEditor(body, state)));
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

function settingsSection(key, title, renderBody) {
  const section = document.createElement('section');
  section.className = 'settings-section';
  section.dataset.settingsSection = key;
  section.id = `settings-${key}`;

  const heading = document.createElement('h2');
  heading.className = 'settings-section-title';
  heading.textContent = title;
  section.appendChild(heading);

  const card = document.createElement('div');
  card.className = 'settings-card';
  renderBody(card);
  section.appendChild(card);

  return section;
}

function renderPlayerProfile(container, state) {
  const profile = document.createElement('div');
  profile.className = 'settings-profile-card';
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
  container.appendChild(profile);

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

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
import { addSticker, updateSticker, deleteSticker, updateSettings } from '../../state/store.js';
import { saveImageAsset, getObjectURL } from '../../services/assetService.js';

const TABS = [
  { key: 'appearance', label: '外觀' },
  { key: 'api', label: 'API 設定' },
  { key: 'prompts', label: 'Prompt 存放區' },
  { key: 'stickers', label: '小劇場' },
  { key: 'player', label: '玩家設定' },
  { key: 'data', label: '資料' }
];

// 四種配色取自聲學的「噪音顏色」；swatch 圓點 = 該主題的 bg / primary / bubble。
const THEME_PALETTES = [
  { key: 'blue', label: '藍噪', hint: '清晨廣播的冷靜', dots: { light: ['#eef4f8', '#2f6f8f', '#d4e7ef'], dark: ['#101923', '#78bfe1', '#294f66'] } },
  { key: 'pink', label: '粉噪', hint: '溫柔的傍晚', dots: { light: ['#f7eef3', '#a94f76', '#f1d5e2'], dark: ['#21151d', '#e08aad', '#63384e'] } },
  { key: 'green', label: '綠噪', hint: '靜謐的森林', dots: { light: ['#eef6f0', '#387a57', '#d5eadb'], dark: ['#101d18', '#7ac99c', '#2c5d45'] } },
  { key: 'violet', label: '紫噪', hint: '深夜的紫煙', dots: { light: ['#f3effb', '#7552b8', '#e1d6f5'], dark: ['#181425', '#b59cff', '#433060'] } }
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

  if (activeTab === 'appearance') {
    renderAppearance(body, state);
  } else if (activeTab === 'prompts') {
    renderGlobalPromptsEditor(body, state);
  } else if (activeTab === 'stickers') {
    renderStickerManager(body, state);
  } else if (activeTab === 'player') {
    renderPlayerEditor(body, state);
  } else if (activeTab === 'data') {
    renderBackupPanel(body);
  } else {
    renderApiSettingsEditor(body, state);
  }

  container.appendChild(page);
}

// ---- 外觀：四配色 × 明暗 ----
function renderAppearance(container, state) {
  container.textContent = '';

  const wrap = document.createElement('div');
  wrap.className = 'theme-picker';

  const desc = document.createElement('p');
  desc.className = 'gp-desc';
  desc.textContent = '拾聲的四種配色取自聲學的「噪音顏色」——藍噪、粉噪、綠噪、紫噪，各有明暗兩版。新用戶預設藍噪亮版，也可切到紫噪暗版。';
  wrap.appendChild(desc);

  const currentTheme = state.settings.theme || 'blue';
  const currentMode = state.settings.themeMode === 'dark' ? 'dark' : 'light';

  // 明暗切換
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

  // 配色 swatch
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
  container.textContent = '';
  const form = document.createElement('form');
  form.className = 'char-form';
  const file = document.createElement('input');
  file.type = 'file';
  file.accept = 'image/*';
  form.appendChild(wrapField('貼圖圖片', file));
  const label = document.createElement('input');
  label.type = 'text';
  label.className = 'form-control';
  label.placeholder = '短名，例如：轉圈';
  form.appendChild(wrapField('label', label));
  const context = document.createElement('input');
  context.type = 'text';
  context.className = 'form-control';
  context.placeholder = '（開心地轉圈圈）';
  form.appendChild(wrapField('語境文字', context));
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'btn btn-primary';
  submit.textContent = '新增小劇場';
  form.appendChild(submit);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = file.files && file.files[0];
    if (!f || !label.value.trim()) return;
    submit.disabled = true;
    const assetId = await saveImageAsset(f, 'sticker', 512);
    await addSticker({ assetId, label: label.value, contextText: context.value });
    file.value = '';
    label.value = '';
    context.value = '';
    submit.disabled = false;
  });
  container.appendChild(form);

  const grid = document.createElement('div');
  grid.className = 'sticker-admin-grid';
  for (const sticker of (state.stickers || [])) {
    const item = document.createElement('div');
    item.className = 'sticker-admin-item';
    const preview = document.createElement('div');
    preview.className = 'sticker-admin-preview';
    preview.textContent = sticker.label || '貼圖';
    getObjectURL(sticker.assetId).then((url) => {
      if (!url) return;
      preview.textContent = '';
      const img = document.createElement('img');
      img.src = url;
      img.alt = sticker.label || '';
      preview.appendChild(img);
    });
    item.appendChild(preview);
    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.className = 'form-control';
    labelInput.value = sticker.label || '';
    item.appendChild(labelInput);
    const ctxInput = document.createElement('input');
    ctxInput.type = 'text';
    ctxInput.className = 'form-control';
    ctxInput.value = sticker.contextText || '';
    item.appendChild(ctxInput);
    const actions = document.createElement('div');
    actions.className = 'form-actions';
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'btn';
    save.textContent = '儲存';
    save.addEventListener('click', () => updateSticker(sticker.id, { label: labelInput.value, contextText: ctxInput.value }));
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn btn-danger';
    del.textContent = '刪除';
    del.addEventListener('click', () => {
      if (window.confirm('刪除這張小劇場貼圖？')) deleteSticker(sticker.id);
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

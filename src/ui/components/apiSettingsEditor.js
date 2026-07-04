// src/ui/components/apiSettingsEditor.js
//
// 右欄「API 設定」分頁（V1 任務 2.1）。
//
// 欄位：provider / model / baseUrl / apiKey / rememberApiKey / temperature / maxTokens、
// 「測試連線」按鈕、以及累計 token 用量顯示（從所有 message.usage 加總）。
//
// 安全性：apiKey 只放在 password 欄位與記憶體 state；rememberApiKey=false 時
// db.saveState 不會把 apiKey 寫入 IndexedDB（重新整理後欄位即為空）。

import { updateApiSettings } from '../../state/store.js';
import { testConnection } from '../../services/aiService.js';
import { getAllMessages } from '../../db/indexeddb.js';

const PROVIDER_DEFAULT_BASE = {
  anthropic: 'https://api.anthropic.com',
  'openai-compatible': 'https://api.openai.com/v1',
  gemini: 'https://generativelanguage.googleapis.com'
};

const PROVIDER_OPTIONS = [
  { value: '', label: '（未設定 — 使用模擬回覆）' },
  { value: 'anthropic', label: 'anthropic（Claude）' },
  { value: 'openai-compatible', label: 'openai-compatible（GPT 等）' },
  { value: 'gemini', label: 'gemini（Google）' }
];

// 各 provider 目前的常見模型 ID（下拉預設值）。名稱會隨供應商更新，
// 因此一律附「其他（自行輸入）」讓使用者可填任意最新型號。
const CUSTOM_MODEL = '__custom__';
const PROVIDER_MODELS = {
  anthropic: ['claude-opus-4-8', 'claude-sonnet-5', 'claude-haiku-4-5', 'claude-fable-5'],
  'openai-compatible': ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'o3', 'o4-mini'],
  gemini: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
  '': []
};

export function renderApiSettingsEditor(container, state) {
  container.textContent = '';

  const api = state.apiSettings || {};

  const form = document.createElement('form');
  form.className = 'char-form';

  // provider（下拉）
  const providerSel = document.createElement('select');
  providerSel.className = 'form-control';
  for (const opt of PROVIDER_OPTIONS) {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.label;
    if ((api.provider || '') === opt.value) o.selected = true;
    providerSel.appendChild(o);
  }
  form.appendChild(wrapField('AI 服務 (provider)', providerSel));

  // model（下拉：依 provider 帶出常見型號，另有「其他（自行輸入）」）
  const modelControl = buildModelControl(api.model || '', api.provider || '');
  form.appendChild(wrapField('模型 (model)', modelControl.wrap));

  // baseUrl（placeholder 依 provider 顯示預設值）
  const baseUrlInput = textInput(api.baseUrl || '', '');
  const baseUrlField = wrapField('Base URL（留空使用預設）', baseUrlInput);
  form.appendChild(baseUrlField);
  const syncBaseUrlPlaceholder = () => {
    const def = PROVIDER_DEFAULT_BASE[providerSel.value];
    baseUrlInput.placeholder = def ? `預設：${def}` : '（未設定 provider）';
  };
  syncBaseUrlPlaceholder();

  // provider 變更：同步 baseUrl placeholder 與 model 下拉選項。
  providerSel.addEventListener('change', () => {
    syncBaseUrlPlaceholder();
    modelControl.repopulate(providerSel.value);
  });

  // apiKey（password）
  const apiKeyInput = document.createElement('input');
  apiKeyInput.type = 'password';
  apiKeyInput.className = 'form-control';
  apiKeyInput.value = api.apiKey || '';
  apiKeyInput.placeholder = '貼上 API 金鑰';
  apiKeyInput.autocomplete = 'off';
  form.appendChild(wrapField('API 金鑰 (apiKey)', apiKeyInput));

  // rememberApiKey（checkbox）
  const rememberWrap = document.createElement('label');
  rememberWrap.className = 'form-field form-check';
  const rememberInput = document.createElement('input');
  rememberInput.type = 'checkbox';
  rememberInput.checked = !!api.rememberApiKey;
  const rememberText = document.createElement('span');
  rememberText.className = 'form-check-label';
  rememberText.textContent = '記住金鑰：勾選後金鑰將以明文存在本機瀏覽器資料中；不勾選則重新整理後需重新輸入。';
  rememberWrap.appendChild(rememberInput);
  rememberWrap.appendChild(rememberText);
  form.appendChild(rememberWrap);

  // temperature（0–2）
  const tempInput = document.createElement('input');
  tempInput.type = 'number';
  tempInput.className = 'form-control';
  tempInput.min = '0';
  tempInput.max = '2';
  tempInput.step = '0.1';
  tempInput.value = api.temperature != null ? String(api.temperature) : '1';
  form.appendChild(wrapField('temperature（0–2）', tempInput));

  // maxTokens
  const maxTokInput = document.createElement('input');
  maxTokInput.type = 'number';
  maxTokInput.className = 'form-control';
  maxTokInput.min = '1';
  maxTokInput.step = '1';
  maxTokInput.value = api.maxTokens != null ? String(api.maxTokens) : '1024';
  form.appendChild(wrapField('maxTokens', maxTokInput));

  // 讀取目前表單值組出 apiSettings 物件（供儲存與測試連線共用）。
  const collect = () => ({
    provider: providerSel.value,
    model: modelControl.getValue(),
    baseUrl: baseUrlInput.value.trim(),
    apiKey: apiKeyInput.value,
    rememberApiKey: rememberInput.checked,
    temperature: clampNum(tempInput.value, 0, 2, 1),
    maxTokens: Math.max(1, Math.round(clampNum(maxTokInput.value, 1, 1000000, 1024)))
  });

  // 動作列：儲存 + 測試連線
  const actions = document.createElement('div');
  actions.className = 'form-actions';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'submit';
  saveBtn.className = 'btn btn-primary';
  saveBtn.textContent = '儲存 API 設定';

  const testBtn = document.createElement('button');
  testBtn.type = 'button';
  testBtn.className = 'btn';
  testBtn.textContent = '測試連線';

  actions.appendChild(saveBtn);
  actions.appendChild(testBtn);
  form.appendChild(actions);

  // 測試連線結果狀態列
  const testStatus = document.createElement('div');
  testStatus.className = 'api-test-status';
  form.appendChild(testStatus);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await updateApiSettings(collect());
    // 注意：updateApiSettings 會觸發 notify → 整個右欄重繪，本元件會被重建。
    // 因此不需在此手動更新按鈕狀態。
  });

  testBtn.addEventListener('click', async () => {
    const settings = collect();
    testStatus.textContent = '測試中…';
    testStatus.className = 'api-test-status';
    testBtn.disabled = true;
    try {
      const { model } = await testConnection(settings);
      testStatus.textContent = `連線成功（${model}）`;
      testStatus.className = 'api-test-status ok';
    } catch (err) {
      const msg = (err && err.userMessage) || (err && err.message) || '連線失敗';
      testStatus.textContent = `連線失敗：${msg}`;
      testStatus.className = 'api-test-status error';
    } finally {
      testBtn.disabled = false;
    }
  });

  container.appendChild(form);

  // ---- 累計 token 用量（從所有 message.usage 加總）----
  const usageBox = document.createElement('div');
  usageBox.className = 'api-usage';
  usageBox.textContent = '累計 token 用量：載入中…';
  container.appendChild(usageBox);

  loadCumulativeUsage()
    .then(({ prompt, completion }) => {
      usageBox.textContent =
        `累計 token 用量：輸入 ${prompt.toLocaleString()}／輸出 ${completion.toLocaleString()}（合計 ${(prompt + completion).toLocaleString()}）`;
    })
    .catch(() => {
      usageBox.textContent = '累計 token 用量：讀取失敗';
    });

  // 說明
  const note = document.createElement('div');
  note.className = 'form-hint';
  note.textContent = '未設定 provider 或未填金鑰時，聊天會使用內建模擬回覆。瀏覽器直連 API 代表金鑰會出現在本機的網路請求中，這是個人本機工具的預期行為；共用電腦請勿勾選「記住金鑰」。';
  container.appendChild(note);
}

async function loadCumulativeUsage() {
  const all = await getAllMessages();
  let prompt = 0;
  let completion = 0;
  for (const m of all) {
    if (m && m.usage) {
      prompt += Number(m.usage.promptTokens) || 0;
      completion += Number(m.usage.completionTokens) || 0;
    }
  }
  return { prompt, completion };
}

// ---- 小工具 ----

function wrapField(label, control) {
  const el = document.createElement('label');
  el.className = 'form-field';
  const labelEl = document.createElement('span');
  labelEl.className = 'form-label';
  labelEl.textContent = label;
  el.appendChild(labelEl);
  el.appendChild(control);
  return el;
}

// model 下拉控制項：依 provider 帶出常見型號，選「其他（自行輸入）」時顯示文字框。
// 回傳 { wrap, getValue(), repopulate(provider) }。
function buildModelControl(initialModel, initialProvider) {
  const wrap = document.createElement('div');
  wrap.className = 'model-control';

  const select = document.createElement('select');
  select.className = 'form-control';

  const custom = document.createElement('input');
  custom.type = 'text';
  custom.className = 'form-control model-custom';
  custom.placeholder = '輸入模型 ID（例如最新型號）';

  function currentValue() {
    return select.value === CUSTOM_MODEL ? custom.value.trim() : select.value;
  }

  function populate(provider, model) {
    select.textContent = '';
    const list = PROVIDER_MODELS[provider] || [];
    for (const m of list) {
      const o = document.createElement('option');
      o.value = m;
      o.textContent = m;
      select.appendChild(o);
    }
    const customOpt = document.createElement('option');
    customOpt.value = CUSTOM_MODEL;
    customOpt.textContent = '其他（自行輸入）';
    select.appendChild(customOpt);

    if (model && list.includes(model)) {
      select.value = model;
      custom.value = '';
    } else if (model) {
      // 已保存的自訂型號（不在清單中）→ 選「其他」並帶入。
      select.value = CUSTOM_MODEL;
      custom.value = model;
    } else {
      select.value = list.length ? list[0] : CUSTOM_MODEL;
      custom.value = '';
    }
    custom.style.display = select.value === CUSTOM_MODEL ? '' : 'none';
  }

  select.addEventListener('change', () => {
    custom.style.display = select.value === CUSTOM_MODEL ? '' : 'none';
    if (select.value === CUSTOM_MODEL) custom.focus();
  });

  populate(initialProvider, initialModel);
  wrap.appendChild(select);
  wrap.appendChild(custom);

  return {
    wrap,
    getValue: currentValue,
    // provider 變更時重新帶出該 provider 的預設清單（不沿用舊型號）。
    repopulate: (provider) => populate(provider, '')
  };
}

function textInput(value, placeholder) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'form-control';
  input.value = value;
  input.placeholder = placeholder || '';
  return input;
}

function clampNum(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

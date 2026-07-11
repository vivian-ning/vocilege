// src/ui/components/apiSettingsEditor.js
//
// 右欄「API 設定」分頁（V1 任務 2.1）。
//
// 欄位：provider / model / baseUrl / apiKey / rememberApiKey / temperature / maxTokens、
// 「測試連線」按鈕、以及累計 token 用量顯示（從所有 message.usage 加總）。
//
// 安全性：apiKey 只放在 password 欄位與記憶體 state；rememberApiKey=false 時
// db.saveState 不會把 apiKey 寫入 IndexedDB（重新整理後欄位即為空）。

import { updateApiSettings, updateSettings } from '../../state/store.js';
import { testConnection } from '../../services/aiService.js';
import { getAllMessages } from '../../db/indexeddb.js';
import { createToggle } from '../toggle.js';

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
  'openai-compatible': ['opus', 'sonnet', 'haiku', 'gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'o3', 'o4-mini'],
  gemini: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
  '': []
};

const MODEL_LABELS = {
  opus: 'opus\uFF08\u62FE\u8072\u6A4B\uFF09',
  sonnet: 'sonnet\uFF08\u62FE\u8072\u6A4B\uFF09',
  haiku: 'haiku\uFF08\u62FE\u8072\u6A4B\uFF09'
};

const LOCAL_BRIDGE_BASE_URL = 'http://127.0.0.1:8787/v1';

export function renderApiSettingsEditor(container, state) {
  container.textContent = '';

  const api = state.apiSettings || {};

  const form = document.createElement('form');
  form.className = 'char-form';

  const bridgeTools = document.createElement('div');
  bridgeTools.className = 'api-bridge-tools';

  const useBridgeBtn = document.createElement('button');
  useBridgeBtn.type = 'button';
  useBridgeBtn.className = 'btn';
  useBridgeBtn.textContent = '使用拾聲橋（本機）';
  bridgeTools.appendChild(useBridgeBtn);

  const bridgeStatus = document.createElement('div');
  bridgeStatus.className = 'api-bridge-status';
  bridgeStatus.setAttribute('role', 'status');
  bridgeStatus.setAttribute('aria-live', 'polite');

  const bridgeDot = document.createElement('span');
  bridgeDot.className = 'api-bridge-dot';
  bridgeDot.setAttribute('aria-hidden', 'true');
  bridgeStatus.appendChild(bridgeDot);

  const bridgeText = document.createElement('span');
  bridgeText.className = 'api-bridge-text';
  bridgeStatus.appendChild(bridgeText);

  const bridgeCheckBtn = document.createElement('button');
  bridgeCheckBtn.type = 'button';
  bridgeCheckBtn.className = 'btn api-bridge-check';
  bridgeCheckBtn.textContent = '重新檢查';
  bridgeStatus.appendChild(bridgeCheckBtn);
  bridgeTools.appendChild(bridgeStatus);

  form.appendChild(bridgeTools);

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

  const utilityModelInput = textInput(api.utilityModel || '', '');
  utilityModelInput.placeholder = '可留白，留白時使用主要 model';
  form.appendChild(wrapField('utilityModel（輔助任務模型）', utilityModelInput, '背景小任務（摘要、生活內容）用的省錢模型，空 = 用主模型。'));

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
    scheduleBridgeCheck();
  });
  baseUrlInput.addEventListener('input', () => scheduleBridgeCheck());

  // apiKey（password）
  const apiKeyInput = document.createElement('input');
  apiKeyInput.type = 'password';
  apiKeyInput.className = 'form-control';
  apiKeyInput.value = api.apiKey || '';
  apiKeyInput.placeholder = '貼上 API 金鑰或橋通行碼';
  apiKeyInput.autocomplete = 'off';
  const apiKeyField = wrapField('API 金鑰／橋通行碼 (apiKey)', apiKeyInput);
  const bridgeKeyHint = document.createElement('span');
  bridgeKeyHint.className = 'gp-desc api-field-desc api-bridge-key-hint';
  bridgeKeyHint.hidden = true;
  bridgeKeyHint.textContent = '橋沒設通行碼填 local；設了通行碼就填 bridge-config.json 的 authToken（設定精靈的小卡上有）';
  apiKeyField.appendChild(bridgeKeyHint);
  form.appendChild(apiKeyField);

  const rememberToggle = createToggle({
    checked: !!api.rememberApiKey,
    label: '記住金鑰',
    description: '開啟後金鑰將以明文存在本機瀏覽器資料中；不記住則重新開啟後需重填（含橋通行碼）。'
  });
  const rememberInput = rememberToggle.input;
  form.appendChild(rememberToggle.el);

  const visionToggle = createToggle({
    checked: api.visionEnabled === true,
    label: 'visionEnabled',
    description: '開啟後照片會隨請求送出，token / 圖片成本會增加。'
  });
  const visionInput = visionToggle.input;
  form.appendChild(visionToggle.el);

  const thinkingToggle = createToggle({
    checked: api.showThinking === true,
    label: '顯示思考過程',
    description: '顯示模型思考過程；需模型支援，開了會變貴變慢。'
  });
  const thinkingInput = thinkingToggle.input;
  form.appendChild(thinkingToggle.el);

  const thinkingBudgetInput = document.createElement('input');
  thinkingBudgetInput.type = 'number';
  thinkingBudgetInput.className = 'form-control';
  thinkingBudgetInput.min = '1024';
  thinkingBudgetInput.step = '1';
  thinkingBudgetInput.value = api.thinkingBudget != null ? String(api.thinkingBudget) : '1024';
  const syncThinkingBudget = () => {
    thinkingBudgetInput.disabled = !thinkingInput.checked;
  };
  thinkingInput.addEventListener('change', syncThinkingBudget);
  syncThinkingBudget();
  form.appendChild(wrapField('思考預算（tokens）', thinkingBudgetInput, '思考長度上限；開了會變貴變慢。'));

  // temperature（0–2）
  const tempInput = document.createElement('input');
  tempInput.type = 'number';
  tempInput.className = 'form-control';
  tempInput.min = '0';
  tempInput.max = '2';
  tempInput.step = '0.1';
  tempInput.value = api.temperature != null ? String(api.temperature) : '1';
  form.appendChild(wrapField('temperature（0–2）', tempInput, '回覆的隨機程度，越高越有創意、越低越穩定（建議 1）。'));

  // maxTokens
  const maxTokInput = document.createElement('input');
  maxTokInput.type = 'number';
  maxTokInput.className = 'form-control';
  maxTokInput.min = '1';
  maxTokInput.step = '1';
  maxTokInput.value = api.maxTokens != null ? String(api.maxTokens) : '2048';
  form.appendChild(wrapField('maxTokens', maxTokInput, '單次回覆長度上限，回覆常被截斷請調高（聲箋等長文也會跟著放寬）。'));

  // memoryInjectionLimit（記憶注入上限）：屬 settings 而非 apiSettings，改動即時獨立
  // 儲存（不隨「儲存 API 設定」），避免與 apiKey 表單耦合。
  const memLimitInput = document.createElement('input');
  memLimitInput.type = 'number';
  memLimitInput.className = 'form-control';
  memLimitInput.min = '0';
  memLimitInput.step = '1';
  const curLimit = state.settings && state.settings.memoryInjectionLimit != null
    ? state.settings.memoryInjectionLimit : 10;
  memLimitInput.value = String(curLimit);
  memLimitInput.addEventListener('change', () => {
    const n = Math.max(0, Math.round(clampNum(memLimitInput.value, 0, 1000, 10)));
    updateSettings({ memoryInjectionLimit: n });
  });
  const memField = wrapField('記憶注入上限（一般記憶筆數；locked 不占名額，改動即時生效）', memLimitInput, '每次對話最多帶幾則聲痕（越多越記得妳、也越花聲量）。');
  form.appendChild(memField);

  const timeAwarenessToggle = createToggle({
    checked: state.settings.timeAwareness !== false,
    label: '時間感知',
    description: '讓角色知道目前日期、時段與近期節拍。'
  });
  const timeAwarenessInput = timeAwarenessToggle.input;
  timeAwarenessInput.addEventListener('change', () => updateSettings({ timeAwareness: timeAwarenessInput.checked }));
  form.appendChild(timeAwarenessToggle.el);

  const feedReactorsInput = numberInput(state.settings.feedReactorsPerPost, 0, 10, 1);
  feedReactorsInput.addEventListener('change', () => updateSettings({ feedReactorsPerPost: clampInt(feedReactorsInput.value, 0, 10, 2) }));
  form.appendChild(wrapField('每則迴聲反應數', feedReactorsInput));

  const feedDailyInput = numberInput(state.settings.feedDailyLimit, 0, 200, 1);
  feedDailyInput.addEventListener('change', () => updateSettings({ feedDailyLimit: clampInt(feedDailyInput.value, 0, 200, 20) }));
  form.appendChild(wrapField('每日動態 AI 上限', feedDailyInput));

  const feedAutoToggle = createToggle({
    checked: !!state.settings.feedAutoPost,
    label: '允許角色自動發動態',
    description: '角色可在每日上限內主動出現在迴聲牆。'
  });
  const feedAutoInput = feedAutoToggle.input;
  feedAutoInput.addEventListener('change', () => updateSettings({ feedAutoPost: feedAutoInput.checked }));
  form.appendChild(feedAutoToggle.el);

  const greetingInput = numberInput(state.settings.greetingAfterDays, 0, 365, 1);
  greetingInput.addEventListener('change', () => updateSettings({ greetingAfterDays: clampInt(greetingInput.value, 0, 365, 3) }));
  form.appendChild(wrapField('幾天未開啟後問候', greetingInput));

  const dreamToggle = createToggle({
    checked: state.settings.dreamEnabled !== false,
    label: '啟用 dream-lite 記憶擷取',
    description: '在條件符合時整理近期對話成聲痕。'
  });
  const dreamEnabledInput = dreamToggle.input;
  dreamEnabledInput.addEventListener('change', () => updateSettings({ dreamEnabled: dreamEnabledInput.checked }));
  form.appendChild(dreamToggle.el);

  const dreamEveryInput = numberInput(state.settings.dreamEveryMessages, 1, 1000, 1);
  dreamEveryInput.addEventListener('change', () => updateSettings({ dreamEveryMessages: clampInt(dreamEveryInput.value, 1, 1000, 20) }));
  form.appendChild(wrapField('每幾則訊息擷取一次', dreamEveryInput));

  const dreamDailyInput = numberInput(state.settings.dreamDailyLimit, 0, 200, 1);
  dreamDailyInput.addEventListener('change', () => updateSettings({ dreamDailyLimit: clampInt(dreamDailyInput.value, 0, 200, 10) }));
  form.appendChild(wrapField('每日 dream-lite 上限', dreamDailyInput));

  // 讀取目前表單值組出 apiSettings 物件（供儲存與測試連線共用）。
  const collect = () => ({
    provider: providerSel.value,
    model: modelControl.getValue(),
    utilityModel: utilityModelInput.value.trim(),
    baseUrl: baseUrlInput.value.trim(),
    apiKey: apiKeyInput.value,
    rememberApiKey: rememberInput.checked,
    visionEnabled: visionInput.checked,
    showThinking: thinkingInput.checked,
    thinkingBudget: Math.max(1024, Math.round(clampNum(thinkingBudgetInput.value, 1024, 1000000, 1024))),
    temperature: clampNum(tempInput.value, 0, 2, 1),
    maxTokens: Math.max(1, Math.round(clampNum(maxTokInput.value, 1, 1000000, 2048)))
  });

  let bridgeTimer = null;
  let bridgeCheckSeq = 0;

  function setBridgeStatus(kind, text) {
    bridgeStatus.dataset.state = kind;
    bridgeText.textContent = text;
    bridgeCheckBtn.disabled = kind === 'checking';
  }

  function syncBridgeStatusVisibility() {
    const visible = looksLikeBridge(providerSel.value, baseUrlInput.value.trim());
    bridgeStatus.hidden = !visible;
    return visible;
  }

  async function runBridgeCheck() {
    if (!syncBridgeStatusVisibility()) return;
    const currentSeq = ++bridgeCheckSeq;
    setBridgeStatus('checking', '檢查中…');
    try {
      const ok = await checkVocilegeBridgeHealth(baseUrlInput.value.trim());
      if (currentSeq !== bridgeCheckSeq) return;
      setBridgeStatus(ok ? 'ok' : 'offline', ok
        ? '拾聲橋在線'
        : '連不到拾聲橋——先雙擊 Launcher 的「拾聲-啟動」再按重新檢查');
    } catch (_) {
      if (currentSeq !== bridgeCheckSeq) return;
      setBridgeStatus('offline', '連不到拾聲橋——先雙擊 Launcher 的「拾聲-啟動」再按重新檢查');
    }
  }

  function scheduleBridgeCheck(delay = 600) {
    syncBridgeStatusVisibility();
    if (bridgeTimer) window.clearTimeout(bridgeTimer);
    bridgeTimer = window.setTimeout(() => {
      bridgeTimer = null;
      runBridgeCheck();
    }, delay);
  }

  bridgeCheckBtn.addEventListener('click', () => {
    if (bridgeTimer) {
      window.clearTimeout(bridgeTimer);
      bridgeTimer = null;
    }
    runBridgeCheck();
  });

  useBridgeBtn.addEventListener('click', () => {
    const currentModel = modelControl.getValue();
    providerSel.value = 'openai-compatible';
    providerSel.dispatchEvent(new Event('change'));
    baseUrlInput.value = LOCAL_BRIDGE_BASE_URL;
    modelControl.setValue(
      'openai-compatible',
      isLegalModelForProvider('openai-compatible', currentModel) ? currentModel : 'sonnet'
    );
    bridgeKeyHint.hidden = false;
    apiKeyInput.focus();
    scheduleBridgeCheck(0);
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
  scheduleBridgeCheck(0);

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

function looksLikeBridge(provider, baseUrl) {
  if (provider !== 'openai-compatible') return false;
  const parsed = parseUrl(baseUrl);
  if (!parsed) return false;
  const host = parsed.hostname.toLowerCase();
  return host === '127.0.0.1' || host === 'localhost' || host.endsWith('.ts.net');
}

function parseUrl(value) {
  try {
    return new URL(value);
  } catch (_) {
    return null;
  }
}

function buildBridgeHealthUrl(baseUrl) {
  const url = parseUrl(baseUrl);
  if (!url) return '';
  url.pathname = url.pathname.replace(/\/+$/, '').replace(/\/v1$/i, '') + '/health';
  url.search = '';
  url.hash = '';
  return url.toString();
}

// /health 是拾聲橋的本機狀態檢查，不是 AI 生成請求；因此允許直接 fetch，
// 但集中在這個小函式，避免新增任何 aiService 之外的模型呼叫路徑。
async function checkVocilegeBridgeHealth(baseUrl) {
  const healthUrl = buildBridgeHealthUrl(baseUrl);
  if (!healthUrl) return false;
  if (typeof Worker !== 'undefined' && window.URL && window.Blob) {
    return checkBridgeHealthInWorker(healthUrl);
  }
  return checkBridgeHealthWithFetch(healthUrl);
}

function checkBridgeHealthInWorker(healthUrl) {
  return new Promise((resolve) => {
    const workerCode = `
      self.onmessage = async (event) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3000);
        try {
          const res = await fetch(event.data, { method: 'GET', signal: controller.signal });
          const data = res.ok ? await res.json().catch(() => null) : null;
          self.postMessage(!!data && data.service === 'vocilege-bridge');
        } catch (_) {
          self.postMessage(false);
        } finally {
          clearTimeout(timer);
        }
      };
    `;
    const blobUrl = URL.createObjectURL(new Blob([workerCode], { type: 'text/javascript' }));
    const worker = new Worker(blobUrl);
    const finish = (ok) => {
      worker.terminate();
      URL.revokeObjectURL(blobUrl);
      resolve(ok === true);
    };
    const timer = window.setTimeout(() => finish(false), 3500);
    worker.onmessage = (event) => {
      window.clearTimeout(timer);
      finish(event.data);
    };
    worker.onerror = () => {
      window.clearTimeout(timer);
      finish(false);
    };
    worker.postMessage(healthUrl);
  });
}

async function checkBridgeHealthWithFetch(healthUrl) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(healthUrl, {
      method: 'GET',
      signal: controller.signal
    });
    if (!res.ok) return false;
    const data = await res.json().catch(() => null);
    return !!data && data.service === 'vocilege-bridge';
  } catch (_) {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
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

function wrapField(label, control, description = '') {
  const el = document.createElement('label');
  el.className = 'form-field';
  const labelEl = document.createElement('span');
  labelEl.className = 'form-label';
  labelEl.textContent = label;
  el.appendChild(labelEl);
  el.appendChild(control);
  if (description) {
    const desc = document.createElement('span');
    desc.className = 'gp-desc api-field-desc';
    desc.textContent = description;
    el.appendChild(desc);
  }
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
      o.textContent = MODEL_LABELS[m] || m;
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
    repopulate: (provider) => populate(provider, ''),
    setValue: (provider, model) => populate(provider, model)
  };
}

function isLegalModelForProvider(provider, model) {
  const list = PROVIDER_MODELS[provider] || [];
  return !!model && list.includes(model);
}

function textInput(value, placeholder) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'form-control';
  input.value = value;
  input.placeholder = placeholder || '';
  return input;
}

function numberInput(value, min, max, step) {
  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'form-control';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step || 1);
  input.value = value != null ? String(value) : String(min);
  return input;
}

function clampNum(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function clampInt(v, min, max, fallback) {
  return Math.round(clampNum(v, min, max, fallback));
}

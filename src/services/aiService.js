// src/services/aiService.js
//
// 唯一對外的 AI 入口（第十節）。統一介面：
//
//   generateReply({ prompt, conversation, character, player, userMessage, apiSettings })
//     -> Promise<MessagePart[]>
//
// 回傳值是 MessagePart 陣列；為了在不改變「回傳型別」的前提下附帶額外資訊，
// 我們在陣列物件上掛兩個非列舉語意的屬性（陣列本身仍是 MessagePart[]）：
//   - result.usage  ：{ promptTokens, completionTokens, model }（只有真 API 回覆才有）
//   - result.isMock ：true 代表這是 mock 回覆（未設定 provider / apiKey）
//
// V1：依 apiSettings.provider 分派——
//   - 未設定 provider 或 apiKey → 委派給 mockAIService（附 isMock 標記）
//   - openai-compatible          → POST {baseUrl}/chat/completions
//   - anthropic                  → POST {baseUrl}/v1/messages（瀏覽器直連需專用 header）
//
// 安全性（第資安要求）：apiKey 只透過 headers 傳遞，永不進入 URL、console、或錯誤訊息。
//
// Streaming：V1 不做串流，但保留 options.stream 參數與註解，未來於各 provider 分支
// 改用 SSE 讀取即可。

import { generateReply as mockGenerateReply } from './mockAIService.js';
import { systemBlocksToString } from './promptBuilder.js';

const REQUEST_TIMEOUT_MS = 60000; // 逾時 60 秒。

const DEFAULT_BASE_URLS = {
  anthropic: 'https://api.anthropic.com',
  'openai-compatible': 'https://api.openai.com/v1',
  gemini: 'https://generativelanguage.googleapis.com'
};

// 可讀錯誤：帶 userMessage（給使用者看的訊息）、status、detail。
// 絕不把 apiKey 放進任何欄位。
export class ApiError extends Error {
  constructor(userMessage, { status = 0, detail = '' } = {}) {
    super(userMessage);
    this.name = 'ApiError';
    this.userMessage = userMessage;
    this.status = status;
    this.detail = detail;
  }
}

export class UtilityUnavailableError extends Error {
  constructor() {
    super('夢釀與背景功能需要連接 AI 服務');
    this.name = 'UtilityUnavailableError';
    this.userMessage = '夢釀需要連接 AI 服務';
  }
}

// 是否使用 mock：未設定 provider 或 apiKey 為空。
export function usesMock(apiSettings) {
  const s = apiSettings || {};
  return !s.provider || !s.apiKey || !String(s.apiKey).trim();
}

function resolveBaseUrl(apiSettings) {
  const s = apiSettings || {};
  const raw = (s.baseUrl && String(s.baseUrl).trim()) || DEFAULT_BASE_URLS[s.provider] || '';
  return raw.replace(/\/+$/, ''); // 去掉結尾斜線，避免雙斜線。
}

function clampNumber(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// ---- 主要入口 ----

export async function generateReply(args) {
  const { apiSettings } = args || {};

  // 未設定 → 走 mock，附 isMock 標記。
  if (usesMock(apiSettings)) {
    const parts = await mockGenerateReply(args);
    const result = Array.isArray(parts) ? parts : [{ type: 'message', content: '……' }];
    result.isMock = true;
    return result;
  }

  const provider = apiSettings.provider;
  if (provider === 'anthropic') {
    return callAnthropic(args);
  }
  if (provider === 'openai-compatible') {
    return callOpenAICompatible(args);
  }
  if (provider === 'gemini') {
    return callGemini(args);
  }

  // 不認得的 provider：保守起見 fallback 回 mock（不丟錯，避免卡住聊天）。
  const parts = await mockGenerateReply(args);
  const result = Array.isArray(parts) ? parts : [{ type: 'message', content: '……' }];
  result.isMock = true;
  return result;
}

// 背景任務用的通用文字補全。使用 apiSettings.utilityModel；空值退回主 model。
export async function generateUtilityText({ system, userText, apiSettings, maxTokens } = {}) {
  if (usesMock(apiSettings)) throw new UtilityUnavailableError();
  const s = {
    ...(apiSettings || {}),
    model: (apiSettings && apiSettings.utilityModel) || (apiSettings && apiSettings.model) || ''
  };
  const prompt = {
    systemBlocks: [
      { text: String(system || ''), cache: true },
      { text: '', cache: false }
    ],
    messages: [{ role: 'user', content: String(userText || '') }]
  };
  const args = { prompt, apiSettings: { ...s, maxTokens: maxTokens || s.maxTokens } };
  if (s.provider === 'anthropic') return callAnthropicUtility(args);
  if (s.provider === 'openai-compatible') return callOpenAIUtility(args);
  if (s.provider === 'gemini') return callGeminiUtility(args);
  throw new UtilityUnavailableError();
}

// ---- provider 實作 ----

async function callOpenAICompatible(args, { stream = false } = {}) {
  const { prompt, apiSettings } = args;
  const base = resolveBaseUrl(apiSettings);
  const url = `${base}/chat/completions`;

  // openai-compatible：前綴快取自動；把 systemBlocks 串接為單一 system 字串即可。
  const systemText = systemBlocksToString(prompt && prompt.systemBlocks);
  const messages = [];
  if (systemText) messages.push({ role: 'system', content: systemText });
  for (const m of (prompt && prompt.messages) || []) {
    messages.push({ role: m.role, content: m.content });
  }

  const body = {
    model: apiSettings.model || '',
    messages,
    temperature: clampNumber(apiSettings.temperature, 0, 2, 1),
    max_tokens: clampNumber(apiSettings.maxTokens, 1, 1000000, 1024),
    stream // V1 恆為 false；預留未來 SSE。
  };

  const data = await postJson(url, {
    'Authorization': `Bearer ${apiSettings.apiKey}`,
    'Content-Type': 'application/json'
  }, body);

  const text =
    data && data.choices && data.choices[0] && data.choices[0].message
      ? String(data.choices[0].message.content || '')
      : '';
  const usage = {
    promptTokens: intOr(data && data.usage && data.usage.prompt_tokens, 0),
    completionTokens: intOr(data && data.usage && data.usage.completion_tokens, 0),
    model: (data && data.model) || apiSettings.model || ''
  };

  const parts = parseReplyToParts(text);
  parts.usage = usage;
  return parts;
}

async function callOpenAIUtility(args) {
  const { prompt, apiSettings } = args;
  const base = resolveBaseUrl(apiSettings);
  const data = await postJson(`${base}/chat/completions`, {
    'Authorization': `Bearer ${apiSettings.apiKey}`,
    'Content-Type': 'application/json'
  }, {
    model: apiSettings.model || '',
    messages: [
      { role: 'system', content: systemBlocksToString(prompt.systemBlocks) },
      { role: 'user', content: prompt.messages[0].content }
    ],
    temperature: clampNumber(apiSettings.temperature, 0, 2, 1),
    max_tokens: clampNumber(apiSettings.maxTokens, 1, 1000000, 512),
    stream: false
  });
  return {
    text: data && data.choices && data.choices[0] && data.choices[0].message
      ? String(data.choices[0].message.content || '').trim()
      : '',
    usage: {
      promptTokens: intOr(data && data.usage && data.usage.prompt_tokens, 0),
      completionTokens: intOr(data && data.usage && data.usage.completion_tokens, 0),
      model: (data && data.model) || apiSettings.model || ''
    }
  };
}

async function callAnthropic(args, { stream = false } = {}) {
  const { prompt, apiSettings } = args;
  const base = resolveBaseUrl(apiSettings);
  const url = `${base}/v1/messages`;

  // Anthropic：system 為獨立頂層欄位；messages 只放 user / assistant，且需以 user 開頭。
  const messages = sanitizeAnthropicMessages((prompt && prompt.messages) || []);

  const body = {
    model: apiSettings.model || '',
    // 快取分區（任務五）：system 改為 block 陣列，靜態 block 帶 cache_control 讓穩定
    // 前綴進提示詞快取；動態 block 不帶。可快取前綴最低約 1024 token（Haiku 系列
    // 2048），不足時 API 會自動忽略 cache_control，不會報錯。快取寫入 1.25 倍、
    // 讀取 0.1 倍、TTL 5 分鐘且每次命中會刷新。
    system: buildAnthropicSystem(prompt && prompt.systemBlocks),
    // 對話歷史增量快取：歷史 ≥ 2 則時，在倒數第二則加 cache_control，讓歷史逐輪命中。
    messages: withHistoryCacheBreakpoint(messages),
    // Anthropic temperature 範圍 0–1，超出會 400，這裡夾住。
    temperature: clampNumber(apiSettings.temperature, 0, 1, 1),
    max_tokens: clampNumber(apiSettings.maxTokens, 1, 1000000, 1024),
    stream // V1 恆為 false；預留未來 SSE。
  };

  const data = await postJson(url, {
    'x-api-key': apiSettings.apiKey,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
    // 瀏覽器直連 Anthropic API 必須帶此 header 才能通過 CORS。
    'anthropic-dangerous-direct-browser-access': 'true'
  }, body);

  const text = extractAnthropicText(data);
  const u = (data && data.usage) || {};
  const usage = {
    promptTokens: intOr(u.input_tokens, 0),
    completionTokens: intOr(u.output_tokens, 0),
    model: (data && data.model) || apiSettings.model || ''
  };
  // 快取用量（若存在）：讓使用者看得到省了多少（聊天氣泡以 ⚡ 顯示 cacheRead）。
  if (u.cache_read_input_tokens != null) usage.cacheRead = intOr(u.cache_read_input_tokens, 0);
  if (u.cache_creation_input_tokens != null) usage.cacheWrite = intOr(u.cache_creation_input_tokens, 0);

  const parts = parseReplyToParts(text);
  parts.usage = usage;
  return parts;
}

async function callAnthropicUtility(args) {
  const { prompt, apiSettings } = args;
  const base = resolveBaseUrl(apiSettings);
  const data = await postJson(`${base}/v1/messages`, {
    'x-api-key': apiSettings.apiKey,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
    'anthropic-dangerous-direct-browser-access': 'true'
  }, {
    model: apiSettings.model || '',
    system: systemBlocksToString(prompt.systemBlocks) || ' ',
    messages: sanitizeAnthropicMessages(prompt.messages),
    temperature: clampNumber(apiSettings.temperature, 0, 1, 1),
    max_tokens: clampNumber(apiSettings.maxTokens, 1, 1000000, 512),
    stream: false
  });
  const u = (data && data.usage) || {};
  const usage = {
    promptTokens: intOr(u.input_tokens, 0),
    completionTokens: intOr(u.output_tokens, 0),
    model: (data && data.model) || apiSettings.model || ''
  };
  if (u.cache_read_input_tokens != null) usage.cacheRead = intOr(u.cache_read_input_tokens, 0);
  if (u.cache_creation_input_tokens != null) usage.cacheWrite = intOr(u.cache_creation_input_tokens, 0);
  return { text: extractAnthropicText(data).trim(), usage };
}

// system 分區 → Anthropic block 陣列。靜態 block 帶 cache_control；動態 block 為空則省略。
function buildAnthropicSystem(systemBlocks) {
  const blocks = Array.isArray(systemBlocks) ? systemBlocks : [];
  const staticBlock = blocks[0];
  const dynamicBlock = blocks[1];
  const out = [];
  const staticText = staticBlock && staticBlock.text ? String(staticBlock.text) : '';
  if (staticText) {
    out.push({ type: 'text', text: staticText, cache_control: { type: 'ephemeral' } });
  }
  const dynamicText = dynamicBlock && dynamicBlock.text ? String(dynamicBlock.text) : '';
  if (dynamicText) {
    out.push({ type: 'text', text: dynamicText });
  }
  // 極端情況：兩區皆空，回一個最小 block，避免 system 為空陣列。
  if (out.length === 0) out.push({ type: 'text', text: ' ' });
  return out;
}

// 對話歷史增量快取：若歷史 ≥ 2 則，在倒數第二則訊息的 content 上加 cache_control
// （content 需改為 block 陣列形式），讓越滾越長的歷史逐輪命中快取。回傳新陣列。
function withHistoryCacheBreakpoint(messages) {
  const list = Array.isArray(messages) ? messages.slice() : [];
  if (list.length < 2) return list;
  const idx = list.length - 2;
  const m = list[idx];
  list[idx] = {
    role: m.role,
    content: [{ type: 'text', text: String(m.content || ''), cache_control: { type: 'ephemeral' } }]
  };
  return list;
}

async function callGemini(args, { stream = false } = {}) {
  const { prompt, apiSettings } = args;
  const base = resolveBaseUrl(apiSettings);
  // 注意：金鑰只透過 x-goog-api-key header 傳遞，不放進 URL query（資安要求）。
  const url = `${base}/v1beta/models/${encodeURIComponent(apiSettings.model || '')}:generateContent`;

  // Gemini：system 為獨立的 systemInstruction；對話放 contents，role 為 user / model。
  const contents = geminiContents((prompt && prompt.messages) || []);

  const body = {
    contents,
    generationConfig: {
      temperature: clampNumber(apiSettings.temperature, 0, 2, 1),
      maxOutputTokens: clampNumber(apiSettings.maxTokens, 1, 1000000, 1024)
    }
  };
  // gemini：前綴快取自動；把 systemBlocks 串接為單一 systemInstruction 即可。
  const systemText = systemBlocksToString(prompt && prompt.systemBlocks);
  if (systemText) {
    body.systemInstruction = { parts: [{ text: systemText }] };
  }

  const data = await postJson(url, {
    'x-goog-api-key': apiSettings.apiKey,
    'Content-Type': 'application/json'
  }, body);

  const text = extractGeminiText(data);
  const usage = {
    promptTokens: intOr(data && data.usageMetadata && data.usageMetadata.promptTokenCount, 0),
    completionTokens: intOr(data && data.usageMetadata && data.usageMetadata.candidatesTokenCount, 0),
    model: (data && data.modelVersion) || apiSettings.model || ''
  };

  const parts = parseReplyToParts(text);
  parts.usage = usage;
  return parts;
}

async function callGeminiUtility(args) {
  const { prompt, apiSettings } = args;
  const base = resolveBaseUrl(apiSettings);
  const data = await postJson(
    `${base}/v1beta/models/${encodeURIComponent(apiSettings.model || '')}:generateContent`,
    {
      'x-goog-api-key': apiSettings.apiKey,
      'Content-Type': 'application/json'
    },
    {
      contents: [{ role: 'user', parts: [{ text: prompt.messages[0].content }] }],
      systemInstruction: { parts: [{ text: systemBlocksToString(prompt.systemBlocks) || ' ' }] },
      generationConfig: {
        temperature: clampNumber(apiSettings.temperature, 0, 2, 1),
        maxOutputTokens: clampNumber(apiSettings.maxTokens, 1, 1000000, 512)
      }
    }
  );
  return {
    text: extractGeminiText(data).trim(),
    usage: {
      promptTokens: intOr(data && data.usageMetadata && data.usageMetadata.promptTokenCount, 0),
      completionTokens: intOr(data && data.usageMetadata && data.usageMetadata.candidatesTokenCount, 0),
      model: (data && data.modelVersion) || apiSettings.model || ''
    }
  };
}

// Gemini 回覆：candidates[0].content.parts[].text 串接。
function extractGeminiText(data) {
  const cand = data && Array.isArray(data.candidates) ? data.candidates[0] : null;
  const parts = cand && cand.content && Array.isArray(cand.content.parts) ? cand.content.parts : [];
  return parts
    .filter((p) => p && typeof p.text === 'string')
    .map((p) => p.text)
    .join('\n');
}

// Gemini 的 contents：role 為 user / model（assistant→model）；合併連續同 role、丟棄開頭 model。
function geminiContents(list) {
  const cleaned = [];
  for (const m of list) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) continue;
    const content = (m.content == null ? '' : String(m.content)).trim();
    if (!content) continue;
    const role = m.role === 'assistant' ? 'model' : 'user';
    const last = cleaned[cleaned.length - 1];
    if (last && last.role === role) {
      last.parts[0].text += '\n' + content;
    } else {
      cleaned.push({ role, parts: [{ text: content }] });
    }
  }
  while (cleaned.length && cleaned[0].role === 'model') cleaned.shift();
  if (!cleaned.length) cleaned.push({ role: 'user', parts: [{ text: '（開始對話）' }] });
  return cleaned;
}

// Anthropic 回覆的 content 是 block 陣列；取出所有 text block 串接。
function extractAnthropicText(data) {
  if (!data || !Array.isArray(data.content)) return '';
  return data.content
    .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n');
}

// Anthropic 要求 messages 以 user 開頭、內容非空；合併連續同 role，並丟棄開頭的 assistant。
function sanitizeAnthropicMessages(list) {
  const cleaned = [];
  for (const m of list) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) continue;
    const content = (m.content == null ? '' : String(m.content)).trim();
    if (!content) continue;
    const last = cleaned[cleaned.length - 1];
    if (last && last.role === m.role) {
      last.content += '\n' + content; // 合併連續同 role。
    } else {
      cleaned.push({ role: m.role, content });
    }
  }
  // 丟棄開頭的 assistant（Anthropic 需以 user 開頭）。
  while (cleaned.length && cleaned[0].role === 'assistant') cleaned.shift();
  // 極端情況：全空 → 塞一則最小 user 訊息，避免 400。
  if (!cleaned.length) cleaned.push({ role: 'user', content: '（開始對話）' });
  return cleaned;
}

// ---- 共用 fetch（帶逾時與錯誤分類）----

async function postJson(url, headers, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (err) {
    clearTimeout(timer);
    if (err && err.name === 'AbortError') {
      throw new ApiError('連線逾時', { status: 0 });
    }
    // fetch 本身 reject 多半是網路 / CORS 問題。
    throw new ApiError('無法連線，請檢查網路或 baseUrl', { status: 0 });
  }
  clearTimeout(timer);

  if (!res.ok) {
    throw await toApiError(res);
  }

  try {
    return await res.json();
  } catch (e) {
    throw new ApiError('回應解析失敗（非有效 JSON）', { status: res.status });
  }
}

// 依 HTTP 狀態與 API 回傳的錯誤訊息組出可讀錯誤。
async function toApiError(res) {
  const status = res.status;
  const summary = await readErrorSummary(res);

  if (status === 401 || status === 403) {
    return new ApiError('API 金鑰無效或無權限', { status, detail: summary });
  }
  if (status === 429) {
    return new ApiError('請求過於頻繁，請稍後再試', { status, detail: summary });
  }
  const tail = summary ? `：${summary}` : '';
  return new ApiError(`請求失敗（HTTP ${status}）${tail}`, { status, detail: summary });
}

// 從錯誤回應中萃取簡短、安全的訊息摘要（不含金鑰；金鑰本就不在 body 內）。
async function readErrorSummary(res) {
  let raw = '';
  try {
    raw = await res.text();
  } catch (e) {
    return '';
  }
  if (!raw) return '';
  let msg = '';
  try {
    const data = JSON.parse(raw);
    msg =
      (data && data.error && (data.error.message || data.error.type)) ||
      (data && data.message) ||
      '';
  } catch (e) {
    msg = raw;
  }
  msg = String(msg).replace(/\s+/g, ' ').trim();
  if (msg.length > 200) msg = msg.slice(0, 200) + '…';
  return msg;
}

function intOr(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

// ---- 回覆解析 ----
//
// parseReplyToParts(text): 把模型回覆文字解析為 MessagePart[]。
//   - 以段落切分（連續換行）
//   - 被 ＊…＊（全形）或 *…*（半形）完整包裹的段落 → { type: "narration" }
//   - 其他段落 → { type: "message" }
//   - 連續的 message 段落合併為同一個 part（以換行相連），narration 各自獨立
//   - 寬容：任何無法辨識的內容一律當作 message part，絕不丟棄任何文字；
//     整段都解析不出來時，回傳單一 message part。
//
// 放在獨立、無副作用的函式以便測試。
export function parseReplyToParts(text) {
  const raw = text == null ? '' : String(text);
  const trimmedAll = raw.trim();
  if (!trimmedAll) {
    return [{ type: 'message', content: '……' }];
  }

  // 以「一個以上的空白行」切段。
  const blocks = trimmedAll
    .split(/\n\s*\n+/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);

  const source = blocks.length ? blocks : [trimmedAll];
  const parts = [];

  for (const block of source) {
    const narration = matchNarration(block);
    if (narration != null) {
      parts.push({ type: 'narration', content: narration });
    } else {
      const last = parts[parts.length - 1];
      if (last && last.type === 'message') {
        last.content += '\n' + block; // 合併連續 message 段落。
      } else {
        parts.push({ type: 'message', content: block });
      }
    }
  }

  // 保底：若因某種原因沒有任何 part，回傳單一 message part（絕不丟棄文字）。
  if (!parts.length) {
    return [{ type: 'message', content: trimmedAll }];
  }
  return parts;
}

// 若整段被全形 ＊…＊ 或半形 *…* 完整包裹，回傳去掉星號後的內容；否則回傳 null。
function matchNarration(block) {
  const m = /^([＊*])([\s\S]+)\1$/.exec(block);
  if (!m) return null;
  const inner = m[2].trim();
  if (!inner) return null; // 只有一對星號、內容為空 → 不當旁白。
  return inner;
}

// ---- 測試連線 ----
//
// 送出一個最小請求驗證 provider / model / baseUrl / apiKey 是否可用。
// 成功回傳 { ok: true, model }；失敗丟出 ApiError。
export async function testConnection(apiSettings) {
  const s = apiSettings || {};
  if (!s.provider) {
    throw new ApiError('尚未選擇 provider', { status: 0 });
  }
  if (!s.apiKey || !String(s.apiKey).trim()) {
    throw new ApiError('尚未輸入 API 金鑰', { status: 0 });
  }
  if (!s.model || !String(s.model).trim()) {
    throw new ApiError('尚未輸入 model 名稱', { status: 0 });
  }

  const base = resolveBaseUrl(s);

  if (s.provider === 'anthropic') {
    const data = await postJson(`${base}/v1/messages`, {
      'x-api-key': s.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true'
    }, {
      model: s.model,
      max_tokens: 1,
      messages: [{ role: 'user', content: 'ping' }]
    });
    return { ok: true, model: (data && data.model) || s.model };
  }

  if (s.provider === 'openai-compatible') {
    const data = await postJson(`${base}/chat/completions`, {
      'Authorization': `Bearer ${s.apiKey}`,
      'Content-Type': 'application/json'
    }, {
      model: s.model,
      max_tokens: 1,
      messages: [{ role: 'user', content: 'ping' }]
    });
    return { ok: true, model: (data && data.model) || s.model };
  }

  if (s.provider === 'gemini') {
    const data = await postJson(
      `${base}/v1beta/models/${encodeURIComponent(s.model)}:generateContent`,
      {
        'x-goog-api-key': s.apiKey,
        'Content-Type': 'application/json'
      },
      {
        contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
        generationConfig: { maxOutputTokens: 1 }
      }
    );
    return { ok: true, model: (data && data.modelVersion) || s.model };
  }

  throw new ApiError('不支援的 provider', { status: 0 });
}

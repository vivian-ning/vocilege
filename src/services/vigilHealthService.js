// src/services/vigilHealthService.js
//
// 駐守健康感知的本機設定與快取。
// 設定只存在 localStorage，不進 state / IndexedDB / 備份；buildPrompt 只讀呼叫端
// 傳入的快照，這裡負責背景 I/O 與 stale-while-revalidate。

const URL_KEY = 'vigilHealthUrl';
const TOKEN_KEY = 'vigilHealthToken';
const REFRESH_INTERVAL_MS = 15 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 3000;

let cachedSnapshot = null;
let lastRefreshAt = 0;
let inFlight = null;

export function getVigilHealthSettings() {
  return {
    url: (localStorage.getItem(URL_KEY) || '').trim(),
    token: (localStorage.getItem(TOKEN_KEY) || '').trim()
  };
}

export function saveVigilHealthSettings({ url = '', token = '' } = {}) {
  const cleanUrl = String(url || '').trim();
  const cleanToken = String(token || '').trim();
  if (cleanUrl) localStorage.setItem(URL_KEY, cleanUrl);
  else localStorage.removeItem(URL_KEY);
  if (cleanToken) localStorage.setItem(TOKEN_KEY, cleanToken);
  else localStorage.removeItem(TOKEN_KEY);
  if (!cleanUrl || !cleanToken) cachedSnapshot = null;
}

export function isVigilHealthConfigured() {
  const settings = getVigilHealthSettings();
  return !!(settings.url && settings.token);
}

export function getCachedHealthSnapshot() {
  return cachedSnapshot;
}

export function refreshHealthSnapshot({ force = false } = {}) {
  if (!isVigilHealthConfigured()) {
    cachedSnapshot = null;
    return Promise.resolve(null);
  }
  const now = Date.now();
  if (!force && lastRefreshAt && now - lastRefreshAt < REFRESH_INTERVAL_MS) {
    return Promise.resolve(cachedSnapshot);
  }
  if (inFlight) return inFlight;
  lastRefreshAt = now;
  inFlight = fetchLatestHealth()
    .then((entry) => {
      cachedSnapshot = entry;
      return cachedSnapshot;
    })
    .catch(() => cachedSnapshot)
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

export async function testVigilHealthConnection({ url, token } = {}) {
  const entry = await fetchLatestHealth({
    url: String(url || '').trim(),
    token: String(token || '').trim()
  });
  cachedSnapshot = entry;
  lastRefreshAt = Date.now();
  return { ok: true, entry };
}

async function fetchLatestHealth(override = null) {
  const settings = override || getVigilHealthSettings();
  if (!settings.url || !settings.token) {
    throw new Error('請先填寫駐守健康網址與通行碼');
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(latestUrl(settings.url), {
      method: 'GET',
      headers: { 'X-Vigil-Token': settings.token },
      signal: controller.signal
    });
  } catch (err) {
    if (err && err.name === 'AbortError') throw new Error('連線逾時');
    throw new Error('無法連線，請確認駐守正在執行且網址正確');
  } finally {
    window.clearTimeout(timer);
  }

  let data = null;
  try {
    data = await res.json();
  } catch (err) {
    throw new Error('回應不是有效 JSON');
  }
  if (!res.ok || !data || data.ok !== true) {
    if (res.status === 403) throw new Error('通行碼錯誤或未填');
    throw new Error(`連線失敗（HTTP ${res.status}）`);
  }
  return normalizeSnapshot(data.entry);
}

function latestUrl(rawUrl) {
  const base = String(rawUrl || '').trim().replace(/\/+$/, '');
  if (!base) return '';
  return base.endsWith('/health/latest') ? base : `${base}/health/latest`;
}

function normalizeSnapshot(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const out = {};
  for (const field of ['sleepHours', 'restingHeartRate', 'heartRateAvg', 'hrv', 'steps']) {
    const value = Number(entry[field]);
    if (Number.isFinite(value)) out[field] = value;
  }
  if (typeof entry.receivedAt === 'string' && entry.receivedAt.trim()) {
    out.receivedAt = entry.receivedAt.trim();
  }
  return Object.keys(out).length ? out : null;
}

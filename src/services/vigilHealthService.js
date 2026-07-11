// src/services/vigilHealthService.js
//
// 駐守健康感知的本機設定與快取。
// 設定只存在 localStorage，不進 state / IndexedDB / 備份；buildPrompt 只讀呼叫端
// 傳入的快照，這裡負責背景 I/O 與 stale-while-revalidate。

const URL_KEY = 'vigilHealthUrl';
const TOKEN_KEY = 'vigilHealthToken';
const REFRESH_INTERVAL_MS = 15 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 3000;
const SUBSCRIBE_TIMEOUT_MS = 5000;

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

export async function fetchVigilVapidKey(settings = getVigilHealthSettings()) {
  const clean = normalizeConfiguredSettings(settings);
  const data = await fetchVigilJson(vigilEndpointUrl(clean.url, '/vapid-key'), {
    method: 'GET',
    headers: { 'X-Vigil-Token': clean.token },
    timeoutMs: REQUEST_TIMEOUT_MS
  });
  if (!data || data.ok !== true || typeof data.vapidPublicKey !== 'string' || !data.vapidPublicKey.trim()) {
    throw new Error('駐守沒有回傳可用公鑰');
  }
  return data.vapidPublicKey.trim();
}

export async function sendVigilPushSubscription(subscription, settings = getVigilHealthSettings()) {
  const clean = normalizeConfiguredSettings(settings);
  const data = await fetchVigilJson(vigilEndpointUrl(clean.url, '/subscribe'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Vigil-Token': clean.token
    },
    body: JSON.stringify(subscription),
    timeoutMs: SUBSCRIBE_TIMEOUT_MS
  });
  if (!data || data.ok !== true) {
    throw new Error('駐守沒有收下訂閱');
  }
  return data;
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
  const data = await fetchVigilJson(latestUrl(settings.url), {
    method: 'GET',
    headers: { 'X-Vigil-Token': settings.token },
    timeoutMs: REQUEST_TIMEOUT_MS
  });
  if (!data || data.ok !== true) {
    throw new Error('連線失敗');
  }
  return normalizeSnapshot(data.entry);
}

async function fetchVigilJson(url, { method = 'GET', headers = {}, body = null, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  if (typeof Worker !== 'undefined' && window.URL && window.Blob) {
    return fetchVigilJsonInWorker(url, { method, headers, body, timeoutMs });
  }
  return fetchVigilJsonOnMainThread(url, { method, headers, body, timeoutMs });
}

function fetchVigilJsonInWorker(url, { method = 'GET', headers = {}, body = null, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const workerCode = `
      self.onmessage = async (event) => {
        const payload = event.data || {};
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), payload.timeoutMs || 3000);
        try {
          const res = await fetch(payload.url, {
            method: payload.method || 'GET',
            headers: payload.headers || {},
            body: payload.body || null,
            signal: controller.signal
          });
          let data = null;
          let jsonOk = true;
          try {
            data = await res.json();
          } catch (_) {
            jsonOk = false;
          }
          self.postMessage({ ok: true, status: res.status, resOk: res.ok, jsonOk, data });
        } catch (err) {
          self.postMessage({ ok: false, name: err && err.name ? err.name : '', message: err && err.message ? err.message : '' });
        } finally {
          clearTimeout(timer);
        }
      };
    `;
    const blobUrl = URL.createObjectURL(new Blob([workerCode], { type: 'text/javascript' }));
    const worker = new Worker(blobUrl);
    const finish = () => {
      worker.terminate();
      URL.revokeObjectURL(blobUrl);
    };
    const timer = window.setTimeout(() => {
      finish();
      reject(new Error('連線逾時'));
    }, timeoutMs + 500);
    worker.onmessage = (event) => {
      window.clearTimeout(timer);
      finish();
      const result = event.data || {};
      if (!result.ok) {
        if (result.name === 'AbortError') reject(new Error('連線逾時'));
        else reject(new Error('無法連線，請確認駐守正在執行且網址正確'));
        return;
      }
      try {
        resolve(normalizeVigilJsonResponse(result.status, result.resOk, result.jsonOk, result.data));
      } catch (err) {
        reject(err);
      }
    };
    worker.onerror = () => {
      window.clearTimeout(timer);
      finish();
      reject(new Error('無法連線，請確認駐守正在執行且網址正確'));
    };
    worker.postMessage({ url, method, headers, body, timeoutMs });
  });
}

async function fetchVigilJsonOnMainThread(url, { method = 'GET', headers = {}, body = null, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body,
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
  return normalizeVigilJsonResponse(res.status, res.ok, true, data);
}

function normalizeVigilJsonResponse(status, resOk, jsonOk, data) {
  if (!jsonOk) throw new Error('回應不是有效 JSON');
  if (!resOk) {
    if (status === 403) throw new Error('通行碼錯誤或未填');
    throw new Error(`連線失敗（HTTP ${status}）`);
  }
  return data;
}

function normalizeConfiguredSettings(settings) {
  const clean = {
    url: String(settings && settings.url || '').trim(),
    token: String(settings && settings.token || '').trim()
  };
  if (!clean.url || !clean.token) throw new Error('請先填寫駐守健康網址與通行碼');
  return clean;
}

function vigilEndpointUrl(rawUrl, path) {
  const base = String(rawUrl || '').trim().replace(/\/+$/, '');
  return `${base}${path}`;
}

function latestUrl(rawUrl) {
  const base = String(rawUrl || '').trim().replace(/\/+$/, '');
  if (!base) return '';
  return base.endsWith('/health/latest') ? base : `${base}/health/latest`;
}

function normalizeSnapshot(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const out = {};
  for (const field of ['sleepHours', 'restingHeartRate', 'heartRateAvg', 'heartRate', 'hrv', 'steps']) {
    const value = Number(entry[field]);
    if (Number.isFinite(value)) out[field] = value;
  }
  if (typeof entry.receivedAt === 'string' && entry.receivedAt.trim()) {
    out.receivedAt = entry.receivedAt.trim();
  }
  return Object.keys(out).length ? out : null;
}

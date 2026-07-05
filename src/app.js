// src/app.js
//
// 應用進入點：載入 config → 初始化 DB → 初始化 store → 掛載三欄骨架 →
// 註冊唯一的 render 訂閱者 → 首次渲染。
//
// 所有資源一律使用相對路徑（第一節），因為 GitHub Pages 部署在
// username.github.io/repo/ 子路徑下，絕對路徑會失效。

import { initDB } from './db/indexeddb.js';
import { initStore, subscribe, getState, markAppOpened, maybeCreateGreeting, maybeAutoFeedPost } from './state/store.js';
import { mountLayout, render, setAppName } from './ui/render.js';
import { onRouteChange, ensureRoute } from './ui/router.js';

async function loadConfig() {
  // 相對路徑：相對於 index.html 所在位置。
  const res = await fetch('./data/config.json');
  if (!res.ok) {
    throw new Error('無法載入 data/config.json（請確認以 http 伺服器開啟，而非 file://）');
  }
  return res.json();
}

async function boot() {
  const root = document.getElementById('app');

  try {
    const config = await loadConfig();
    setAppName(config.appName, config.appNameLatin);
    // 分頁標題：中文名 + 拉丁名（例如「拾聲 Vocilège」）。
    document.title = [config.appName, config.appNameLatin]
      .filter(Boolean)
      .join(' ') || 'Vocilège';

    await initDB();
    const state = await initStore(config);
    await maybeCreateGreeting();
    maybeAutoFeedPost().catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('迴聲自動發文檢查失敗', err);
    });
    window.setInterval(() => {
      maybeAutoFeedPost().catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('迴聲自動發文檢查失敗', err);
      });
    }, 15 * 60 * 1000);
    await markAppOpened();

    // 掛載外層骨架（頂部導航 + 內容容器），之後每次 render 只更新內容。
    mountLayout(root, state);

    // 註冊唯一的資料訂閱者：任何 action 完成後由 store 統一通知重繪。
    subscribe((s) => render(s));

    // 路由變更（hashchange）也觸發重繪。
    onRouteChange(() => render(getState()));

    // 應用啟動預設落在 #/home（未知 / 空 hash 也導向此處）。
    // 若 ensureRoute 調整了 hash，會觸發一次 hashchange → render；此處仍先渲染一次。
    ensureRoute();

    // 首次渲染。
    render(getState());
    registerServiceWorker();
  } catch (err) {
    root.textContent = '';
    const box = document.createElement('div');
    box.className = 'boot-error';
    const h = document.createElement('h2');
    h.textContent = '啟動失敗';
    const p = document.createElement('p');
    p.textContent = err && err.message ? err.message : String(err);
    const hint = document.createElement('p');
    hint.textContent = '提示：請勿直接以 file:// 雙擊 index.html。請於專案目錄執行 python -m http.server 8000 後，開啟 http://localhost:8000';
    box.appendChild(h);
    box.appendChild(p);
    box.appendChild(hint);
    root.appendChild(box);
    // eslint-disable-next-line no-console
    console.error(err);
  }
}

boot();

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return;

  navigator.serviceWorker.register('./sw.js')
    .then((registration) => {
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateToast(worker);
          }
        });
      });
    })
    .catch(() => {
      // PWA support must never block the local-first app.
    });
}

function showUpdateToast(worker) {
  const root = document.getElementById('app') || document.body;
  const bar = document.createElement('button');
  bar.type = 'button';
  bar.className = 'app-update-toast';
  bar.textContent = '有新版本，點擊重新整理';
  bar.addEventListener('click', () => {
    worker.postMessage({ type: 'SKIP_WAITING' });
    window.location.reload();
  });
  root.appendChild(bar);
}

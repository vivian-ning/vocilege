// src/ui/router.js
//
// 自寫極簡 hash router（無套件，V2 任務一）。
//
// 路由：
//   #/home                    首頁主控台
//   #/chat/:conversationId     聊天頁（三欄式）
//   #/settings                設定頁（API 設定 / Prompt 存放區 / 資料）
//   未知路由或空 hash          → 導向 #/home
//
// UI 狀態（目前路由）不進入全域 state；由 location.hash 為單一真相來源。

// 解析目前 hash → { name, params }。
export function getRoute() {
  const hash = location.hash || '';
  const clean = hash.replace(/^#/, '');
  const parts = clean.split('/').filter((p) => p.length > 0); // ['chat','id']

  if (parts[0] === 'home') return { name: 'home', params: {} };
  if (parts[0] === 'settings') return { name: 'settings', params: {} };
  if (parts[0] === 'chat') {
    return { name: 'chat', params: { conversationId: parts[1] ? decodeURIComponent(parts[1]) : '' } };
  }
  // 未知 / 空 → 首頁。
  return { name: 'home', params: {} };
}

// 導向指定路徑（例如 '/home'、`/chat/${id}`）。設定 hash 會觸發 hashchange → 重繪。
export function navigate(path) {
  const target = '#' + path;
  if (location.hash === target) return; // 相同路由不重複觸發。
  location.hash = target;
}

// 註冊路由變更監聽（hashchange）。回傳解除註冊函式。
export function onRouteChange(cb) {
  const handler = () => cb(getRoute());
  window.addEventListener('hashchange', handler);
  return () => window.removeEventListener('hashchange', handler);
}

// 啟動時若 hash 為空或不合法，導向 #/home（應用預設落點）。
export function ensureRoute() {
  const hash = location.hash || '';
  if (!/^#\/(home|chat|settings)(\/|$)/.test(hash)) {
    location.hash = '#/home';
    return true; // 有調整（會觸發一次 hashchange）
  }
  return false;
}

// src/services/updateService.js
//
// 強制更新只清 service worker 與 HTTP cache；絕不碰 IndexedDB。

export async function forceRefreshApp() {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }
  window.location.reload();
}

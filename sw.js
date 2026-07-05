const CACHE_VERSION = 'vocilege-v6-20260705-1';
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './data/config.json',
  './manifest.webmanifest',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
  './src/app.js',
  './src/db/indexeddb.js',
  './src/services/aiService.js',
  './src/services/assetService.js',
  './src/services/backupService.js',
  './src/services/mockAIService.js',
  './src/services/promptBuilder.js',
  './src/services/statsService.js',
  './src/state/migrations.js',
  './src/state/schema.js',
  './src/state/store.js',
  './src/ui/avatar.js',
  './src/ui/avatarInput.js',
  './src/ui/icons.js',
  './src/ui/render.js',
  './src/ui/router.js',
  './src/ui/toggle.js',
  './src/ui/wave.js',
  './src/ui/components/apiSettingsEditor.js',
  './src/ui/components/backupPanel.js',
  './src/ui/components/characterEditor.js',
  './src/ui/components/characterPage.js',
  './src/ui/components/chatView.js',
  './src/ui/components/conversationList.js',
  './src/ui/components/feedView.js',
  './src/ui/components/globalPromptsEditor.js',
  './src/ui/components/homeView.js',
  './src/ui/components/messageRenderer.js',
  './src/ui/components/playerEditor.js',
  './src/ui/components/settingsPage.js',
  './src/utils/id.js',
  './src/utils/time.js',
  './src/utils/validation.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key !== CACHE_VERSION)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match('./index.html')))
  );
});

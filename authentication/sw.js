// Notin minimal PWA service worker — static shell only.
// Authenticated API responses are deliberately NEVER stored in Cache Storage;
// per-user note snapshots live in IndexedDB and are managed by app.js.
const CACHE_NAME = 'notin-shell-v10';
const SHELL_PATHS = [
  '/app.html',
  '/app.bundle.js',
  '/app.css',
  '/styles.css',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/share.html',
  '/share.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_PATHS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('notin-shell-') && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache API/auth traffic, especially Bearer-authenticated note JSON.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return;

  const shellPath = url.pathname === '/app.html' || url.pathname === '/share.html'
    ? url.pathname
    : SHELL_PATHS.includes(url.pathname) ? url.pathname : null;
  if (!shellPath) return;

  event.respondWith(
    caches.match(shellPath).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(shellPath, copy));
      }
      return response;
    })),
  );
});

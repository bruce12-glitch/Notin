// Notin minimal PWA service worker — static shell only.
// Authenticated API responses are deliberately NEVER stored in Cache Storage;
// per-user note snapshots live in IndexedDB and are managed by app.js.
//
// WP-AUDIT-L10 — caching strategy (was cache-first for everything, so updated
// app.html/app.bundle.js went stale until a manual CACHE_NAME bump):
//   • navigations / HTML  → network-first (fresh deploys win; cache = offline fallback)
//   • static assets        → stale-while-revalidate (instant paint, refreshed in background)
// CACHE RULE: still bump CACHE_NAME on every app.html/app.bundle.js change —
// network-first protects online users, but offline users keep the old shell
// until the cache identity changes.
const CACHE_NAME = 'notin-shell-v23';
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

  const isHtml = request.mode === 'navigate' || url.pathname.endsWith('.html');
  const shellPath = url.pathname === '/app.html' || url.pathname === '/share.html'
    ? url.pathname
    : SHELL_PATHS.includes(url.pathname) ? url.pathname : null;
  if (!shellPath) return;

  if (isHtml) {
    // Network-first: a fresh deploy must reach the client immediately; the
    // cache is only the offline read-only fallback.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(shellPath, copy));
          }
          return response;
        })
        .catch(() => caches.match(shellPath)),
    );
    return;
  }

  // Stale-while-revalidate for static shell assets (css/js/icons/manifest).
  event.respondWith(
    caches.match(shellPath).then((cached) => {
      const refreshed = fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(shellPath, copy));
        }
        return response;
      }).catch(() => cached);
      return cached || refreshed;
    }),
  );
});

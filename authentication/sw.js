// Notin minimal PWA service worker â€” static shell only.
// Authenticated API responses are deliberately NEVER stored in Cache Storage;
// per-user note snapshots live in IndexedDB and are managed by app.js.
//
// WP-AUDIT-L10 â€” caching strategy (was cache-first for everything, so updated
// app.html/app.bundle.js went stale until a manual CACHE_NAME bump):
//   â€¢ navigations / HTML  â†’ network-first (fresh deploys win; cache = offline fallback)
//   â€¢ static assets        â†’ stale-while-revalidate (instant paint, refreshed in background)
// CACHE RULE: still bump CACHE_NAME on every app.html/app.bundle.js change â€”
// network-first protects online users, but offline users keep the old shell
// until the cache identity changes.
const CACHE_NAME = 'notin-shell-v24';
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

// WP-REM-002 â€” Web Push: display reminder notifications and deep-link back to the app.
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'Notin reminder', body: event.data ? event.data.text() : '' };
  }
  const title = payload.title || 'Notin reminder';
  const body = payload.body || 'A note you asked about is due.';
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: payload.reminderId ? `reminder-${payload.reminderId}` : 'notin-reminder',
      data: { url: payload.url || '/app.html#reminders' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/app.html#reminders';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});

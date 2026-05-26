const CACHE = 'ctg-pwa-v1';
const PRECACHE = ['/manifest.webmanifest', '/favicon.png', '/apple-touch-icon.png', '/pwa-192x192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Skip non-GET and API/auth requests
  if (e.request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/') || url.hostname.includes('supabase')) return;

  // Cache-first for static assets (/assets/*)
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        });
      })
    );
    return;
  }

  // Network-first for HTML pages (SSR)
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});

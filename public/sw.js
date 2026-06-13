const CACHE = 'ctg-pwa-v3';
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

  if (e.request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/') || url.hostname.includes('supabase')) return;

  // Network-first for everything — prevents stale JS chunks after new deployments
  e.respondWith(
    fetch(e.request).then(res => res).catch(() => caches.match(e.request))
  );
});

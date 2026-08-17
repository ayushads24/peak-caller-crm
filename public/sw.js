const CACHE = 'ctg-pwa-v6';
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

// Background push notification
self.addEventListener('push', (e) => {
  let data = { title: 'CRM Alert', body: '' };
  try { data = e.data.json(); } catch {}
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/pwa-192x192.png',
      badge: '/favicon.png',
      tag: data.tag || 'ctg-push',
      renotify: true,
      requireInteraction: true,
      vibrate: [200, 100, 200, 100, 200],
    })
  );
});

// Tapping notification opens the app
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const appClient = clients.find(c => c.url.includes(self.location.origin));
      if (appClient) return appClient.focus();
      return self.clients.openWindow('/leads');
    })
  );
});

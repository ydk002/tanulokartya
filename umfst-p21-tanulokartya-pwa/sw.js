// sw.js – Service Worker a teljes offline (repülő módú) működéshez

const CACHE_NEV = 'umfst-tanulokartya-pwa-v1';

const PRECACHED_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './src/sm2.js',
  './src/db.js',
  './src/ui/app.js',
  './src/ui/study.js',
  './src/ui/decks.js',
  './src/ui/stats.js',
  './src/ui/io.js',
  './src/ui/toast.js',
  './samples/anatomia.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NEV)
      .then((cache) => cache.addAll(PRECACHED_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NEV)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NEV).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Offline navigációs fallback az index.html-re
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return new Response('Offline – az erőforrás nem érhető el a gyorsítótárban.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        });
    })
  );
});

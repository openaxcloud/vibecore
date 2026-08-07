export const PWA_SERVICE_WORKER_CACHE_NAME = 'vibecore-shell-v3';

export const pwaServiceWorkerScript = String.raw`
const CACHE_NAME = '${PWA_SERVICE_WORKER_CACHE_NAME}';
const OFFLINE_URL = '/offline.html';
const SHELL_ASSETS = [
  '/manifest.webmanifest',
  '/manifest.fr.webmanifest',
  '/favicon.svg',
  '/apple-touch-icon.png',
  OFFLINE_URL,
  '/offline-messages.js',
  '/offline-i18n.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' }).catch(async () => {
        const offline = await caches.match(OFFLINE_URL);

        return offline || Response.error();
      }),
    );
    return;
  }

  if (!SHELL_ASSETS.includes(url.pathname)) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      return cached || fetch(request, { cache: 'no-store' }).catch(() => Response.error());
    }),
  );
});
`.trimStart();

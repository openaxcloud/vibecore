export const PWA_SERVICE_WORKER_CACHE_NAME = 'vibecore-shell-v2';

export const pwaServiceWorkerScript =
  String.raw`
const CACHE_NAME = '${PWA_SERVICE_WORKER_CACHE_NAME}';
const SHELL_ASSETS = ['/manifest.webmanifest', '/favicon.svg', '/apple-touch-icon.png'];
const OFFLINE_HTML = ` +
  '`' +
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>E-Code offline</title>
  </head>
  <body>
    <main style="font-family: system-ui, sans-serif; padding: 2rem; line-height: 1.5">
      <h1>Connection interrupted</h1>
      <p>E-Code could not reach the network. Reload when the connection is available.</p>
    </main>
  </body>
</html>` +
  '`' +
  `;

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
      fetch(request, { cache: 'no-store' }).catch(
        () =>
          new Response(OFFLINE_HTML, {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
          }),
      ),
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

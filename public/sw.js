const CACHE_NAME = 'vibecore-shell-v1';
const SHELL_ASSETS = ['/manifest.webmanifest', '/favicon.svg', '/apple-touch-icon.png'];
const OFFLINE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>VibeCore offline</title>
  </head>
  <body>
    <main style="font-family: system-ui, sans-serif; padding: 2rem; line-height: 1.5">
      <h1>Connection interrupted</h1>
      <p>The local VibeCore server did not respond. Restart the dev server or reload when it is available.</p>
    </main>
  </body>
</html>`;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
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
      fetch(request).catch(async () => {
        const cachedRequest = await caches.match(request);
        const cachedDashboard = await caches.match('/dashboard');

        return (
          cachedRequest ||
          cachedDashboard ||
          new Response(OFFLINE_HTML, {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'content-type': 'text/html; charset=utf-8' },
          })
        );
      }),
    );
    return;
  }

  if (!SHELL_ASSETS.includes(url.pathname)) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      return cached || fetch(request).catch(() => Response.error());
    }),
  );
});

// Service Worker for E-Code Platform
// Enhanced with better offline sync capabilities

const CACHE_VERSION = 3;
const STATIC_CACHE_NAME = `ecode-static-v${CACHE_VERSION}`;
const DYNAMIC_CACHE_NAME = `ecode-dynamic-v${CACHE_VERSION}`;
const API_CACHE_NAME = `ecode-api-v${CACHE_VERSION}`;
const OFFLINE_URL = '/offline.html';
const SYNC_TAG = 'sync-failed-requests';
const FAILED_REQUESTS_STORE = 'failed-requests';

const ALL_CACHES = [STATIC_CACHE_NAME, DYNAMIC_CACHE_NAME, API_CACHE_NAME];

const STATIC_CACHE_URLS = [
  '/',
  '/index.html',
  '/offline.html',
  '/favicon.svg',
  '/assets/logo.svg',
  '/manifest.json',
];

const CACHE_STRATEGIES = {
  networkFirst: ['/api/'],
  cacheFirst: [
    '/assets/',
    '/images/',
    '/fonts/',
    '/icons/',
    '/partners/',
    '.svg',
    '.png',
    '.jpg',
    '.jpeg',
    '.webp',
    '.woff',
    '.woff2',
    '.ttf',
    '.ico',
  ],
  networkOnly: [
    '/api/monitoring/',
    '/api/realtime/',
    '/api/auth/logout',
    '/ws',
    'socket.io',
  ],
  staleWhileRevalidate: ['.js', '.css', '.json'],
};

const CACHE_LIMITS = {
  maxAgeSeconds: 60 * 60 * 24 * 30,
  maxEntries: 500,
  maxApiCacheAge: 60 * 5,
  maxApiEntries: 100,
};

self.addEventListener('install', (event) => {
  console.log(`[ServiceWorker] Installing v${CACHE_VERSION}`);
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Pre-caching static assets');
      return Promise.allSettled(
        STATIC_CACHE_URLS.map((url) =>
          cache.add(url).catch((error) => {
            console.warn(`[ServiceWorker] Failed to cache ${url}:`, error.message);
          })
        )
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log(`[ServiceWorker] Activating v${CACHE_VERSION}`);
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map((cacheName) => {
          if (!ALL_CACHES.includes(cacheName)) {
            console.log('[ServiceWorker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );

      await self.clients.claim();
      console.log('[ServiceWorker] Activation complete');

      if (typeof setTimeout !== 'undefined') {
        setTimeout(() => {
          cleanupExpiredEntries().catch((err) => {
            console.warn('[ServiceWorker] Deferred cleanup failed:', err);
          });
        }, 5000);
      }
    })()
  );
});

async function cleanupExpiredEntries() {
  const apiCache = await caches.open(API_CACHE_NAME);
  const apiRequests = await apiCache.keys();
  const now = Date.now();

  for (const request of apiRequests) {
    const response = await apiCache.match(request);
    if (response) {
      const cachedTime = response.headers.get('sw-cached-time');
      if (cachedTime) {
        const age = now - parseInt(cachedTime, 10);
        if (age > CACHE_LIMITS.maxApiCacheAge * 1000) {
          await apiCache.delete(request);
          console.log('[ServiceWorker] Expired API cache entry removed:', request.url);
        }
      }
    }
  }

  if (apiRequests.length > CACHE_LIMITS.maxApiEntries) {
    const entriesToRemove = apiRequests.length - CACHE_LIMITS.maxApiEntries;
    for (let i = 0; i < entriesToRemove; i++) {
      await apiCache.delete(apiRequests[i]);
    }
    console.log(`[ServiceWorker] Removed ${entriesToRemove} old API cache entries`);
  }

  const dynamicCache = await caches.open(DYNAMIC_CACHE_NAME);
  const dynamicRequests = await dynamicCache.keys();

  if (dynamicRequests.length > CACHE_LIMITS.maxEntries) {
    const entriesToRemove = dynamicRequests.length - CACHE_LIMITS.maxEntries;
    for (let i = 0; i < entriesToRemove; i++) {
      await dynamicCache.delete(dynamicRequests[i]);
    }
    console.log(`[ServiceWorker] Removed ${entriesToRemove} old dynamic cache entries`);
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (!url.protocol.startsWith('http')) {
    return;
  }

  if (request.method === 'POST' || request.method === 'PUT' || request.method === 'DELETE') {
    event.respondWith(handleMutationRequest(request));
    return;
  }

  const strategy = getCacheStrategy(url, request);

  switch (strategy) {
    case 'networkFirst':
      event.respondWith(networkFirstWithApiCache(request));
      break;
    case 'cacheFirst':
      event.respondWith(cacheFirst(request));
      break;
    case 'networkOnly':
      event.respondWith(networkOnly(request));
      break;
    case 'staleWhileRevalidate':
      event.respondWith(staleWhileRevalidate(request));
      break;
    default:
      event.respondWith(networkFirstWithFallback(request));
  }
});

function getCacheStrategy(url, request) {
  const pathname = url.pathname;

  for (const pattern of CACHE_STRATEGIES.networkOnly) {
    if (pathname.includes(pattern) || url.href.includes(pattern)) {
      return 'networkOnly';
    }
  }

  for (const pattern of CACHE_STRATEGIES.networkFirst) {
    if (pathname.startsWith(pattern)) {
      return 'networkFirst';
    }
  }

  for (const pattern of CACHE_STRATEGIES.cacheFirst) {
    if (pathname.includes(pattern) || pathname.endsWith(pattern)) {
      return 'cacheFirst';
    }
  }

  for (const pattern of CACHE_STRATEGIES.staleWhileRevalidate) {
    if (pathname.endsWith(pattern)) {
      return 'staleWhileRevalidate';
    }
  }

  return 'networkFirst';
}

async function notifyClients(type, data = {}) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
  clients.forEach(client => {
    client.postMessage({ type, ...data, timestamp: Date.now() });
  });
}

async function networkFirstWithApiCache(request) {
  const isApiRequest = request.url.includes('/api/');
  const cacheName = isApiRequest ? API_CACHE_NAME : DYNAMIC_CACHE_NAME;

  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok && request.method === 'GET') {
      const cache = await caches.open(cacheName);
      const responseToCache = networkResponse.clone();

      if (isApiRequest) {
        const headers = new Headers(responseToCache.headers);
        headers.set('sw-cached-time', Date.now().toString());

        const modifiedResponse = new Response(await responseToCache.blob(), {
          status: responseToCache.status,
          statusText: responseToCache.statusText,
          headers: headers,
        });

        cache.put(request, modifiedResponse);
      } else {
        cache.put(request, responseToCache);
      }
    }

    return networkResponse;
  } catch (error) {
    console.log('[ServiceWorker] Network failed, trying cache:', request.url);

    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    if (request.mode === 'navigate') {
      return getOfflineFallback();
    }

    if (isApiRequest) {
      return new Response(
        JSON.stringify({ error: 'Offline', message: 'You are currently offline' }),
        {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    throw error;
  }
}

async function networkFirstWithFallback(request) {
  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok && request.method === 'GET') {
      const cache = await caches.open(DYNAMIC_CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }

    if (request.mode === 'navigate') {
      return getOfflineFallback();
    }

    throw error;
  }
}

async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);

  if (cachedResponse) {
    const cacheAge = getCacheAge(cachedResponse);
    if (cacheAge < CACHE_LIMITS.maxAgeSeconds * 1000) {
      return cachedResponse;
    }
  }

  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok && request.method === 'GET') {
      const cache = await caches.open(STATIC_CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    if (cachedResponse) {
      return cachedResponse;
    }
    throw error;
  }
}

async function networkOnly(request) {
  try {
    return await fetch(request);
  } catch (error) {
    if (request.mode === 'navigate') {
      return getOfflineFallback();
    }
    throw error;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(DYNAMIC_CACHE_NAME);
  const cachedResponse = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((networkResponse) => {
      if (networkResponse.ok && request.method === 'GET') {
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch((error) => {
      console.log('[ServiceWorker] Fetch failed for stale-while-revalidate:', request.url);
      return null;
    });

  return cachedResponse || (await fetchPromise);
}

async function getOfflineFallback() {
  const cachedOffline = await caches.match(OFFLINE_URL);
  if (cachedOffline) {
    return cachedOffline;
  }

  return new Response(
    `<!DOCTYPE html>
    <html><head><title>Offline</title></head>
    <body style="font-family:system-ui;text-align:center;padding:50px;">
      <h1>You're Offline</h1>
      <p>Please check your internet connection and try again.</p>
      <button onclick="location.reload()">Retry</button>
    </body></html>`,
    { headers: { 'Content-Type': 'text/html' } }
  );
}

function getCacheAge(response) {
  const cacheDate = response.headers.get('date');
  if (!cacheDate) return Infinity;

  const cacheTime = new Date(cacheDate).getTime();
  const now = Date.now();

  return now - cacheTime;
}

async function handleMutationRequest(request) {
  try {
    const response = await fetch(request.clone());
    return response;
  } catch (error) {
    console.log('[ServiceWorker] Mutation request failed, queuing for sync:', request.url);

    await saveFailedRequest(request);

    if ('sync' in self.registration) {
      try {
        await self.registration.sync.register(SYNC_TAG);
        console.log('[ServiceWorker] Background sync registered');
      } catch (syncError) {
        console.warn('[ServiceWorker] Background sync registration failed:', syncError);
      }
    }

    return new Response(
      JSON.stringify({
        error: 'Offline',
        message: 'Request queued for sync when online',
        queued: true,
      }),
      {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

async function saveFailedRequest(request) {
  const requestData = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    url: request.url,
    method: request.method,
    headers: Object.fromEntries(request.headers.entries()),
    body: request.method !== 'GET' ? await request.clone().text() : null,
    timestamp: Date.now(),
  };

  const db = await openIndexedDB();
  const tx = db.transaction(FAILED_REQUESTS_STORE, 'readwrite');
  const store = tx.objectStore(FAILED_REQUESTS_STORE);
  await store.add(requestData);
  console.log('[ServiceWorker] Failed request saved:', requestData.id);
}

async function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('ecode-sw-db', 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(FAILED_REQUESTS_STORE)) {
        db.createObjectStore(FAILED_REQUESTS_STORE, { keyPath: 'id' });
      }
    };
  });
}

async function getFailedRequests() {
  const db = await openIndexedDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FAILED_REQUESTS_STORE, 'readonly');
    const store = tx.objectStore(FAILED_REQUESTS_STORE);
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function removeFailedRequest(id) {
  const db = await openIndexedDB();
  const tx = db.transaction(FAILED_REQUESTS_STORE, 'readwrite');
  const store = tx.objectStore(FAILED_REQUESTS_STORE);
  await store.delete(id);
}

self.addEventListener('sync', (event) => {
  console.log('[ServiceWorker] Sync event received:', event.tag);

  if (event.tag === SYNC_TAG) {
    event.waitUntil(syncFailedRequests());
  }
});

async function syncFailedRequests() {
  console.log('[ServiceWorker] Starting sync of failed requests');

  try {
    const failedRequests = await getFailedRequests();
    console.log(`[ServiceWorker] Found ${failedRequests.length} failed requests to sync`);

    for (const requestData of failedRequests) {
      try {
        const headers = new Headers(requestData.headers);

        const response = await fetch(requestData.url, {
          method: requestData.method,
          headers: headers,
          body: requestData.body,
        });

        if (response.ok) {
          await removeFailedRequest(requestData.id);
          console.log('[ServiceWorker] Successfully synced request:', requestData.id);

          await notifyClients('OFFLINE_SYNC_COMPLETE', {
            urls: [requestData.url],
            isBackgroundSync: true,
          });
        } else {
          console.warn('[ServiceWorker] Sync request failed with status:', response.status);
        }
      } catch (error) {
        console.error('[ServiceWorker] Failed to sync request:', requestData.id, error);
      }
    }

    console.log('[ServiceWorker] Sync complete');
  } catch (error) {
    console.error('[ServiceWorker] Sync failed:', error);
    throw error;
  }
}


self.addEventListener('message', (event) => {
  const { type, payload } = event.data || {};

  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;

    case 'CLEAR_CACHE':
      caches.keys().then((cacheNames) => {
        Promise.all(cacheNames.map((name) => caches.delete(name))).then(() => {
          event.ports[0]?.postMessage({ success: true });
        });
      });
      break;

    case 'CACHE_URLS':
      if (payload?.urls) {
        caches.open(DYNAMIC_CACHE_NAME).then((cache) => {
          cache.addAll(payload.urls);
        });
      }
      break;

    case 'GET_CACHE_STATUS':
      getCacheStatus().then((status) => {
        event.ports[0]?.postMessage(status);
      });
      break;

    case 'TRIGGER_SYNC':
      if ('sync' in self.registration) {
        self.registration.sync.register(SYNC_TAG);
      }
      break;

    case 'GET_PENDING_REQUESTS':
      getFailedRequests().then((requests) => {
        event.ports[0]?.postMessage({ pendingRequests: requests });
      });
      break;
  }
});

async function getCacheStatus() {
  const status = {
    version: CACHE_VERSION,
    caches: {},
  };

  for (const cacheName of ALL_CACHES) {
    try {
      const cache = await caches.open(cacheName);
      const keys = await cache.keys();
      status.caches[cacheName] = {
        entries: keys.length,
        urls: keys.slice(0, 10).map((r) => r.url),
      };
    } catch (error) {
      status.caches[cacheName] = { error: error.message };
    }
  }

  try {
    const pendingRequests = await getFailedRequests();
    status.pendingSync = pendingRequests.length;
  } catch (error) {
    status.pendingSync = 0;
  }

  return status;
}

self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body,
      icon: '/icons/icon-192x192.png',
      badge: '/favicon.svg',
      vibrate: [100, 50, 100],
      tag: data.tag || 'ecode-notification',
      renotify: true,
      data: {
        url: data.url || '/',
        dateOfArrival: Date.now(),
      },
    };

    event.waitUntil(self.registration.showNotification(data.title, options));
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});

console.log(`[ServiceWorker] Service Worker v${CACHE_VERSION} loaded`);

const CACHE_NAME = 'amazonia-diario-cache-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/logo_amazonia.png',
  '/manifest.json'
];

// Install Event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching static assets');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate Event
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Clearing old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Interception
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // If it's a request to Django pages endpoint (PDF pages)
  if (requestUrl.pathname.includes('/pages/') && requestUrl.pathname.includes('/editions/')) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            console.log('[Service Worker] Serving PDF page from cache:', requestUrl.pathname);
            return cachedResponse;
          }

          // Fetch from network and dynamically cache
          return fetch(event.request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              console.log('[Service Worker] Caching PDF page from network:', requestUrl.pathname);
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          }).catch((err) => {
            console.warn('[Service Worker] Failed to fetch PDF page and not in cache:', err);
            // Return a fallback or propagate error
            throw err;
          });
        });
      })
    );
    return;
  }

  // General Static Assets caching (CSS, JS, assets)
  if (
    requestUrl.pathname.includes('/assets/') ||
    STATIC_ASSETS.includes(requestUrl.pathname) ||
    requestUrl.pathname.endsWith('.png') ||
    requestUrl.pathname.endsWith('.jpg') ||
    requestUrl.pathname.endsWith('.svg') ||
    requestUrl.pathname.endsWith('.css') ||
    requestUrl.pathname.endsWith('.js')
  ) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        }).catch(() => {
          // Offline fallback for html
          if (event.request.headers.get('accept').includes('text/html')) {
            return caches.match('/');
          }
        });
      })
    );
    return;
  }

  // Network First for regular API calls
  if (requestUrl.pathname.includes('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        // If offline and it matches landing editions list, we can try to return cached version
        if (requestUrl.pathname.includes('/public/editions-landing/') || requestUrl.pathname.includes('/library/')) {
          return caches.match(event.request);
        }
        throw new Error('Offline');
      })
    );
    return;
  }

  // SPA fallback: Serve index.html for navigation requests when offline
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match('/');
      })
    );
  }
});

// Handle precaching requests from the frontend app (e.g. download full edition)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'PRECACHE_EDITION_PAGES') {
    const { urls, token } = event.data;
    console.log('[Service Worker] Starting background download for edition pages:', urls.length);

    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) => {
        const promises = urls.map((url) => {
          const headers = new Headers();
          if (token) {
            headers.append('Authorization', `Bearer ${token}`);
          }

          const req = new Request(url, {
            method: 'GET',
            headers: headers,
            mode: 'cors',
            credentials: 'omit'
          });

          return fetch(req).then((res) => {
            if (res.status === 200) {
              return cache.put(req, res);
            }
          }).catch((err) => {
            console.error('[Service Worker] Failed to prefetch page url:', url, err);
          });
        });

        return Promise.all(promises).then(() => {
          console.log('[Service Worker] Finished downloading all pages for edition offline reader.');
          // Notify client that download is completed
          self.clients.matchAll().then((clients) => {
            clients.forEach((client) => {
              client.postMessage({
                type: 'EDITION_PRECACHE_COMPLETED',
                success: true
              });
            });
          });
        });
      })
    );
  }
});

// Push Notification Event
self.addEventListener('push', (event) => {
  let data = { title: 'Amazonia Diario', body: 'Nueva edición disponible' };
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'Amazonia Diario', body: event.data.text() };
    }
  }

  const options = {
    body: data.body,
    icon: '/logo_amazonia.png',
    badge: '/logo_amazonia.png',
    data: data.url || '/'
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification Click Event
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const targetUrl = event.notification.data;
      for (const client of clientList) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

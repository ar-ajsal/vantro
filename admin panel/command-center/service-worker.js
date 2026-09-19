/* Chromvault Admin PWA service worker with Firebase Cloud Messaging (FCM).
 *
 * Strategy:
 *   - Precache the app shell + hashed build assets so the dashboard is
 *     installable and loads offline.
 *   - NEVER cache API traffic ("/api/…"): those requests are authenticated and
 *     must always hit the network so the admin sees live, correct data.
 *   - App code (JS/CSS): network-first with a cache fallback.
 *   - Images/fonts: cache-first (rarely change, safe to serve from cache).
 *   - Navigations: network-first with an offline fallback to the cached shell.
 *   - Push notifications: receive background FCM messages, display system notifications,
 *     and route clicks to the active order page.
 */

// Import Firebase compat scripts inside Service Worker context
try {
  importScripts('https://www.gstatic.com/firebasejs/10.13.1/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.13.1/firebase-messaging-compat.js');
  importScripts('/firebase-config.js');
} catch (err) {
  console.warn('[SW] Could not load Firebase scripts inside service worker:', err);
}

const CACHE_VERSION = 'chromvault-admin-v9';
const SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.png',
  '/firebase-config.js',
  '/notifications.js'
];

// Initialize Firebase Messaging in Service Worker if SDK is present
if (typeof firebase !== 'undefined' && self.FIREBASE_WEB_CONFIG) {
  try {
    if (!firebase.apps || !firebase.apps.length) {
      firebase.initializeApp(self.FIREBASE_WEB_CONFIG.config);
    }
    const messaging = firebase.messaging();

    messaging.onBackgroundMessage(function (payload) {
      console.log('[SW] Background FCM message received:', payload);
      const data = payload.data || {};
      const notification = payload.notification || {};

      const orderId = data.orderId || '';
      const orderNumber = data.orderNumber || orderId || '';
      const total = data.total ? '₹' + data.total : '';

      const title = notification.title || '🛍️ New Order';
      const body = notification.body || (orderNumber ? `New order #${orderNumber}${total ? ' — ' + total : ''}` : 'New customer order received');

      const targetUrl = data.url || (orderId ? `/#/orders/${orderId}` : '/#/orders');

      const options = {
        body: body,
        icon: '/icon-192x192.png',
        badge: '/icon-192x192.png',
        tag: orderId ? `order-${orderId}` : `notification-${Date.now()}`,
        renotify: true,
        requireInteraction: true,
        data: {
          url: targetUrl,
          orderId: orderId,
          type: data.type || 'NEW_ORDER'
        }
      };

      return self.registration.showNotification(title, options);
    });
  } catch (e) {
    console.error('[SW] Firebase messaging init failed in SW:', e);
  }
}

// Notification Click Handler: Focus existing Command Center or open order details
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url)
    ? event.notification.data.url
    : '/#/orders';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      // Look for an existing open window/tab from this origin
      for (let i = 0; i < clientList.length; i++) {
        let client = clientList[i];
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          if ('navigate' in client) {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      // If no tab is open, open a new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      // addAll is atomic; if one fails nothing is cached. Shell URLs are known-good.
      cache.addAll(SHELL_URLS).catch(() => {})
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // never touch mutations

  const url = new URL(request.url);

  // Only handle same-origin requests; let cross-origin (fonts CDN, etc.) pass through.
  if (url.origin !== self.location.origin) return;

  // API traffic must never be cached or served stale.
  if (url.pathname.startsWith('/api')) return;

  // App navigations → network-first, fall back to cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put('/index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('/index.html').then((r) => r || caches.match('/')))
    );
    return;
  }

  // App code (un-hashed JS/CSS) → network-first so admin updates are picked up.
  // Falls back to the cached copy when offline.
  if (/\.(?:js|css)$/.test(url.pathname)) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Images/fonts → cache-first (rarely change).
  if (/\/assets\//.test(url.pathname) || /\.(?:png|jpg|jpeg|svg|ico|webp|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return res;
        });
      })
    );
  }
});

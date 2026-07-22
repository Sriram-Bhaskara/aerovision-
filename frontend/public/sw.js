// =====================================================
// AeroVision Service Worker — Offline Support
// Strategy:
//   • Static assets  → Cache-first (serve cached, update in bg)
//   • /api/flights, /api/weather, /api/analytics/crowd
//                    → Network-first, cache on success, serve stale offline
//   • Navigation     → Network, fall back to cached index.html (SPA shell)
//   • Everything else→ Network-only (auth, notifications, etc.)
// =====================================================

const STATIC_CACHE = 'aerovision-static-v1';
const API_CACHE    = 'aerovision-api-v1';

// API paths to cache for offline use (prefix match)
const OFFLINE_API_PREFIXES = [
  '/api/flights',
  '/api/weather',
  '/api/analytics/crowd',
  '/api/currency/rates',
];

// ── Install ──────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.add('/'))
      .finally(() => self.skipWaiting())
  );
});

// ── Activate: clean up old caches ────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== STATIC_CACHE && k !== API_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests from same origin
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // API calls: network-first with offline cache fallback
  if (url.pathname.startsWith('/api/')) {
    const shouldCache = OFFLINE_API_PREFIXES.some(p => url.pathname.startsWith(p));
    if (shouldCache) {
      event.respondWith(networkFirstAPI(request));
    }
    // Non-cacheable API (auth, notifications, etc.) — let browser handle normally
    return;
  }

  // SPA navigation: network, fallback to shell
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/') || caches.match('/index.html'))
    );
    return;
  }

  // Static JS/CSS/fonts: cache-first, update in background
  if (/\.(js|css|woff2?|png|svg|ico)(\?|$)/.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
});

// ── Strategies ────────────────────────────────────────

async function networkFirstAPI(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(API_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Offline: serve stale cached response
    const cached = await caches.match(request);
    if (cached) {
      // Add a header so the app knows this is stale/offline data
      const headers = new Headers(cached.headers);
      headers.set('X-AeroVision-Offline', 'true');
      return new Response(cached.body, { status: cached.status, headers });
    }
    // No cache: return JSON error
    return new Response(
      JSON.stringify({ error: 'You are offline. No cached data available.', offline: true }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function staleWhileRevalidate(request) {
  const cache  = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  // Kick off network fetch regardless
  const networkFetch = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return cached || networkFetch;
}

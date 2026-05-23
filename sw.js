/* ═══════════════════════════════════════════════════════════
   ANISMOKE SERVICE WORKER — Offline Shell Cache
   Strategy:
     • App Shell (HTML/CSS/JS/Assets) → Cache-First
     • AniList / Anify API calls       → Network-First (no cache)
     • CDN scripts (Supabase SDK)      → Cache-First
   ═══════════════════════════════════════════════════════════ */

const CACHE_NAME   = 'anismoke-shell-v8';
const OFFLINE_URL  = '/404.html';

// Static assets that form the app shell
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/browse.html',
  '/watch.html',
  '/watchlist.html',
  '/404.html',
  '/site.webmanifest',
  '/css/variables.css',
  '/css/base.css',
  '/css/components.css',
  '/js/security.js',
  '/js/api.js',
  '/js/app.js',
  '/js/supabase.js',
  '/assets/logo.png',
  '/assets/favicon-32.png',
  '/assets/favicon-192.png',
];

// CDN scripts — cache on first fetch, serve cached thereafter
const CDN_ORIGINS = [
  'https://cdn.jsdelivr.net',
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
];

// API origins — always network-first, never cache
const API_ORIGINS = [
  'https://graphql.anilist.co',
  'https://api.anify.tv',
];

// Supabase — network-first for auth/DB, but allow CDN caching for SDK
const SUPABASE_SDK_RE = /supabase-js/;

/* ── Install: pre-cache the app shell ─────────────────────── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Pre-caching app shell');
      // addAll fails atomically — if one asset 404s, the whole install fails.
      // Use individual add() with catch so a missing asset doesn't block SW.
      return Promise.allSettled(
        SHELL_ASSETS.map(url =>
          cache.add(url).catch(err =>
            console.warn(`[SW] Could not cache ${url}:`, err.message)
          )
        )
      );
    }).then(() => self.skipWaiting())
  );
});

/* ── Activate: purge old caches ────────────────────────────── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => {
            console.log('[SW] Deleting old cache:', k);
            return caches.delete(k);
          })
      )
    ).then(() => self.clients.claim())
  );
});

/* ── Fetch: routing logic ──────────────────────────────────── */
self.addEventListener('fetch', event => {
  const { request } = event;

  // Only intercept GET requests
  if (request.method !== 'GET') return;

  // Chrome extension / non-http — ignore
  if (!request.url.startsWith('http')) return;

  let url;
  try { url = new URL(request.url); } catch { return; }

  // ── API calls: always network-only, no cache ──
  if (API_ORIGINS.some(o => request.url.startsWith(o))) {
    event.respondWith(safeRespond(() => fetchNetworkOnly(request)));
    return;
  }

  // ── Supabase auth/DB endpoints: network-first, no cache ──
  if (
    url.hostname.endsWith('.supabase.co') &&
    !SUPABASE_SDK_RE.test(request.url)
  ) {
    event.respondWith(safeRespond(() => fetchNetworkFirst(request)));
    return;
  }

  // ── CDN resources + Supabase SDK: cache-first ──
  if (CDN_ORIGINS.some(o => request.url.startsWith(o))) {
    event.respondWith(safeRespond(() => fetchCacheFirst(request)));
    return;
  }

  // ── Same-origin ──
  if (url.origin === self.location.origin) {
    // Exclude generated config from cache (always fetch fresh)
    if (url.pathname === '/js/config.js') {
      event.respondWith(safeRespond(() => fetchNetworkOnly(request)));
      return;
    }
    // Navigation requests (HTML pages): network-first so latest code always loads
    if (request.mode === 'navigate') {
      event.respondWith(safeRespond(() => fetchNetworkFirstWithOfflineFallback(request)));
    } else {
      // Sub-resources (CSS/JS/images): cache-first for performance
      event.respondWith(safeRespond(() => fetchCacheFirst(request)));
    }
    return;
  }
});

/* ── Safety wrapper: ensures respondWith never gets a rejected promise ── */
async function safeRespond(fn) {
  try {
    return await fn();
  } catch (err) {
    console.error('[SW] Unhandled error in fetch handler:', err);
    return new Response('Service Worker Error', { status: 500 });
  }
}

/* ── Strategy: Cache-First ─────────────────────────────────── */
async function fetchCacheFirst(request) {
  try {
    const cached = await caches.match(request);
    if (cached) return cached;
  } catch (e) {
    console.warn('[SW] Cache match failed:', e.message);
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      try {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone());
      } catch { /* cache write failure is non-fatal */ }
    }
    return response;
  } catch {
    return new Response('Network error', { status: 503 });
  }
}

/* ── Strategy: Network-First + Offline HTML fallback (for navigation) ── */
async function fetchNetworkFirstWithOfflineFallback(request) {
  // Try network first — always get latest HTML
  try {
    const response = await fetch(request);
    if (response.ok) {
      try {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone());
      } catch { /* cache write failure is non-fatal */ }
    }
    return response;
  } catch {
    // Network failed — try cache
  }

  // Fall back to cache
  try {
    const cached = await caches.match(request);
    if (cached) return cached;
  } catch (e) {
    console.warn('[SW] Cache match failed:', e.message);
  }

  // Last resort: show offline page
  try {
    notifyClientsOffline();
    const offline = await caches.match(OFFLINE_URL);
    if (offline) return offline;
  } catch { /* even offline page cache failed */ }

  return new Response('Offline', {
    status: 503,
    headers: { 'Content-Type': 'text/html' }
  });
}

/* ── Strategy: Network-First (tries network, falls back to cache) */
async function fetchNetworkFirst(request) {
  try {
    return await fetch(request);
  } catch {
    try {
      const cached = await caches.match(request);
      if (cached) return cached;
    } catch { /* cache match failed */ }
    return new Response('Offline', { status: 503 });
  }
}

/* ── Strategy: Network-Only (for live API data) ─────────────── */
async function fetchNetworkOnly(request) {
  try {
    return await fetch(request);
  } catch {
    return new Response(
      JSON.stringify({ errors: [{ message: 'You are offline' }] }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/* ── Broadcast offline status to all open tabs ─────────────── */
let _offlineNotified = false;
function notifyClientsOffline() {
  // Throttle to once per 60s to avoid spam
  if (_offlineNotified) return;
  _offlineNotified = true;
  setTimeout(() => { _offlineNotified = false; }, 60000);

  self.clients.matchAll({ type: 'window' }).then(clients => {
    clients.forEach(client =>
      client.postMessage({ type: 'AS_OFFLINE' })
    );
  }).catch(() => { /* ignore messaging errors */ });
}


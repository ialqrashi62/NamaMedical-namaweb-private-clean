/* NamaMedical ERP — Service Worker
 * Strategy:
 *   - /api/*  -> network-first (never serve stale clinical/business data)
 *   - other   -> cache-first (static assets, pages)
 *   - offline fallback to /offline.html
 * Cache version: bump to invalidate older shells.
 */
'use strict';

const CACHE_VERSION = 'namaweb-v1';
const PRECACHE_URLS = [
    '/',
    '/pcc-catalog/',
    '/login.html',
    '/css/tailwind-compiled.css',
    '/js/app.js',
    '/manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_VERSION)
            .then((cache) => cache.addAll(PRECACHE_URLS))
            .then(() => self.skipWaiting())
            .catch((err) => console.error('[SW] precache failed', err))
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// Stub: server-side push integration deferred. Avoid throwing.
self.addEventListener('push', (event) => {
    console.log('[SW] push event received (stub)');
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return; // never intercept cross-origin (CDN, etc.)

    // API: network-first, never cache responses (PHI / live data safety)
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(req)
                .then((res) => res)
                .catch(() => new Response(
                    JSON.stringify({ error: 'offline', message: 'لا يوجد اتصال بالشبكة' }),
                    { status: 503, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
                ))
        );
        return;
    }

    // Static & pages: cache-first with network refresh
    event.respondWith(
        caches.match(req).then((cached) => {
            const networkFetch = fetch(req)
                .then((res) => {
                    // Only cache successful, basic/cors responses
                    if (res && res.status === 200 && res.type === 'basic') {
                        const copy = res.clone();
                        caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
                    }
                    return res;
                })
                .catch(() => {
                    // Navigation request that missed cache: show offline page
                    if (req.mode === 'navigate') {
                        return caches.match('/offline.html');
                    }
                    return new Response('offline', { status: 503 });
                });
            return cached || networkFetch;
        })
    );
});

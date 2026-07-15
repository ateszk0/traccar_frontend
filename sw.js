const CACHE_NAME = 'traccar-plus-v3';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/src/style.css',
    '/src/main.js',
    '/src/store/state.js',
    '/src/api/traccar.js',
    '/src/api/websocket.js',
    '/src/components/login.js',
    '/src/components/map.js',
    '/src/components/sidebar.js',
    '/src/components/deviceDetail.js',
    '/src/utils/format.js',
    '/icons/icon.svg',
    '/manifest.json'
];

// Install: cache static assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
    );
});

// Activate: clean up old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

// Fetch: network-first for API, cache-first for static
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Skip non-GET requests
    if (event.request.method !== 'GET') return;

    // Don't intercept API calls or WebSocket upgrades
    if (url.pathname.startsWith('/api/')) return;

    // Cache-first for static assets
    event.respondWith(
        caches.match(event.request).then(cached => {
            if (cached) return cached;
            return fetch(event.request).then(response => {
                if (response.ok && response.type === 'basic') {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            });
        }).catch(() => {
            // Offline fallback
            if (event.request.mode === 'navigate') {
                return caches.match('/index.html');
            }
        })
    );
});

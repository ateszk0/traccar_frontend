// This service worker immediately unregisters itself and clears all caches.
// This is intentional - we are removing SW-based caching to fix stale cache issues on mobile.

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.map(k => caches.delete(k)))
        ).then(() => {
            return self.clients.claim();
        }).then(() => {
            // Tell all open pages to reload
            return self.clients.matchAll({ type: 'window' }).then(clients => {
                clients.forEach(client => client.navigate(client.url));
            });
        })
    );
    // Unregister this SW
    self.registration.unregister();
});

// Don't intercept any requests - just pass through
self.addEventListener('fetch', () => {
    // No-op: let the browser handle all requests normally
    return;
});

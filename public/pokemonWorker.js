// Pokemon PWA Service Worker
const CACHE_NAME = 'pokemon-pwa-v1';
const STATIC_CACHE = 'pokemon-static-v1';
const API_CACHE = 'pokemon-api-v1';

// Essential static resources to cache immediately
const urlsToCache = [
    '/',
    '/manifest.json',
    '/vite.svg'
];

// Install event - cache essential resources only
self.addEventListener('install', event => {
    console.log('Service Worker installing...');
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache => {
                console.log('Opened static cache');
                return cache.addAll(urlsToCache);
            })
            .catch(error => {
                console.error('Static cache failed:', error);
            })
    );
    // Skip waiting to activate immediately
    self.skipWaiting();
});
// Activate event - clean up old caches and take control
self.addEventListener('activate', event => {
    console.log('Service Worker activating...');
    event.waitUntil(
        Promise.all([
            // Clean up old caches
            caches.keys().then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        if (cacheName !== STATIC_CACHE && cacheName !== API_CACHE) {
                            console.log('Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            }),
            // Take control of all clients immediately
            self.clients.claim()
        ])
    );
});

// Fetch event - intelligent caching strategy
self.addEventListener('fetch', event => {
    // Only handle GET requests
    if (event.request.method !== 'GET') {
        return;
    }

    const url = new URL(event.request.url);

    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Return cached version if available
                if (response) {
                    console.log('Serving from cache:', event.request.url);
                    return response;
                }

                console.log('Fetching from network:', event.request.url);
                return fetch(event.request).then(response => {
                    // Don't cache non-successful responses
                    if (!response || response.status !== 200) {
                        return response;
                    }

                    // Clone the response
                    const responseToCache = response.clone();

                    // Determine caching strategy based on resource type
                    let cacheName;
                    let shouldCache = false;

                    if (url.hostname.includes('pokeapi.co')) {
                        // Cache Pokemon API responses with expiration
                        cacheName = API_CACHE;
                        shouldCache = true;
                    } else if (url.pathname.startsWith('/assets/') ||
                        url.pathname.endsWith('.js') ||
                        url.pathname.endsWith('.css') ||
                        url.pathname.endsWith('.svg') ||
                        url.pathname.endsWith('.png') ||
                        url.pathname.endsWith('.ico')) {
                        // Cache static assets
                        cacheName = STATIC_CACHE;
                        shouldCache = true;
                    } else if (url.pathname === '/' || url.pathname === '/index.html') {
                        // Cache the main HTML with shorter expiration
                        cacheName = STATIC_CACHE;
                        shouldCache = true;
                    }

                    if (shouldCache) {
                        caches.open(cacheName)
                            .then(cache => {
                                cache.put(event.request, responseToCache);
                            })
                            .catch(error => {
                                console.error('Cache put failed:', error);
                            });
                    }

                    return response;
                });
            })
            .catch(error => {
                console.error('Fetch failed:', error);

                // Provide fallback for navigation requests when offline
                if (event.request.mode === 'navigate') {
                    return caches.match('/').then(response => {
                        return response || new Response('Offline - App not available', {
                            status: 503,
                            statusText: 'Service Unavailable'
                        });
                    });
                }

                throw error;
            })
    );
});

// Handle background sync for offline Pokemon requests
self.addEventListener('sync', event => {
    if (event.tag === 'pokemon-sync') {
        console.log('Background sync triggered');
        // You could implement offline request queuing here
    }
});

// Handle push notifications (for future use)
self.addEventListener('push', event => {
    if (event.data) {
        const data = event.data.json();
        const options = {
            body: data.body,
            icon: '/vite.svg',
            badge: '/vite.svg',
            vibrate: [100, 50, 100],
            data: {
                dateOfArrival: Date.now(),
                primaryKey: 1
            }
        };

        event.waitUntil(
            self.registration.showNotification(data.title, options)
        );
    }
});

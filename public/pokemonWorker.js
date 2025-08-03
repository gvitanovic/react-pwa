// Pokemon PWA Service Worker
const CACHE_NAME = 'pokemon-pwa-v1';
const urlsToCache = [
    '/',
    '/src/main.tsx',
    '/src/App.tsx',
    '/src/App.css',
    '/src/index.css',
    'https://pokeapi.co/api/v2/pokemon/?limit=10&offset=0'
];

// Install event - cache resources
self.addEventListener('install', event => {
    console.log('Service Worker installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache');
                return cache.addAll(urlsToCache.filter(url => !url.startsWith('https://pokeapi.co')));
            })
            .catch(error => {
                console.error('Cache failed:', error);
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
    console.log('Service Worker activating...');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// Fetch event - serve from cache when possible
self.addEventListener('fetch', event => {
    // Only handle GET requests
    if (event.request.method !== 'GET') {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Return cached version or fetch from network
                if (response) {
                    console.log('Serving from cache:', event.request.url);
                    return response;
                }

                console.log('Fetching from network:', event.request.url);
                return fetch(event.request).then(response => {
                    // Don't cache non-successful responses
                    if (!response || response.status !== 200 || response.type !== 'basic') {
                        return response;
                    }

                    // Clone the response
                    const responseToCache = response.clone();

                    // Cache Pokemon API responses for faster loading
                    if (event.request.url.includes('pokeapi.co')) {
                        caches.open(CACHE_NAME)
                            .then(cache => {
                                cache.put(event.request, responseToCache);
                            });
                    }

                    return response;
                });
            })
            .catch(error => {
                console.error('Fetch failed:', error);
                // You could return a fallback page here
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

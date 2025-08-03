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
                    const getResourceType = (url) => {
                        if (url.hostname.includes('pokeapi.co')) {
                            return 'api';
                        }
                        if (url.pathname.startsWith('/assets/')) {
                            return 'static';
                        }
                        if (url.pathname === '/' || url.pathname === '/index.html') {
                            return 'html';
                        }
                        return 'none';
                    };

                    let cacheName;
                    let shouldCache = false;
                    const resourceType = getResourceType(url);

                    switch (resourceType) {
                        case 'api':
                            // Cache Pokemon API responses
                            cacheName = API_CACHE;
                            shouldCache = true;
                            break;
                        case 'static':
                            // Cache static assets
                            cacheName = STATIC_CACHE;
                            shouldCache = true;
                            break;
                        case 'html':
                            // Cache the main HTML
                            cacheName = STATIC_CACHE;
                            shouldCache = true;
                            break;
                        case 'none':
                        default:
                            // Don't cache other resources
                            shouldCache = false;
                            break;
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

                // Register background sync for Pokemon API failures
                if (event.request.url.includes('pokeapi.co')) {
                    self.registration.sync.register('pokemon-sync')
                        .then(() => {
                            console.log('Background sync registered for Pokemon API');
                        })
                        .catch(syncError => {
                            console.error('Failed to register background sync:', syncError);
                        });
                }

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
    console.log('Background sync triggered with tag:', event.tag);

    if (event.tag === 'pokemon-sync') {
        event.waitUntil(syncPokemonData());
    } else if (event.tag === 'pokemon-refresh') {
        event.waitUntil(refreshPokemonCache());
    }
});

// Sync fresh Pokemon data
async function syncPokemonData() {
    try {
        console.log('Syncing fresh Pokemon data...');

        // Fetch fresh Pokemon list
        const pokemonListUrl = 'https://pokeapi.co/api/v2/pokemon/?limit=20&offset=0';
        const response = await fetch(pokemonListUrl);

        if (response.ok) {
            const cache = await caches.open(API_CACHE);
            await cache.put(pokemonListUrl, response.clone());
            console.log('Pokemon list synced successfully');

            // Parse the response to get individual Pokemon URLs
            const data = await response.json();
            const pokemonUrls = data.results.map(pokemon => pokemon.url);

            // Fetch individual Pokemon data (limit to first 10 to avoid overwhelming)
            const syncPromises = pokemonUrls.slice(0, 10).map(async (url) => {
                try {
                    const pokemonResponse = await fetch(url);
                    if (pokemonResponse.ok) {
                        await cache.put(url, pokemonResponse);
                        console.log('Synced:', url);
                    }
                } catch (error) {
                    console.warn('Failed to sync:', url, error);
                }
            });

            await Promise.allSettled(syncPromises);
            console.log('Background sync completed');

            // Notify all clients about the sync completion
            const clients = await self.clients.matchAll();
            clients.forEach(client => {
                client.postMessage({
                    type: 'SYNC_COMPLETE',
                    data: 'Pokemon data synced successfully'
                });
            });

        } else {
            throw new Error(`Sync failed with status: ${response.status}`);
        }

    } catch (error) {
        console.error('Background sync failed:', error);

        // Retry the sync after a delay
        setTimeout(() => {
            self.registration.sync.register('pokemon-sync');
        }, 30000); // Retry after 30 seconds

        throw error;
    }
}

// Refresh Pokemon cache by invalidating old entries
async function refreshPokemonCache() {
    try {
        console.log('Refreshing Pokemon cache...');

        const cache = await caches.open(API_CACHE);
        const keys = await cache.keys();

        // Delete old Pokemon API entries
        const deletePromises = keys
            .filter(request => request.url.includes('pokeapi.co'))
            .map(request => cache.delete(request));

        await Promise.all(deletePromises);
        console.log('Old Pokemon cache cleared');

        // Fetch fresh data
        await syncPokemonData();

    } catch (error) {
        console.error('Cache refresh failed:', error);
        throw error;
    }
}

// Handle push notifications
self.addEventListener('push', event => {
    console.log('Push notification received:', event);

    let notificationData = {
        title: 'Pokemon PWA',
        body: 'You have a new notification!',
        icon: '/vite.svg',
        badge: '/vite.svg',
        vibrate: [100, 50, 100],
        data: {
            dateOfArrival: Date.now(),
            primaryKey: 1
        }
    };

    // Parse push data if available
    if (event.data) {
        try {
            const pushData = event.data.json();
            notificationData = {
                ...notificationData,
                ...pushData
            };
        } catch (error) {
            console.error('Error parsing push data:', error);
            notificationData.body = event.data.text() || notificationData.body;
        }
    }

    const options = {
        body: notificationData.body,
        icon: notificationData.icon,
        badge: notificationData.badge,
        vibrate: notificationData.vibrate,
        data: notificationData.data,
        actions: [
            {
                action: 'view',
                title: 'View App',
                icon: '/vite.svg'
            },
            {
                action: 'dismiss',
                title: 'Dismiss',
                icon: '/vite.svg'
            }
        ],
        requireInteraction: true
    };

    // Send notification data to main app for toast display
    self.clients.matchAll().then(clients => {
        clients.forEach(client => {
            client.postMessage({
                type: 'PUSH_NOTIFICATION_RECEIVED',
                notification: notificationData
            });
        });
    });

    event.waitUntil(
        self.registration.showNotification(notificationData.title, options)
    );
});

// Handle notification click events
self.addEventListener('notificationclick', event => {
    console.log('Notification clicked:', event);

    event.notification.close();

    if (event.action === 'dismiss') {
        return;
    }

    // Default action or 'view' action
    const urlToOpen = event.notification.data?.url || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(clientList => {
                // Check if app is already open
                for (const client of clientList) {
                    if (client.url.includes(urlToOpen) && 'focus' in client) {
                        return client.focus();
                    }
                }

                // Open new window/tab
                if (clients.openWindow) {
                    return clients.openWindow(urlToOpen);
                }
            })
    );
});

// Handle messages from the main app
self.addEventListener('message', event => {
    console.log('Service Worker received message:', event.data);

    if (event.data.type === 'USER_MESSAGE') {
        const userMessage = event.data.data;
        const timestamp = new Date(event.data.timestamp).toLocaleTimeString();

        // Process the message (you can add custom logic here)
        let response;

        if (userMessage.toLowerCase().includes('pokemon')) {
            response = `🎮 Pokemon-related message received! "${userMessage}" at ${timestamp}`;
        } else if (userMessage.toLowerCase().includes('cache')) {
            response = `💾 Cache operation noted: "${userMessage}" at ${timestamp}`;
        } else if (userMessage.toLowerCase().includes('sync')) {
            // Trigger a sync operation
            self.registration.sync.register('pokemon-sync');
            response = `🔄 Sync triggered by user message: "${userMessage}" at ${timestamp}`;
        } else {
            response = `✅ Message received: "${userMessage}" at ${timestamp}`;
        }

        // Send response back to the app
        event.ports[0]?.postMessage({
            type: 'USER_MESSAGE_RESPONSE',
            data: response
        });

        // Also broadcast to all clients
        self.clients.matchAll().then(clients => {
            clients.forEach(client => {
                client.postMessage({
                    type: 'USER_MESSAGE_RESPONSE',
                    data: response
                });
            });
        });
    }
});

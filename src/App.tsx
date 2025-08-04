import { useEffect, useState, useRef, useCallback, forwardRef } from "react";
import "./App.css";

const INITIAL_URL = "https://pokeapi.co/api/v2/pokemon/?limit=10&offset=0";

// Toast notification type
type ToastNotification = {
  id: string;
  title: string;
  body: string;
  data?: any;
  timestamp: number;
};

type Pokemon = {
  name: string;
  url: string;
};

type PokemonDetails = {
  id: number;
  name: string;
  height: number;
  weight: number;
  sprites: {
    front_default: string;
  };
  types: Array<{
    type: {
      name: string;
    };
  }>;
};

const fetchWithRetry = async (
  url: string,
  signal: AbortSignal,
  maxRetries = 3
): Promise<Response> => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, { signal });
      console.log(`Fetch attempt ${attempt} for ${url}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw err;
      }

      if (attempt === maxRetries) {
        throw err; // Last attempt failed
      }

      // Exponential backoff: 1s, 2s, 4s
      const delay = attempt ** 2 * 1000;
      console.log(
        `Fetch attempt ${attempt} failed for ${url}, retrying in ${delay}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error("Max retries exceeded");
};

function App() {
  const [pokemonDetails, setPokemonDetails] = useState<PokemonDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextUrl, setNextUrl] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [retryKey, setRetryKey] = useState(0);
  const observer = useRef<IntersectionObserver | null>(null);
  const wall = useRef(false);

  // Service Worker messaging state
  const [message, setMessage] = useState("");
  const [swMessages, setSwMessages] = useState<string[]>([]);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);

  // Toast notifications state
  const [toasts, setToasts] = useState<ToastNotification[]>([]);

  // Toast helper functions
  const addToast = (title: string, body: string, data?: any) => {
    const newToast: ToastNotification = {
      id: Date.now().toString(),
      title,
      body,
      data,
      timestamp: Date.now()
    };

    setToasts(prev => [...prev, newToast]);

    // Auto remove toast after 5 seconds
    setTimeout(() => {
      removeToast(newToast.id);
    }, 5000);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  // Push notification functions
  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const subscribeToPushNotifications = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      alert('Push notifications are not supported');
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;

      // Replace with your actual VAPID public key
      const vapidPublicKey = 'BFRiNKobG1IwhCrVyJHUkEDRqsWlFp3c1da2fvQUVmqIIMApOFlcgfdKi1tN-O1MDnLOgDx_RscduWfv-LkXmgg';

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
      });

      // Send subscription to server
      const response = await fetch('http://localhost:3001/api/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(subscription)
      });

      if (response.ok) {
        setSubscription(subscription);
        setIsSubscribed(true);
        setSwMessages(prev => [...prev, 'Successfully subscribed to push notifications!']);
      }
    } catch (error) {
      console.error('Failed to subscribe to push notifications:', error);
      setSwMessages(prev => [...prev, `Failed to subscribe: ${error}`]);
    }
  };

  const unsubscribeFromPushNotifications = async () => {
    if (subscription) {
      await subscription.unsubscribe();
      setSubscription(null);
      setIsSubscribed(false);
      setSwMessages(prev => [...prev, 'Unsubscribed from push notifications']);
    }
  };

  // Test push notification function
  const testPushNotification = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/test-notification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      const result = await response.json();
      if (result.success) {
        setSwMessages(prev => [...prev, '📨 Test notification sent!']);
      } else {
        setSwMessages(prev => [...prev, `❌ Test failed: ${result.message}`]);
      }
    } catch (error) {
      console.error('Failed to send test notification:', error);
      setSwMessages(prev => [...prev, `❌ Test failed: ${error}`]);
    }
  };

  // Check existing subscription on load and handle service worker updates
  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      const handleServiceWorkerUpdate = async () => {
        try {
          const registration = await navigator.serviceWorker.ready;

          // Check for existing subscription
          const existingSubscription = await registration.pushManager.getSubscription();
          if (existingSubscription) {
            setSubscription(existingSubscription);
            setIsSubscribed(true);
            setSwMessages(prev => [...prev, '✅ Found existing push subscription']);
          }

          // Listen for service worker updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              setSwMessages(prev => [...prev, '🔄 Service Worker updating...']);

              newWorker.addEventListener('statechange', async () => {
                if (newWorker.state === 'activated') {
                  setSwMessages(prev => [...prev, '✅ Service Worker updated successfully']);

                  // Automatically resubscribe if we had a subscription
                  if (existingSubscription) {
                    setSwMessages(prev => [...prev, '🔄 Resubscribing to push notifications...']);
                    try {
                      // Unsubscribe from old subscription
                      await existingSubscription.unsubscribe();

                      // Wait a moment for the new service worker to be ready
                      setTimeout(async () => {
                        await subscribeToPushNotifications();
                        setSwMessages(prev => [...prev, '✅ Automatically resubscribed to push notifications']);
                      }, 1000);
                    } catch (error) {
                      console.error('Auto-resubscription failed:', error);
                      setSwMessages(prev => [...prev, `❌ Auto-resubscription failed: Please manually resubscribe`]);
                    }
                  }
                }
              });
            }
          });

          // Check if there's a waiting service worker
          if (registration.waiting) {
            setSwMessages(prev => [...prev, '🔄 Service Worker update available - activating...']);
            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
          }

        } catch (error) {
          console.error('Service Worker setup failed:', error);
        }
      };

      handleServiceWorkerUpdate();

      // Listen for controlled by new service worker
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        setSwMessages(prev => [...prev, '🔄 App now controlled by updated Service Worker']);
        window.location.reload(); // Refresh to ensure consistency
      });
    }
  }, []);

  // Service Worker messaging functions
  const sendMessageToSW = async () => {
    if (!message.trim()) return;

    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;
      if (registration.active) {
        registration.active.postMessage({
          type: 'USER_MESSAGE',
          data: message,
          timestamp: Date.now()
        });
        setSwMessages(prev => [...prev, `Sent: ${message}`]);
        setMessage("");
      }
    }
  };

  // Listen for messages from service worker
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      const handleSWMessage = (event: MessageEvent) => {
        if (event.data.type === 'SYNC_COMPLETE') {
          setSwMessages(prev => [...prev, `SW: ${event.data.data}`]);
        } else if (event.data.type === 'USER_MESSAGE_RESPONSE') {
          setSwMessages(prev => [...prev, `SW Reply: ${event.data.data}`]);
        } else if (event.data.type === 'PUSH_NOTIFICATION_RECEIVED') {
          // Show toast for push notification data
          const { title, body, data } = event.data.notification;
          addToast(title, body, data);
          setSwMessages(prev => [...prev, `📨 Push notification: ${title} - ${body}`]);
        }
      };

      navigator.serviceWorker.addEventListener('message', handleSWMessage);

      return () => {
        navigator.serviceWorker.removeEventListener('message', handleSWMessage);
      };
    }
  }, []);

  const fetchPokemons = useCallback(
    async (url: string, append: boolean = false) => {
      const controller = new AbortController();
      const signal = controller.signal;

      try {
        if (append) {
          setLoadingMore(true);
        } else {
          setLoading(true);
        }
        setError(null);

        console.log("Fetching Pokemon list...");
        const response = await fetchWithRetry(url, signal);
        const pokemonsData = await response.json();
        console.log("Pokemons fetched:", pokemonsData);

        // Update next URL and hasMore state
        setNextUrl(pokemonsData.next);
        setHasMore(!!pokemonsData.next);

        // Fetch detailed data for each Pokemon with retry
        console.log("Fetching detailed Pokemon data...");
        const detailsPromises = pokemonsData.results.map(
          async (pokemon: Pokemon) => {
            const detailResponse = await fetchWithRetry(pokemon.url, signal);
            return detailResponse.json();
          }
        );

        const details = await Promise.all(detailsPromises);
        console.log("Pokemon details fetched:", details);

        if (append) {
          setPokemonDetails((prev) => [...prev, ...details]);
          setLoadingMore(false);
        } else {
          setPokemonDetails(details);
          setLoading(false);
        }
      } catch (err: Error | unknown) {
        if (append) {
          setLoadingMore(false);
        } else {
          setLoading(false);
        }

        if (err instanceof Error && err.name === "AbortError") {
          console.log("Fetch aborted");
        } else {
          const errorMessage =
            err instanceof Error ? err.message : "Unknown error occurred";
          console.error("Error fetching Pokemons:", errorMessage);
          setError(`Failed to load Pokemon data: ${errorMessage}`);
          wall.current = false; // Allow retry on error
        }
      }
    },
    []
  );

  useEffect(() => {
    if (wall.current) {
      return;
    }
    wall.current = true;
    fetchPokemons(INITIAL_URL);
  }, [retryKey, fetchPokemons]);

  // Infinite scroll observer
  const lastPokemonElementRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (loading || loadingMore) return;
      if (observer.current) observer.current.disconnect();

      observer.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMore && nextUrl) {
          fetchPokemons(nextUrl, true);
        }
      });

      if (node) observer.current.observe(node);
    },
    [loading, loadingMore, hasMore, nextUrl, fetchPokemons]
  );

  const handleRetry = () => {
    wall.current = false; // Reset wall to allow new fetch
    setPokemonDetails([]); // Clear existing data
    setError(null); // Clear error state
    setNextUrl(INITIAL_URL); // Reset to initial URL
    setHasMore(true); // Reset hasMore flag
    setRetryKey((prev) => prev + 1); // Increment retry key to trigger useEffect
  };

  return (
    <>
      {/* Service Worker Messaging Section */}
      <div className="sw-communication">
        <h3>Service Worker Communication</h3>

        {/* Push Notifications */}
        <div style={{ marginBottom: "15px", padding: "10px", backgroundColor: "var(--bg-secondary)", borderRadius: "4px" }}>
          <h4 style={{ margin: "0 0 10px 0", fontSize: "16px" }}>Push Notifications</h4>
          {!isSubscribed ? (
            <button onClick={subscribeToPushNotifications} className="sw-button">
              🔔 Subscribe to Notifications
            </button>
          ) : (
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <span style={{ color: "var(--text-secondary)", fontSize: "14px" }}>✅ Subscribed to push notifications</span>
              <button onClick={unsubscribeFromPushNotifications} className="sw-button" style={{ backgroundColor: "#ff6b6b" }}>
                🔕 Unsubscribe
              </button>
              <button onClick={testPushNotification} className="sw-button" style={{ backgroundColor: "#4caf50" }}>
                🧪 Test
              </button>
            </div>
          )}
        </div>

        {/* Message Input */}
        <div className="sw-input-group">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Enter message for service worker..."
            className="sw-input"
            onKeyPress={(e) => e.key === 'Enter' && sendMessageToSW()}
          />
          <button
            onClick={sendMessageToSW}
            disabled={!message.trim()}
            className="sw-button"
          >
            Send to SW
          </button>
        </div>

        {swMessages.length > 0 && (
          <div className="sw-messages">
            <h4>Messages:</h4>
            {swMessages.map((msg, index) => (
              <div key={index} className="sw-message-item">
                {msg}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        {loading && (
          <div className="loading-container">
            <p>Loading Pokemon data...</p>
          </div>
        )}

        {error && (
          <div className="error-container">
            <p className="error-text">{error}</p>
            <button onClick={handleRetry} className="retry-button">
              Retry
            </button>
          </div>
        )}

        {!loading &&
          !error &&
          pokemonDetails.map((pokemon, index) => {
            if (pokemonDetails.length === index + 1) {
              return (
                <PokemonCard
                  ref={lastPokemonElementRef}
                  key={pokemon.id}
                  pokemon={pokemon}
                />
              );
            } else {
              return <PokemonCard key={pokemon.id} pokemon={pokemon} />;
            }
          })}

        {loadingMore && (
          <div className="loading-container">
            <p>Loading more Pokemon...</p>
          </div>
        )}

        {!hasMore && pokemonDetails.length > 0 && (
          <div className="end-message">
            <p>You've seen all available Pokemon!</p>
          </div>
        )}
      </div>

      {/* Toast Notifications */}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className="toast">
            <div className="toast-header">
              <strong>{toast.title}</strong>
              <button
                className="toast-close"
                onClick={() => removeToast(toast.id)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="toast-body">
              {toast.body}
            </div>
            {toast.data && (
              <div className="toast-data">
                <small>Data: {JSON.stringify(toast.data, null, 2)}</small>
              </div>
            )}
            <div className="toast-timestamp">
              <small>{new Date(toast.timestamp).toLocaleTimeString()}</small>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

const PokemonCard = forwardRef<HTMLDivElement, { pokemon: PokemonDetails }>(
  ({ pokemon }, ref) => (
    <div ref={ref} className="pokemon-card">
      <h3>{pokemon.name}</h3>
      <img src={pokemon.sprites.front_default} alt={pokemon.name} />
      <p>
        <strong>ID:</strong> {pokemon.id}
      </p>
      <p>
        <strong>Height:</strong> {pokemon.height / 10} m
      </p>
      <p>
        <strong>Weight:</strong> {pokemon.weight / 10} kg
      </p>
      <p>
        <strong>Types:</strong>{" "}
        {pokemon.types.map((type) => type.type.name).join(", ")}
      </p>
    </div>
  )
);

export default App;

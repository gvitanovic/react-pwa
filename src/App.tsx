import { useEffect, useState, useRef, useCallback, forwardRef } from "react";
import "./App.css";

const INITIAL_URL = "https://pokeapi.co/api/v2/pokemon/?limit=10&offset=0";

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
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [nextUrl, setNextUrl] = useState<string | null>(INITIAL_URL);
  const [hasMore, setHasMore] = useState(true);
  const wall = useRef(false);
  const observer = useRef<IntersectionObserver | null>(null);

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
      <div>
        {loading && (
          <div style={{ textAlign: "center", padding: "20px" }}>
            <p>Loading Pokemon data...</p>
          </div>
        )}

        {error && (
          <div
            style={{
              textAlign: "center",
              padding: "20px",
              backgroundColor: "#ffebee",
              border: "1px solid #f44336",
              borderRadius: "8px",
              margin: "20px 0",
            }}
          >
            <p style={{ color: "#d32f2f", marginBottom: "10px" }}>{error}</p>
            <button
              onClick={handleRetry}
              style={{
                padding: "10px 20px",
                backgroundColor: "#f44336",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
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
          <div style={{ textAlign: "center", padding: "20px" }}>
            <p>Loading more Pokemon...</p>
          </div>
        )}

        {!hasMore && pokemonDetails.length > 0 && (
          <div style={{ textAlign: "center", padding: "20px", color: "#666" }}>
            <p>You've seen all available Pokemon!</p>
          </div>
        )}
      </div>
    </>
  );
}

const PokemonCard = forwardRef<HTMLDivElement, { pokemon: PokemonDetails }>(
  ({ pokemon }, ref) => (
    <div
      ref={ref}
      style={{
        marginBottom: "20px",
        padding: "10px",
        border: "1px solid #ccc",
        borderRadius: "8px",
      }}
    >
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

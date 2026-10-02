import { useState, type FormEvent } from "react";
import type { LatLng, PlaceSummary } from "../../shared/types";
import { MAX_STOPS } from "../../shared/types";
import { api } from "../api";

interface Props {
  addedPlaceIds: Set<string>;
  stopCount: number;
  onAdd: (place: PlaceSummary) => Promise<void>;
}

function getPosition(): Promise<LatLng> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Location isn't available in this browser"));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) =>
        reject(new Error(err.code === err.PERMISSION_DENIED ? "Location permission was denied" : "Couldn't get your location")),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  });
}

export function SearchPanel({ addedPlaceIds, stopCount, onAdd }: Props) {
  const [query, setQuery] = useState("");
  const [near, setNear] = useState<LatLng | null>(null);
  const [results, setResults] = useState<PlaceSummary[] | null>(null);
  const [hidden, setHidden] = useState(0);
  const [loading, setLoading] = useState<"text" | "near" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);

  async function run(q: string, location: LatLng | null, mode: "text" | "near") {
    setLoading(mode);
    setError(null);
    try {
      const places = await api.searchPlaces(q, location);
      // Hide anything that isn't trading (closed for good, or temporarily).
      const open = places.filter((p) => p.businessStatus === "OPERATIONAL");
      setHidden(places.length - open.length);
      setResults(open);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(null);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (query.trim()) run(query.trim(), near, "text");
  }

  async function nearMe() {
    setLoading("near");
    setError(null);
    try {
      const pos = await getPosition();
      setNear(pos);
      await run(query.trim(), pos, "near");
    } catch (err) {
      setError((err as Error).message);
      setLoading(null);
    }
  }

  async function add(place: PlaceSummary) {
    setAdding(place.id);
    try {
      await onAdd(place);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAdding(null);
    }
  }

  const full = stopCount >= MAX_STOPS;

  return (
    <section className="stack">
      <form onSubmit={submit} className="search-bar" role="search">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search pubs, e.g. The Crown, Islington"
          aria-label="Search pubs"
          enterKeyHint="search"
        />
        <button className="btn btn-primary" disabled={!query.trim() || loading !== null}>
          {loading === "text" ? "…" : "Search"}
        </button>
      </form>
      <button type="button" className="btn btn-ghost btn-block" onClick={nearMe} disabled={loading !== null}>
        📍 {loading === "near" ? "Finding pubs near you…" : query.trim() ? `"${query.trim()}" near me` : "Pubs near me"}
      </button>
      {near && <p className="muted small">Results are biased towards your current location.</p>}
      {error && <p className="error">{error}</p>}
      {full && <p className="notice">This crawl has the maximum of {MAX_STOPS} stops. Remove one to add more.</p>}

      {results && (
        <>
          {results.length === 0 ? (
            <p className="muted">No open pubs found. Try another search.</p>
          ) : (
            <ul className="results">
              {results.map((p) => {
                const added = addedPlaceIds.has(p.id);
                return (
                  <li key={p.id} className="result">
                    <div className="result-text">
                      <div className="result-name">{p.name}</div>
                      <div className="result-meta">
                        {p.typeLabel && <span className="tag">{p.typeLabel}</span>} {p.address}
                      </div>
                    </div>
                    <button
                      type="button"
                      className={`btn ${added ? "btn-done" : "btn-primary"} btn-small`}
                      disabled={added || full || adding !== null}
                      onClick={() => add(p)}
                    >
                      {added ? "Added ✓" : adding === p.id ? "…" : "+ Add"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {hidden > 0 && (
            <p className="muted small">
              {hidden} closed {hidden === 1 ? "venue" : "venues"} hidden.
            </p>
          )}
          <p className="attribution">Pub details from Google Maps</p>
        </>
      )}
    </section>
  );
}

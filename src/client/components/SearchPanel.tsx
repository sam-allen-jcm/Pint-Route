import { useState, type FormEvent } from "react";
import { distanceMeters } from "../../shared/geo";
import type { Area, LatLng, PlaceSummary } from "../../shared/types";
import { MAX_STOPS } from "../../shared/types";
import { api } from "../api";
import { formatDistance } from "../format";

interface Props {
  /** The crawl's town/country; text searches prefer results there. */
  area: Area | null;
  /** The crawl's last stop (or its meeting point): results are measured, sorted and biased from there. */
  from: { name: string; location: LatLng | null; kind: "last stop" | "meeting point" } | null;
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

/** Where result distances are measured from, and how to describe it. */
interface Origin {
  location: LatLng;
  label: string; // "you" or a pub name
}

type Result = PlaceSummary & { distance: number | null };

export function SearchPanel({ area, from, addedPlaceIds, stopCount, onAdd }: Props) {
  const [query, setQuery] = useState("");
  const [near, setNear] = useState<LatLng | null>(null);
  const [results, setResults] = useState<Result[] | null>(null);
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [hidden, setHidden] = useState(0);
  const [loading, setLoading] = useState<"text" | "near" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);

  async function run(q: string, gps: LatLng | null, mode: "text" | "near") {
    setLoading(mode);
    setError(null);
    // "Near me" measures from the user. Otherwise measure from the last stop
    // (the next pub is walked to from there), falling back to the user.
    const lastStop = from?.location ? { location: from.location, label: from.name } : null;
    const you = gps ? { location: gps, label: "you" } : null;
    const measureFrom = mode === "near" ? you : (lastStop ?? you);
    try {
      // Bias the search towards that point, else towards the crawl's town.
      const places = await api.searchPlaces(q, measureFrom?.location ?? null, measureFrom ? null : (area?.viewport ?? null));
      // Hide anything that isn't trading (closed for good, or temporarily).
      const open = places.filter((p) => p.businessStatus === "OPERATIONAL");
      const withDistance: Result[] = open.map((p) => ({
        ...p,
        distance: measureFrom && p.location ? distanceMeters(measureFrom.location, p.location) : null,
      }));
      if (measureFrom) withDistance.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
      setHidden(places.length - open.length);
      setOrigin(measureFrom);
      setResults(withDistance);
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
          placeholder="Pubs, bars, taprooms, breweries…"
          aria-label="Search pubs, bars, taprooms and breweries"
          enterKeyHint="search"
        />
        <button className="btn btn-primary" disabled={!query.trim() || loading !== null}>
          {loading === "text" ? "…" : "Search"}
        </button>
      </form>
      <button type="button" className="btn btn-ghost btn-block" onClick={nearMe} disabled={loading !== null}>
        📍 {loading === "near" ? "Finding pubs near you…" : query.trim() ? `"${query.trim()}" near me` : "Pubs, bars & breweries near me"}
      </button>
      {from?.location ? (
        <p className="muted small">
          Closest to {from.name} (your {from.kind}) first.
        </p>
      ) : near ? (
        <p className="muted small">Results are biased towards your current location.</p>
      ) : (
        area && <p className="muted small">Searching around {area.name}.</p>
      )}
      {error && <p className="error">{error}</p>}
      {full && <p className="notice">This crawl has the maximum of {MAX_STOPS} stops. Remove one to add more.</p>}

      {results && (
        <>
          {results.length === 0 ? (
            <p className="muted">Nothing open found. Try another search.</p>
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
                      {p.distance !== null && origin && (
                        <div className="result-distance">
                          📍 {formatDistance(p.distance)} from {origin.label}
                        </div>
                      )}
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

import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { LatLng, VenueSearchResult, VenueSummary } from "../../shared/types";
import { api } from "../api";
import { SiteFooter } from "../components/SiteFooter";
import { TopNav } from "../components/TopNav";
import { formatDistance } from "../format";
import { KIND_FILTERS, KIND_LABELS } from "../venues";

/** /pubs: find a pub by name, town or postcode, or near me. /pubs/:area: everything in an area. */
export function VenueSearchPage() {
  const { area } = useParams();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const kind = params.get("kind") ?? "";
  const [draft, setDraft] = useState(q);
  const [near, setNear] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const [result, setResult] = useState<VenueSearchResult | null>(null);
  const [venues, setVenues] = useState<VenueSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: key === "kind" });
  };

  useEffect(() => setDraft(q), [q]);

  // Load whenever what we're looking for changes.
  useEffect(() => {
    if (!area && !q && !near) {
      setResult(null);
      setVenues([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const load = area ? api.areaVenues(area, { kind }) : api.searchVenues({ q: near ? undefined : q, near, kind });
    load
      .then((r) => {
        if (cancelled) return;
        setResult(r);
        setVenues(r.venues);
      })
      .catch((err: Error) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [area, q, near, kind]);

  async function more() {
    if (!result || result.nextPage === null) return;
    setLoading(true);
    try {
      const r = area
        ? await api.areaVenues(area, { kind, page: result.nextPage })
        : await api.searchVenues({ q: near ? undefined : q, near, kind, page: result.nextPage });
      setResult(r);
      setVenues((list) => [...list, ...r.venues]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setNear(null);
    update("q", draft.trim());
  }

  function nearMe() {
    if (!navigator.geolocation) {
      setError("Your browser can't share your location.");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        update("q", "");
        setNear({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        setLocating(false);
        setError("We couldn't get your location. Check your browser's location permission.");
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  const title = area
    ? result?.areaName
      ? `Pubs in ${result.areaName}`
      : "Pubs in this area"
    : near
      ? "Pubs near you"
      : q
        ? `Results for "${q}"`
        : "Find a pub";

  return (
    <main className="page narrow">
      <TopNav brand />
      <header className="community-header">
        <h1>{title}</h1>
        {area && result?.total !== undefined && (
          <p className="muted small">
            {result.total} {result.total === 1 ? "venue" : "venues"}
            {" · "}
            <Link to="/pubs">Search somewhere else</Link>
          </p>
        )}
        {!area && <p className="muted small">Search every pub, bar and taproom in the UK by name, town or postcode.</p>}
      </header>

      {!area && (
        <>
          <form className="search-bar" onSubmit={submit} role="search">
            <input
              type="search"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="e.g. The Bell, Reading or RG1"
              aria-label="Pub name, town or postcode"
              maxLength={80}
            />
            <button className="btn btn-primary" disabled={!draft.trim()}>
              Search
            </button>
          </form>
          <button className="btn btn-ghost btn-block near-btn" onClick={nearMe} disabled={locating}>
            {locating ? "Finding you…" : "📍 Pubs near me"}
          </button>
        </>
      )}

      {(area || q || near) && (
        <div className="chip-row" role="group" aria-label="Type of venue">
          {KIND_FILTERS.map((k) => (
            <button
              key={k.value}
              className={`chip ${kind === k.value ? "on" : ""}`}
              aria-pressed={kind === k.value}
              onClick={() => update("kind", k.value)}
            >
              {k.label}
            </button>
          ))}
        </div>
      )}

      {error && <p className="error">{error}</p>}
      {loading && !venues.length && <p className="muted">Searching…</p>}
      {!loading && result && !venues.length && (
        <p className="muted">
          Nothing found{kind ? " of that type" : ""}.{" "}
          {area ? "" : "Try a town, a postcode like RG1, or part of the name."}
        </p>
      )}

      {venues.length > 0 && (
        <ul className="crawl-list venue-list">
          {venues.map((v) => (
            <li key={v.slug}>
              <Link to={`/v/${v.slug}`} className="crawl-link">
                <span className="crawl-link-text">
                  <span className="crawl-link-name">{v.name}</span>
                  <span className="crawl-link-detail">
                    {KIND_LABELS[v.kind]}
                    {v.town && ` · ${v.town}`}
                    {v.postcode && ` · ${v.postcode}`}
                    {v.distanceMeters !== null && ` · ${formatDistance(v.distanceMeters)} away`}
                  </span>
                </span>
                <span className="chev" aria-hidden>
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {result?.nextPage !== null && result?.nextPage !== undefined && venues.length > 0 && (
        <button className="btn btn-ghost btn-block load-more" onClick={more} disabled={loading}>
          {loading ? "Loading…" : "Show more"}
        </button>
      )}

      <p className="attribution venue-sources">
        Venue listings from the Food Standards Agency, under the Open Government Licence v3.0.
      </p>
      <SiteFooter />
    </main>
  );
}

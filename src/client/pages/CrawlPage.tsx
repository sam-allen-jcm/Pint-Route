import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { Crawl, CrawlRoute, PlaceDetails, PlaceSummary, Stop } from "../../shared/types";
import { api, ApiError } from "../api";
import { CrawlMap } from "../components/CrawlMap";
import { SearchPanel } from "../components/SearchPanel";
import { ShareSheet } from "../components/ShareSheet";
import { StopCard } from "../components/StopCard";
import { formatDistance, formatDuration } from "../format";
import { savedCrawls } from "../storage";
import { useMediaQuery } from "../useMediaQuery";
import { NotFound } from "./NotFound";

type Tab = "stops" | "map" | "add";

const hashTokens = new Map<string, string>();

/**
 * Picks up a private edit link (#edit=TOKEN), removing it from the address bar.
 * The token is held until the server confirms it, so repeated loads still see it.
 */
function editTokenFromHash(slug: string): string | null {
  const match = location.hash.match(/^#edit=([A-Za-z0-9_-]{20,})$/);
  if (match) {
    hashTokens.set(slug, match[1]);
    history.replaceState(null, "", location.pathname + location.search);
  }
  return hashTokens.get(slug) ?? null;
}

export function CrawlPage() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const wide = useMediaQuery("(min-width: 960px)");

  const [editToken, setEditToken] = useState<string | null>(() => savedCrawls.token(slug));
  const [crawl, setCrawl] = useState<Crawl | null>(null);
  const [loadError, setLoadError] = useState<ApiError | Error | null>(null);
  const [places, setPlaces] = useState<Record<string, PlaceDetails>>({});
  const [route, setRoute] = useState<CrawlRoute | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  const requestedTab = (params.get("tab") as Tab) || "stops";
  const tab: Tab = wide && requestedTab === "map" ? "stops" : requestedTab;
  const canEdit = Boolean(crawl?.canEdit && editToken);

  const setTab = (t: Tab) => setParams(t === "stops" ? {} : { tab: t }, { replace: true });

  // ---- Load the crawl (and accept a private edit link if present) ----
  const loadSeq = useRef(0);
  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    try {
      const token = editTokenFromHash(slug) ?? savedCrawls.token(slug);
      const data = await api.getCrawl(slug, token);
      if (seq !== loadSeq.current) return; // a newer load superseded this one
      hashTokens.delete(slug);
      if (data.canEdit && token) {
        savedCrawls.save(slug, data.name, token);
        setEditToken(token);
      } else if (token && !data.canEdit) {
        setEditToken(null);
      }
      setCrawl(data);
      setLoadError(null);
    } catch (err) {
      if (seq === loadSeq.current) setLoadError(err as Error);
    }
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  // ---- Fetch live place details for any stops we haven't loaded ----
  const placeIds = useMemo(() => crawl?.stops.map((s) => s.placeId) ?? [], [crawl]);
  useEffect(() => {
    const missing = [...new Set(placeIds)].filter((id) => !places[id]);
    if (!missing.length) return;
    let cancelled = false;
    api
      .getPlaces(missing)
      .then((found) => !cancelled && setPlaces((prev) => ({ ...prev, ...found })))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [placeIds, places]);

  // ---- Walking route, refreshed when the order changes ----
  const routeKey = placeIds.join(">");
  useEffect(() => {
    if (placeIds.length < 2) {
      setRoute(null);
      setRouteError(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .getRoute(slug)
        .then((r) => {
          if (cancelled) return;
          setRoute(r);
          setRouteError(null);
        })
        .catch((err: Error) => !cancelled && setRouteError(err.message));
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [slug, routeKey]);

  if (loadError) {
    return (
      <NotFound
        message={
          loadError instanceof ApiError && loadError.status === 404
            ? "This crawl doesn't exist (or it was deleted)."
            : loadError.message
        }
      />
    );
  }
  if (!crawl) {
    return (
      <main className="page center">
        <p className="muted">Loading crawl…</p>
      </main>
    );
  }

  const stops = crawl.stops;
  const visitedCount = stops.filter((s) => s.visitedOn).length;

  // ---- Edit actions ----
  async function act<T>(fn: (token: string) => Promise<T>): Promise<T | undefined> {
    if (!editToken) return;
    setActionError(null);
    try {
      return await fn(editToken);
    } catch (err) {
      setActionError((err as Error).message);
      await load();
    }
  }

  function setStops(next: Stop[]) {
    setCrawl((c) => (c ? { ...c, stops: next } : c));
  }

  async function addPlace(place: PlaceSummary) {
    if (!editToken) return;
    const stop = await api.addStop(slug, place.id, editToken);
    setCrawl((c) => (c ? { ...c, stops: [...c.stops, stop] } : c));
  }

  async function move(index: number, dir: -1 | 1) {
    const next = [...stops];
    const [item] = next.splice(index, 1);
    next.splice(index + dir, 0, item);
    setStops(next);
    const updated = await act((t) =>
      api.reorderStops(
        slug,
        next.map((s) => s.id),
        t,
      ),
    );
    if (updated) setCrawl(updated);
  }

  async function remove(stop: Stop) {
    const name = places[stop.placeId]?.name ?? "this pub";
    if (!confirm(`Remove ${name} from the crawl?`)) return;
    setStops(stops.filter((s) => s.id !== stop.id));
    await act((t) => api.removeStop(slug, stop.id, t));
  }

  async function updateStop(stop: Stop, patch: { visitedOn?: string | null; note?: string | null }) {
    if (!editToken) return;
    const updated = await api.updateStop(slug, stop.id, patch, editToken);
    setCrawl((c) => (c ? { ...c, stops: c.stops.map((s) => (s.id === updated.id ? updated : s)) } : c));
  }

  async function rename(e: FormEvent) {
    e.preventDefault();
    const name = nameDraft.trim();
    setRenaming(false);
    if (!name || name === crawl!.name) return;
    const updated = await act((t) => api.renameCrawl(slug, name, t));
    if (updated) {
      setCrawl(updated);
      savedCrawls.rename(slug, updated.name);
    }
  }

  async function deleteCrawl() {
    if (!confirm(`Delete "${crawl!.name}" for everyone? This can't be undone.`)) return;
    const ok = await act((t) => api.deleteCrawl(slug, t));
    if (ok) {
      savedCrawls.remove(slug);
      navigate("/");
    }
  }

  function legAfter(i: number) {
    if (!route || i >= stops.length - 1) return null;
    const leg = route.legs[i];
    return leg && leg.fromStopId === stops[i].id && leg.toStopId === stops[i + 1].id ? leg : null;
  }

  const stopsPanel = (
    <section className="stack">
      {stops.length === 0 ? (
        <div className="empty">
          <div className="empty-icon" aria-hidden>
            🍻
          </div>
          <p>No stops yet.</p>
          {canEdit && (
            <button className="btn btn-primary" onClick={() => setTab("add")}>
              Find pubs to add
            </button>
          )}
        </div>
      ) : (
        <ol className="stops">
          {stops.map((stop, i) => {
            const leg = legAfter(i);
            return (
              <li key={stop.id}>
                <StopCard
                  stop={stop}
                  index={i}
                  count={stops.length}
                  place={places[stop.placeId]}
                  canEdit={canEdit}
                  onMove={(dir) => move(i, dir)}
                  onRemove={() => remove(stop)}
                  onUpdate={(patch) => updateStop(stop, patch)}
                />
                {i < stops.length - 1 && (
                  <div className="leg" aria-label="Walk to next stop">
                    <span className="leg-line" aria-hidden />
                    <span className="leg-text">
                      {leg
                        ? `🚶 ${formatDuration(leg.durationSeconds)} · ${formatDistance(leg.distanceMeters)}`
                        : routeError
                          ? "🚶 walk"
                          : "🚶 …"}
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {stops.length > 0 && <p className="attribution">Pub details from Google Maps</p>}
      {canEdit && (
        <button className="text-btn danger center-self" onClick={deleteCrawl}>
          Delete this crawl
        </button>
      )}
    </section>
  );

  const map = <CrawlMap stops={stops} places={places} route={route} routeError={routeError} />;

  return (
    <div className="crawl-page">
      <header className="topbar">
        <Link to="/" className="brand" aria-label="Pint Route home">
          🍺
        </Link>
        <div className="topbar-title">
          {renaming ? (
            <form onSubmit={rename}>
              <input
                className="title-input"
                value={nameDraft}
                maxLength={80}
                autoFocus
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={rename}
                aria-label="Crawl name"
              />
            </form>
          ) : (
            <h1
              className={canEdit ? "editable" : ""}
              onClick={() => {
                if (!canEdit) return;
                setNameDraft(crawl.name);
                setRenaming(true);
              }}
              title={canEdit ? "Tap to rename" : undefined}
            >
              {crawl.name}
            </h1>
          )}
          <div className="topbar-sub">
            {stops.length} {stops.length === 1 ? "stop" : "stops"}
            {stops.length > 0 && ` · ${visitedCount} visited`}
            {route && route.legs.length > 0 && ` · ${formatDuration(route.durationSeconds)} walk`}
          </div>
        </div>
        <button className="btn btn-small btn-share" onClick={() => setSharing(true)}>
          Share
        </button>
      </header>

      {stops.length > 0 && (
        <div className="progress" aria-label={`${visitedCount} of ${stops.length} visited`}>
          <div className="progress-fill" style={{ width: `${(visitedCount / stops.length) * 100}%` }} />
        </div>
      )}

      {!canEdit && (
        <div className="banner">
          👀 You're viewing a shared crawl (read-only). <Link to="/">Plan your own</Link>
        </div>
      )}
      {actionError && (
        <div className="banner banner-error" role="alert">
          {actionError}
        </div>
      )}

      <div className={`crawl-layout ${wide ? "wide" : ""}`}>
        <main className="crawl-main">
          {tab === "add" && canEdit ? (
            <SearchPanel
              addedPlaceIds={new Set(placeIds)}
              stopCount={stops.length}
              onAdd={async (p) => {
                await addPlace(p);
              }}
            />
          ) : tab === "map" ? (
            <div className="map-tab">{map}</div>
          ) : (
            stopsPanel
          )}
        </main>
        {wide && <aside className="crawl-map">{map}</aside>}
      </div>

      <nav className="tabbar" aria-label="Crawl sections">
        <TabButton active={tab === "stops"} onClick={() => setTab("stops")} icon="📋" label="Stops" />
        {!wide && <TabButton active={tab === "map"} onClick={() => setTab("map")} icon="🗺️" label="Map" />}
        {canEdit && <TabButton active={tab === "add"} onClick={() => setTab("add")} icon="➕" label="Add pubs" />}
      </nav>

      {sharing && (
        <ShareSheet name={crawl.name} slug={slug} editToken={canEdit ? editToken : null} onClose={() => setSharing(false)} />
      )}
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: string; label: string }) {
  return (
    <button className={`tab ${active ? "tab-active" : ""}`} onClick={onClick} aria-current={active ? "page" : undefined}>
      <span className="tab-icon" aria-hidden>
        {icon}
      </span>
      {label}
    </button>
  );
}

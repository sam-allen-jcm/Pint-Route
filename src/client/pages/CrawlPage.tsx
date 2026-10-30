import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { MEETING_POINT_ID, type Crawl, type CrawlRoute, type PlaceDetails, type PlaceSummary, type RouteLeg, type Stop } from "../../shared/types";
import { api, ApiError } from "../api";
import { AreaSheet } from "../components/AreaSheet";
import { EditStops } from "../components/EditStops";
import { ScheduleEditor } from "../components/ScheduleEditor";
import { finishTime, planArrivals } from "../schedule";
import { formatClock, formatDay, parseStart } from "../../shared/hours";
import { MeetingPointSheet } from "../components/MeetingPointSheet";
import { CrawlMap } from "../components/CrawlMap";
import { SearchPanel } from "../components/SearchPanel";
import { ShareSheet } from "../components/ShareSheet";
import { SiteFooter } from "../components/SiteFooter";
import { StopCard } from "../components/StopCard";
import { useAuth } from "../auth";
import { formatDistance, formatDuration } from "../format";
import { savedCrawls } from "../storage";
import { useMediaQuery } from "../useMediaQuery";
import { NotFound } from "./NotFound";

type Tab = "stops" | "map" | "edit";

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
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [editToken, setEditToken] = useState<string | null>(() => savedCrawls.token(slug));
  const [crawl, setCrawl] = useState<Crawl | null>(null);
  const [loadError, setLoadError] = useState<ApiError | Error | null>(null);
  const [places, setPlaces] = useState<Record<string, PlaceDetails>>({});
  const [route, setRoute] = useState<CrawlRoute | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [editingArea, setEditingArea] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  // "add" was the old name of the Edit crawl tab; keep old links working.
  const tabParam = params.get("tab");
  const requestedTab: Tab = tabParam === "add" || tabParam === "edit" ? "edit" : tabParam === "map" ? "map" : "stops";
  const tab: Tab = wide && requestedTab === "map" ? "stops" : requestedTab;
  // Edit rights come from this device's edit token or from owning the crawl.
  const canEdit = Boolean(crawl?.canEdit);

  const setTab = (t: Tab) => {
    if (t === "map" && tab !== "map") api.trackEvent("map_viewed");
    if (t !== tab) window.scrollTo(0, 0); // start each tab at the top, below the pinned header
    setParams(t === "stops" ? {} : { tab: t }, { replace: true });
  };

  // ---- Load the crawl (and accept a private edit link if present) ----
  const loadSeq = useRef(0);
  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    try {
      const token = editTokenFromHash(slug) ?? savedCrawls.token(slug);
      const data = await api.getCrawl(slug, token);
      if (seq !== loadSeq.current) return; // a newer load superseded this one
      hashTokens.delete(slug);
      if (token && data.hasValidToken) {
        savedCrawls.save(slug, data.name, token);
        setEditToken(token);
      } else {
        setEditToken(null);
      }
      setCrawl(data);
      setLoadError(null);
    } catch (err) {
      if (seq === loadSeq.current) setLoadError(err as Error);
    }
    // Reload when the user logs in or out: ownership changes edit rights.
  }, [slug, userId]);

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

  // ---- Walking route, refetched whenever the stops on screen change ----
  // Includes the meeting point, so changing it refetches the route.
  const meetId = crawl?.meetingPoint?.placeId ?? "";
  const routeKey = `${meetId}|${crawl?.stops.map((s) => s.id).join(",") ?? ""}`;
  useEffect(() => {
    const [meet, ids] = routeKey.split("|");
    const stopIds = ids ? ids.split(",").map(Number) : [];
    if (stopIds.length + (meet && stopIds.length ? 1 : 0) < 2) {
      setRoute(null);
      setRouteError(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .getRoute(slug, stopIds)
        .then((r) => {
          if (cancelled) return;
          setRoute(r);
          setRouteError(null);
        })
        .catch((err: Error) => !cancelled && setRouteError(err.message));
    }, 300);
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
  // The next pub gets added after the last stop, so search results are measured from there.
  const lastStopPlace = [...stops].reverse().map((s) => places[s.placeId]).find((p) => p?.location) ?? null;
  // Before any pubs are added, measure searches from the meeting point.
  const searchFrom = lastStopPlace
    ? { name: lastStopPlace.name, location: lastStopPlace.location, kind: "last stop" as const }
    : crawl.meetingPoint?.location
      ? { name: crawl.meetingPoint.name, location: crawl.meetingPoint.location, kind: "meeting point" as const }
      : null;

  // ---- Edit actions ----
  async function act<T>(fn: (token: string | null) => Promise<T>): Promise<T | undefined> {
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

  // Only trust legs that join two stops that are still next to each other, so a
  // delete or reorder never leaves a stale line on the map while the new route loads.
  const legByPair = new Map(route?.legs.map((leg) => [`${leg.fromStopId}>${leg.toStopId}`, leg]) ?? []);
  function legAfter(i: number) {
    if (i >= stops.length - 1) return null;
    return legByPair.get(`${stops[i].id}>${stops[i + 1].id}`) ?? null;
  }
  const meeting = crawl.meetingPoint;
  // Walk from the meeting point to the first pub.
  const meetingLeg = meeting && stops.length ? (legByPair.get(`${MEETING_POINT_ID}>${stops[0].id}`) ?? null) : null;
  const currentLegs = [...(meetingLeg ? [meetingLeg] : []), ...stops.slice(0, -1).flatMap((_, i) => legAfter(i) ?? [])];
  const expectedLegs = Math.max(stops.length - 1, 0) + (meeting && stops.length ? 1 : 0);
  const routeFresh = expectedLegs > 0 && currentLegs.length === expectedLegs;
  const shownRoute: CrawlRoute | null = route
    ? {
        legs: currentLegs,
        distanceMeters: currentLegs.reduce((n, l) => n + l.distanceMeters, 0),
        durationSeconds: currentLegs.reduce((n, l) => n + l.durationSeconds, 0),
      }
    : null;

  // Estimated arrival at each stop, if the crawl has a start time.
  const timings = planArrivals(crawl.startsAt, crawl.minutesPerStop, stops, places, meetingLeg, legAfter);
  const start = parseStart(crawl.startsAt);
  const finish = finishTime(timings, crawl.minutesPerStop);
  const scheduleLine = start ? (
    <div className="schedule-line">
      📅 {formatDay(start.date)} · start {formatClock(start)}
      {finish && ` · finish ~${formatClock(finish)}`}
      {!routeFresh && stops.length > 1 && <span className="muted"> (updating…)</span>}
    </div>
  ) : null;

  const meetingSection =
    meeting ? (
      <div className="meeting">
        {meeting ? (
          <article className="stop meeting-card">
            <div className="stop-main">
              <div className="stop-num meeting-icon" aria-label="Meeting point">
                🚩
              </div>
              <div className="stop-body">
                <div className="meeting-label">Meeting point{start && ` · ${formatClock(start)}`}</div>
                <h3 className="stop-name">{meeting.name}</h3>
                {meeting.address && <div className="stop-address">{meeting.address}</div>}
                {meeting.googleMapsUri && (
                  <a className="small-link" href={meeting.googleMapsUri} target="_blank" rel="noreferrer">
                    Open in Google Maps ↗
                  </a>
                )}
              </div>
            </div>
          </article>
        ) : null}
        {meeting && stops.length > 0 && <LegRow leg={meetingLeg} failed={Boolean(routeError)} label="Walk to the first stop" />}
      </div>
    ) : null;

  const stopsPanel = (
    <section className="stack">
      {scheduleLine}
      {meetingSection}
      {stops.length === 0 ? (
        <div className="empty">
          <div className="empty-icon" aria-hidden>
            🍻
          </div>
          <p>No stops yet.</p>
          {canEdit && (
            <button className="btn btn-primary" onClick={() => setTab("edit")}>
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
                  place={places[stop.placeId]}
                  canEdit={canEdit}
                  canNote={canEdit && Boolean(user)}
                  onUpdate={(patch) => updateStop(stop, patch)}
                  timing={timings?.[i] ?? null}
                />
                {i < stops.length - 1 && <LegRow leg={leg} failed={Boolean(routeError)} />}
              </li>
            );
          })}
        </ol>
      )}
      {stops.length > 0 && <p className="attribution">Pub details from Google Maps</p>}
      {canEdit && !user && stops.length > 0 && (
        <p className="muted small center-text">
          <Link to={`/login?next=${encodeURIComponent(`/c/${slug}`)}`}>Log in</Link> to add notes to your stops.
        </p>
      )}
      <SiteFooter compact />
    </section>
  );

  const editPanel = (
    <div className="stack edit-panel">
      <ScheduleEditor crawl={crawl} editToken={editToken} onSaved={setCrawl} />
      <EditStops
        stops={stops}
        places={places}
        meetingPoint={meeting}
        startsAt={crawl.startsAt}
        onMove={move}
        onRemove={remove}
        onEditMeeting={() => setEditingMeeting(true)}
      />
      <h2 className="section-title">Add pubs</h2>
      <SearchPanel
        area={crawl.area}
        from={searchFrom}
        addedPlaceIds={new Set(placeIds)}
        stopCount={stops.length}
        onAdd={async (p) => {
          await addPlace(p);
        }}
      />
      <button className="text-btn danger center-self" onClick={deleteCrawl}>
        Delete this crawl
      </button>
    </div>
  );

  const map = (
    <CrawlMap
      stops={stops}
      places={places}
      route={shownRoute}
      routeUpdating={expectedLegs > 0 && !routeFresh && !routeError}
      meetingPoint={meeting}
      routeError={routeError}
      area={crawl.area}
    />
  );

  return (
    <div className="crawl-page">
      {/* Header and tabs stay pinned to the top (the bottom is left free for the cookie button). */}
      <div className="top-sticky">
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
              {canEdit ? (
                <button className="area-chip" onClick={() => setEditingArea(true)} title="Change town">
                  📍 {crawl.area ? (crawl.area.isCountry ? crawl.area.name : crawl.area.name.split(",")[0]) : "Set town"} ✎
                </button>
              ) : (
                crawl.area && !crawl.area.isCountry && `${crawl.area.name.split(",")[0]} · `
              )}
              {stops.length} {stops.length === 1 ? "stop" : "stops"}
              {stops.length > 0 && ` · ${visitedCount} visited`}
              {routeFresh && shownRoute && ` · ${formatDuration(shownRoute.durationSeconds)} walk`}
            </div>
          </div>
          <button className="btn btn-small btn-share" onClick={() => setSharing(true)}>
            Share
          </button>
        </header>
        <nav className="tabbar" aria-label="Crawl sections">
          <TabButton active={tab === "stops"} onClick={() => setTab("stops")} icon="📋" label="Stops" />
          {!wide && <TabButton active={tab === "map"} onClick={() => setTab("map")} icon="🗺️" label="Map" />}
          {canEdit && <TabButton active={tab === "edit"} onClick={() => setTab("edit")} icon="✏️" label="Edit crawl" />}
        </nav>
      </div>

      {stops.length > 0 && (
        <div className="progress" aria-label={`${visitedCount} of ${stops.length} visited`}>
          <div className="progress-fill" style={{ width: `${(visitedCount / stops.length) * 100}%` }} />
        </div>
      )}

      {!canEdit && (
        <div className="banner">
          👀 You're viewing a shared crawl (read-only). <Link to="/">Plan your own</Link>
          {user === null && (
            <>
              {" "}
              or <Link to={`/login?next=${encodeURIComponent(`/c/${slug}`)}`}>log in</Link> if it's yours.
            </>
          )}
        </div>
      )}
      {actionError && (
        <div className="banner banner-error" role="alert">
          {actionError}
        </div>
      )}

      <div className={`crawl-layout ${wide ? "wide" : ""}`}>
        <main className="crawl-main">
          {tab === "edit" && canEdit ? (
            editPanel
          ) : tab === "map" ? (
            <div className="map-tab">{map}</div>
          ) : (
            stopsPanel
          )}
        </main>
        {wide && <aside className="crawl-map">{map}</aside>}
      </div>


      {editingMeeting && (
        <MeetingPointSheet
          crawl={crawl}
          editToken={editToken}
          onSaved={(updated) => setCrawl(updated)}
          onClose={() => setEditingMeeting(false)}
        />
      )}
      {editingArea && (
        <AreaSheet
          crawl={crawl}
          editToken={editToken}
          onSaved={(updated) => setCrawl(updated)}
          onClose={() => setEditingArea(false)}
        />
      )}
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

function LegRow({ leg, failed, label = "Walk to next stop" }: { leg: RouteLeg | null; failed: boolean; label?: string }) {
  return (
    <div className="leg" aria-label={label}>
      <span className="leg-line" aria-hidden />
      <span className="leg-text">
        {leg
          ? `🚶 ${formatDuration(leg.durationSeconds)} · ${formatDistance(leg.distanceMeters)}${leg.direct ? " · just across the road" : ""}`
          : failed
            ? "🚶 walk"
            : "🚶 …"}
      </span>
    </div>
  );
}

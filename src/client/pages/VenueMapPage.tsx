import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AdvancedMarker, APIProvider, Map, useMap, type MapEvent } from "@vis.gl/react-google-maps";
import type { Bounds, VenueSummary } from "../../shared/types";
import { api, ApiError } from "../api";
import { MyLocationControls, MyLocationDot, useMyLocation } from "../components/MyLocation";
import { TopNav } from "../components/TopNav";
import { KIND_FILTERS, KIND_LABELS } from "../venues";

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined;
const MAP_ID = (import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined) || "DEMO_MAP_ID";
/** Middle of Great Britain, zoomed out. */
const UK = { center: { lat: 53.8, lng: -2.2 }, zoom: 6 };

/** /pubs/map: every pub on a map. Pubs load for whatever part of the map is on screen. */
export function VenueMapPage() {
  const [params, setParams] = useSearchParams();
  const area = params.get("area") ?? "";
  const kind = params.get("kind") ?? "";
  const [areaName, setAreaName] = useState<string | null>(null);
  const [areaBounds, setAreaBounds] = useState<Bounds | null>(null);

  // An area link (/pubs/map?area=reading) starts the map on that area.
  useEffect(() => {
    if (!area) return;
    api
      .areaVenues(area)
      .then((r) => {
        setAreaName(r.areaName ?? null);
        setAreaBounds(r.bounds ?? null);
      })
      .catch(() => undefined);
  }, [area]);

  const setKind = (value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set("kind", value);
    else next.delete("kind");
    setParams(next, { replace: true });
  };

  return (
    <main className="page venue-map-page">
      <TopNav brand />
      <header className="map-page-head">
        <h1>{areaName ? `Pubs in ${areaName}` : "Pub map"}</h1>
        <Link className="text-btn" to={area ? `/pubs/${area}` : "/pubs"}>
          List view
        </Link>
      </header>
      <div className="chip-row" role="group" aria-label="Type of venue">
        {KIND_FILTERS.map((k) => (
          <button
            key={k.value}
            className={`chip ${kind === k.value ? "on" : ""}`}
            aria-pressed={kind === k.value}
            onClick={() => setKind(k.value)}
          >
            {k.label}
          </button>
        ))}
      </div>
      <div className="pub-map">
        {MAPS_KEY ? (
          <APIProvider apiKey={MAPS_KEY}>
            <PubMap kind={kind} fitTo={areaBounds} />
          </APIProvider>
        ) : (
          <div className="map-missing">
            <p>
              <strong>Map unavailable.</strong> Set the <code>VITE_GOOGLE_MAPS_KEY</code> build variable to show the
              map.
            </p>
          </div>
        )}
      </div>
      <p className="attribution">
        Venue listings from the Food Standards Agency, under the Open Government Licence v3.0.
      </p>
    </main>
  );
}

function PubMap({ kind, fitTo }: { kind: string; fitTo: Bounds | null }) {
  const me = useMyLocation();
  const [venues, setVenues] = useState<VenueSummary[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "zoom" | "truncated" | "error">("zoom");
  const [selected, setSelected] = useState<VenueSummary | null>(null);
  const lastBox = useRef<google.maps.LatLngBoundsLiteral | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const seq = useRef(0);

  const load = useCallback(
    (box: google.maps.LatLngBoundsLiteral) => {
      clearTimeout(timer.current);
      // Wait until the map has settled, so a pan doesn't fire a request per frame.
      timer.current = setTimeout(() => {
        const mine = ++seq.current;
        setStatus("loading");
        api
          .venuesInBounds(box, kind)
          .then((r) => {
            if (mine !== seq.current) return;
            setVenues(r.venues);
            setStatus(r.truncated ? "truncated" : "idle");
          })
          .catch((err: Error) => {
            if (mine !== seq.current) return;
            if (err instanceof ApiError && err.code === "zoom_in") {
              setVenues([]);
              setStatus("zoom");
            } else setStatus("error");
          });
      }, 350);
    },
    [kind],
  );

  // Reload when the filter changes.
  useEffect(() => {
    if (lastBox.current) load(lastBox.current);
  }, [load]);

  const onIdle = (e: MapEvent) => {
    const b = e.map.getBounds()?.toJSON();
    if (!b) return;
    lastBox.current = b;
    load(b);
  };

  return (
    <div className="map-wrap">
      <Map
        mapId={MAP_ID}
        defaultCenter={UK.center}
        defaultZoom={UK.zoom}
        gestureHandling="greedy"
        disableDefaultUI
        zoomControl
        clickableIcons={false}
        onIdle={onIdle}
        onClick={() => setSelected(null)}
      >
        {venues.map((v) =>
          v.location ? (
            <AdvancedMarker
              key={v.slug}
              position={v.location}
              title={v.name}
              onClick={() => setSelected(v)}
              zIndex={selected?.slug === v.slug ? 1000 : undefined}
            >
              <div className={`vpin vpin-${v.kind} ${selected?.slug === v.slug ? "on" : ""}`} aria-hidden />
            </AdvancedMarker>
          ) : null,
        )}
        <MyLocationDot state={me} />
        <FitOnce bounds={fitTo} />
      </Map>
      <MyLocationControls state={me} />

      {status !== "idle" && !selected && (
        <div className="map-summary">
          {status === "loading"
            ? "Loading pubs…"
            : status === "zoom"
              ? "Zoom in to see pubs (or tap 📍 to find yourself)"
              : status === "truncated"
                ? "Lots of pubs here: zoom in to see them all"
                : "Couldn't load pubs. Move the map to try again."}
        </div>
      )}

      {selected && (
        <div className="map-card" role="dialog" aria-label={selected.name}>
          <button className="map-card-close" onClick={() => setSelected(null)} aria-label="Close">
            ✕
          </button>
          <strong className="map-card-name">{selected.name}</strong>
          <span className="muted small">
            {KIND_LABELS[selected.kind]}
            {selected.town && ` · ${selected.town}`}
            {selected.postcode && ` · ${selected.postcode}`}
          </span>
          <div className="public-actions">
            <Link className="btn btn-primary btn-small" to={`/v/${selected.slug}`}>
              View pub ›
            </Link>
            <a
              className="text-btn"
              href={`https://www.google.com/maps/dir/?${new URLSearchParams({
                api: "1",
                destination: [selected.name, selected.postcode ?? selected.town].filter(Boolean).join(", "),
                travelmode: "walking",
              })}`}
              target="_blank"
              rel="noreferrer"
            >
              Directions ↗
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

/** Fits the map to an area once it's known (e.g. "Pubs in Reading"). */
function FitOnce({ bounds }: { bounds: Bounds | null }) {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (!map || !bounds || done.current) return;
    done.current = true;
    map.fitBounds({ south: bounds.low.lat, west: bounds.low.lng, north: bounds.high.lat, east: bounds.high.lng }, 40);
  }, [map, bounds]);
  return null;
}

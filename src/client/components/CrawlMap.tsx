import { useEffect, useMemo, useState } from "react";
import { AdvancedMarker, APIProvider, InfoWindow, Map, useMap } from "@vis.gl/react-google-maps";
import type { Area, CrawlRoute, PlaceDetails, Stop } from "../../shared/types";
import { decodePolyline, formatDistance, formatDuration, statusLabel } from "../format";

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined;
// Advanced markers need a Map ID. DEMO_MAP_ID works out of the box; set
// VITE_GOOGLE_MAPS_MAP_ID to use your own styled map.
const MAP_ID = (import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined) || "DEMO_MAP_ID";
const ROUTE_COLOUR = "#b5532a";

interface Props {
  stops: Stop[];
  places: Record<string, PlaceDetails>;
  route: CrawlRoute | null;
  /** True while the route for the current stop order is still loading. */
  routeUpdating: boolean;
  routeError: string | null;
  /** The crawl's town/country: where the map starts before any stops are added. */
  area: Area | null;
}

export function CrawlMap(props: Props) {
  if (!MAPS_KEY) {
    return (
      <div className="map-missing">
        <p>
          <strong>Map unavailable.</strong> Set the <code>VITE_GOOGLE_MAPS_KEY</code> build variable to show the map.
        </p>
      </div>
    );
  }
  return (
    <APIProvider apiKey={MAPS_KEY}>
      <CrawlMapInner {...props} />
    </APIProvider>
  );
}

function CrawlMapInner({ stops, places, route, routeUpdating, routeError, area }: Props) {
  const [openStop, setOpenStop] = useState<number | null>(null);
  const located = stops.filter((s) => places[s.placeId]?.location);
  const open = located.find((s) => s.id === openStop);

  return (
    <div className="map-wrap">
      <Map
        mapId={MAP_ID}
        defaultCenter={area?.center ?? { lat: 51.5074, lng: -0.1278 }}
        defaultZoom={area ? (area.isCountry ? 5 : 13) : 13}
        gestureHandling="greedy"
        disableDefaultUI
        zoomControl
        clickableIcons={false}
        className="map"
      >
        {located.map((stop, i) => {
          const place = places[stop.placeId];
          const closed = place.businessStatus !== "OPERATIONAL";
          return (
            <AdvancedMarker
              key={stop.id}
              position={place.location!}
              title={`${stops.indexOf(stop) + 1}. ${place.name}`}
              onClick={() => setOpenStop(stop.id)}
              zIndex={100 - i}
            >
              <div className={`pin ${stop.visitedOn ? "pin-visited" : ""} ${closed ? "pin-closed" : ""}`}>
                <span>{stop.visitedOn ? "✓" : stops.indexOf(stop) + 1}</span>
              </div>
            </AdvancedMarker>
          );
        })}
        {open && (
          <InfoWindow
            position={places[open.placeId].location!}
            pixelOffset={[0, -36]}
            onCloseClick={() => setOpenStop(null)}
            headerContent={<strong>{places[open.placeId].name}</strong>}
          >
            <div className="info">
              <div>{places[open.placeId].address}</div>
              {statusLabel(places[open.placeId].businessStatus) && (
                <div className="flag-text">{statusLabel(places[open.placeId].businessStatus)}</div>
              )}
            </div>
          </InfoWindow>
        )}
        <RouteLines route={route} />
        <FitBounds points={located.map((s) => places[s.placeId].location!)} area={stops.length === 0 ? area : null} />
      </Map>
      {(routeError || routeUpdating || (route && route.legs.length > 0)) && (
        <div className="map-summary">
          {routeError ? (
            <span>{routeError}</span>
          ) : routeUpdating ? (
            <span>🚶 Updating walking route…</span>
          ) : route && route.legs.length > 0 ? (
            <span>
              🚶 <strong>{formatDuration(route.durationSeconds)}</strong> walking ·{" "}
              {formatDistance(route.distanceMeters)} · {route.legs.length} legs
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}

function RouteLines({ route }: { route: CrawlRoute | null }) {
  const map = useMap();
  // Redraw only when the set of leg polylines actually changes.
  const key = route?.legs.map((leg) => leg.polyline ?? "").join("\n") ?? "";
  useEffect(() => {
    if (!map || !key) return;
    const lines = key
      .split("\n")
      .filter(Boolean)
      .map(
        (polyline) =>
          new google.maps.Polyline({
            map,
            path: decodePolyline(polyline),
            strokeColor: ROUTE_COLOUR,
            strokeOpacity: 0,
            icons: [
              {
                icon: { path: "M 0,-1 0,1", strokeOpacity: 0.9, strokeWeight: 4, scale: 3 },
                offset: "0",
                repeat: "14px",
              },
            ],
          }),
      );
    return () => lines.forEach((l) => l.setMap(null));
  }, [map, key]);
  return null;
}

/**
 * Frames the stops; with no stops yet, frames the crawl's town or country.
 */
function FitBounds({ points, area }: { points: google.maps.LatLngLiteral[]; area: Area | null }) {
  const map = useMap();
  const key = useMemo(
    () => points.map((p) => `${p.lat},${p.lng}`).join("|") || (area ? `area:${area.placeId}` : ""),
    [points, area],
  );
  useEffect(() => {
    if (!map) return;
    if (points.length === 0) {
      if (!area) return;
      if (area.viewport) {
        map.fitBounds(
          new google.maps.LatLngBounds(
            { lat: area.viewport.low.lat, lng: area.viewport.low.lng },
            { lat: area.viewport.high.lat, lng: area.viewport.high.lng },
          ),
          0,
        );
      } else {
        map.setCenter(area.center);
        map.setZoom(area.isCountry ? 5 : 13);
      }
      return;
    }
    if (points.length === 1) {
      map.setCenter(points[0]);
      map.setZoom(16);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    points.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, 48);
  }, [map, key]);
  return null;
}

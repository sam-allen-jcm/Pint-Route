import { useEffect, useRef, useState } from "react";
import { AdvancedMarker, useMap } from "@vis.gl/react-google-maps";
import type { LatLng } from "../../shared/types";
import { api } from "../api";

interface Fix {
  position: LatLng;
  accuracy: number; // metres
}

/**
 * "Show my location": a live blue dot that moves as you walk. Uses the
 * browser's geolocation while the page is open; the position stays on the
 * device (it's never sent to our server).
 *
 * Call inside <APIProvider>; render <MyLocationDot> inside <Map> and
 * <MyLocationControls> on top of it.
 */
export function useMyLocation() {
  const map = useMap();
  const [on, setOn] = useState(false);
  const [fix, setFix] = useState<Fix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [following, setFollowing] = useState(true);
  const followingRef = useRef(true);
  followingRef.current = following;
  const firstFix = useRef(true);

  // Watch the position while switched on.
  useEffect(() => {
    if (!on) return;
    if (!navigator.geolocation) {
      setError("Location isn't available in this browser");
      setOn(false);
      return;
    }
    firstFix.current = true;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setError(null);
        setFix({ position: { lat: pos.coords.latitude, lng: pos.coords.longitude }, accuracy: pos.coords.accuracy });
      },
      (err) => {
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Location is blocked. Allow it for this site in your browser settings."
            : "Can't find your location right now",
        );
        if (err.code === err.PERMISSION_DENIED) setOn(false);
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [on]);

  // Follow the dot until the user pans the map themselves.
  useEffect(() => {
    if (!map || !fix) return;
    if (firstFix.current) {
      firstFix.current = false;
      map.panTo(fix.position);
      if ((map.getZoom() ?? 0) < 15) map.setZoom(16);
    } else if (followingRef.current) {
      map.panTo(fix.position);
    }
  }, [map, fix]);

  useEffect(() => {
    if (!map || !on) return;
    const listener = map.addListener("dragstart", () => setFollowing(false));
    return () => listener.remove();
  }, [map, on]);

  // Accuracy circle.
  useEffect(() => {
    if (!map || !on || !fix) return;
    const circle = new google.maps.Circle({
      map,
      center: fix.position,
      radius: fix.accuracy,
      strokeOpacity: 0,
      fillColor: "#4285f4",
      fillOpacity: 0.15,
      clickable: false,
    });
    return () => circle.setMap(null);
  }, [map, on, fix]);

  function toggle() {
    if (on) {
      setOn(false);
      setFix(null);
      return;
    }
    setOn(true);
    setFollowing(true);
    api.trackEvent("my_location_on");
  }

  function recentre() {
    setFollowing(true);
    if (map && fix) map.panTo(fix.position);
  }

  return { on, fix, error, following, toggle, recentre };
}

type MyLocationState = ReturnType<typeof useMyLocation>;

export function MyLocationDot({ state }: { state: MyLocationState }) {
  if (!state.on || !state.fix) return null;
  return (
    <AdvancedMarker position={state.fix.position} zIndex={300} title="You are here">
      <div className="me-dot" aria-label="Your location" />
    </AdvancedMarker>
  );
}

export function MyLocationControls({ state }: { state: MyLocationState }) {
  const { on, fix, error, following, toggle, recentre } = state;
  return (
    <>
      <div className="map-controls">
        <button
          type="button"
          className={`map-btn ${on ? "on" : ""}`}
          onClick={toggle}
          aria-pressed={on}
          title={on ? "Stop showing my location" : "Show my location"}
        >
          {on ? (fix ? "📍 Showing you" : "📍 Finding you…") : "📍 Show my location"}
        </button>
        {on && fix && !following && (
          <button type="button" className="map-btn" onClick={recentre}>
            ◎ Re-centre
          </button>
        )}
      </div>
      {error && <div className="map-error">{error}</div>}
    </>
  );
}

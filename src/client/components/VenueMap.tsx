import { AdvancedMarker, APIProvider, Map } from "@vis.gl/react-google-maps";
import type { LatLng } from "../../shared/types";

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined;
const MAP_ID = (import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined) || "DEMO_MAP_ID";

/** A small map with one pin. */
export function VenueMap({ location, name }: { location: LatLng; name: string }) {
  if (!MAPS_KEY) return null;
  return (
    <div className="venue-map">
      <APIProvider apiKey={MAPS_KEY}>
        <Map
          mapId={MAP_ID}
          defaultCenter={location}
          defaultZoom={16}
          gestureHandling="cooperative"
          disableDefaultUI
          zoomControl
          clickableIcons={false}
        >
          <AdvancedMarker position={location} title={name}>
            <div className="pin">
              <span>🍺</span>
            </div>
          </AdvancedMarker>
        </Map>
      </APIProvider>
    </div>
  );
}

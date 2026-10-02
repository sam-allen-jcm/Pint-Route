// All Google Maps Platform calls live here. The API key never leaves the Worker.
// Field masks keep every request on the cheapest SKU that covers what we show.

import type { BusinessStatus, CrawlRoute, LatLng, PlaceDetails, PlaceSummary } from "../shared/types";
import { cached } from "./cache";
import type { Env } from "./env";
import { HttpError } from "./http";

const PLACES = "https://places.googleapis.com/v1";
const ROUTES = "https://routes.googleapis.com/directions/v2:computeRoutes";

const DETAILS_TTL = 300; // 5 minutes
const SEARCH_TTL = 300;
const ROUTE_TTL = 600;
const PHOTO_TTL = 1800;

// Search: Pro SKU fields only.
const SEARCH_FIELDS = [
  "places.id",
  "places.displayName",
  "places.shortFormattedAddress",
  "places.formattedAddress",
  "places.location",
  "places.businessStatus",
  "places.primaryTypeDisplayName",
].join(",");

// Details: adds opening hours and one photo for the stop card.
const DETAILS_FIELDS = [
  "id",
  "displayName",
  "shortFormattedAddress",
  "formattedAddress",
  "location",
  "businessStatus",
  "primaryTypeDisplayName",
  "googleMapsUri",
  "utcOffsetMinutes",
  "currentOpeningHours.openNow",
  "currentOpeningHours.weekdayDescriptions",
  "photos",
].join(",");

const PLACE_ID_RE = /^[A-Za-z0-9_-]{10,400}$/;
const PHOTO_NAME_RE = /^places\/[A-Za-z0-9_-]{10,400}\/photos\/[A-Za-z0-9_-]{10,1000}$/;

export function isPlaceId(id: unknown): id is string {
  return typeof id === "string" && PLACE_ID_RE.test(id);
}

interface GPlace {
  id: string;
  displayName?: { text: string };
  shortFormattedAddress?: string;
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  businessStatus?: BusinessStatus;
  primaryTypeDisplayName?: { text: string };
  googleMapsUri?: string;
  utcOffsetMinutes?: number;
  currentOpeningHours?: { openNow?: boolean; weekdayDescriptions?: string[] };
  photos?: { name: string; authorAttributions?: { displayName: string; uri?: string }[] }[];
}

function apiKey(env: Env): string {
  if (!env.GOOGLE_PLACES_API_KEY) {
    throw new HttpError(500, "GOOGLE_PLACES_API_KEY secret is not configured");
  }
  return env.GOOGLE_PLACES_API_KEY;
}

async function google<T>(env: Env, url: string, fieldMask: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "X-Goog-Api-Key": apiKey(env),
      "X-Goog-FieldMask": fieldMask,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 404) throw new HttpError(404, "Place not found");
  if (!res.ok) {
    const text = await res.text();
    console.error(`Google API error ${res.status} for ${url}: ${text.slice(0, 500)}`);
    throw new HttpError(502, "Google Maps request failed");
  }
  return (await res.json()) as T;
}

function toSummary(p: GPlace): PlaceSummary {
  return {
    id: p.id,
    name: p.displayName?.text ?? "Unknown place",
    address: p.shortFormattedAddress ?? p.formattedAddress ?? "",
    location: p.location ? { lat: p.location.latitude, lng: p.location.longitude } : null,
    businessStatus: p.businessStatus ?? "BUSINESS_STATUS_UNSPECIFIED",
    typeLabel: p.primaryTypeDisplayName?.text ?? null,
  };
}

/** weekdayDescriptions is Monday-first; pick today's line in the place's own timezone. */
function todayLine(p: GPlace): string | null {
  const lines = p.currentOpeningHours?.weekdayDescriptions;
  if (!lines || lines.length !== 7) return null;
  const offset = p.utcOffsetMinutes ?? 0;
  const local = new Date(Date.now() + offset * 60_000);
  const mondayFirst = (local.getUTCDay() + 6) % 7;
  return lines[mondayFirst] ?? null;
}

export function searchPlaces(env: Env, query: string, near: LatLng | null): Promise<PlaceSummary[]> {
  const q = query.trim();
  const nearKey = near ? `${near.lat.toFixed(3)},${near.lng.toFixed(3)}` : "";
  return cached(`search:${q.toLowerCase()}:${nearKey}`, SEARCH_TTL, async () => {
    let data: { places?: GPlace[] };
    if (q) {
      data = await google(env, `${PLACES}/places:searchText`, SEARCH_FIELDS, {
        textQuery: q,
        // A preference, not a hard filter, so "The Crown Islington" still finds a gastropub.
        includedType: "bar",
        strictTypeFiltering: false,
        pageSize: 20,
        ...(near
          ? { locationBias: { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 5000 } } }
          : {}),
      });
    } else if (near) {
      data = await google(env, `${PLACES}/places:searchNearby`, SEARCH_FIELDS, {
        includedTypes: ["pub", "bar"],
        maxResultCount: 20,
        rankPreference: "DISTANCE",
        locationRestriction: {
          circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 1500 },
        },
      });
    } else {
      throw new HttpError(400, "Provide a search term or a location");
    }
    return (data.places ?? []).map(toSummary);
  });
}

export function getPlace(env: Env, id: string): Promise<PlaceDetails> {
  if (!isPlaceId(id)) throw new HttpError(400, "Invalid place id");
  return cached(`place:${id}`, DETAILS_TTL, async () => {
    const p = await google<GPlace>(env, `${PLACES}/places/${encodeURIComponent(id)}`, DETAILS_FIELDS);
    const photo = p.photos?.[0];
    return {
      ...toSummary(p),
      googleMapsUri: p.googleMapsUri ?? null,
      openNow: p.currentOpeningHours?.openNow ?? null,
      todayHours: todayLine(p),
      weekdayHours: p.currentOpeningHours?.weekdayDescriptions ?? [],
      photo: photo ? { name: photo.name, attributions: photo.authorAttributions ?? [] } : null,
    };
  });
}

/** Resolves a Places photo to a short-lived googleusercontent URL (no key in it). */
export async function getPhotoUri(env: Env, name: string, maxWidth: number): Promise<string> {
  if (!PHOTO_NAME_RE.test(name)) throw new HttpError(400, "Invalid photo name");
  const w = Math.min(Math.max(Math.round(maxWidth) || 400, 64), 1200);
  const { photoUri } = await cached(`photo:${name}:${w}`, PHOTO_TTL, () =>
    google<{ photoUri: string }>(env, `${PLACES}/${name}/media?maxWidthPx=${w}&skipHttpRedirect=true`, "photoUri"),
  );
  return photoUri;
}

/** Walking route through the stops, in order, via Routes API computeRoutes. */
export function walkingRoute(env: Env, stops: { id: number; placeId: string }[]): Promise<CrawlRoute> {
  if (stops.length < 2) return Promise.resolve({ legs: [], distanceMeters: 0, durationSeconds: 0 });
  const key = `route:${stops.map((s) => s.placeId).join(">")}`;
  return cached(key, ROUTE_TTL, async () => {
    const wp = (s: { placeId: string }) => ({ placeId: s.placeId });
    const data = await google<{
      routes?: {
        distanceMeters?: number;
        duration?: string;
        legs?: { distanceMeters?: number; duration?: string; polyline?: { encodedPolyline?: string } }[];
      }[];
    }>(
      env,
      ROUTES,
      "routes.distanceMeters,routes.duration,routes.legs.distanceMeters,routes.legs.duration,routes.legs.polyline.encodedPolyline",
      {
        origin: wp(stops[0]),
        destination: wp(stops[stops.length - 1]),
        intermediates: stops.slice(1, -1).map(wp),
        travelMode: "WALK",
      },
    );
    const route = data.routes?.[0];
    if (!route) throw new HttpError(422, "No walking route found between these stops");
    const secs = (d?: string) => (d ? parseInt(d, 10) || 0 : 0);
    // Cached by place sequence (shared across crawls); stop ids are attached below.
    return {
      legs: (route.legs ?? []).map((leg) => ({
        distanceMeters: leg.distanceMeters ?? 0,
        durationSeconds: secs(leg.duration),
        polyline: leg.polyline?.encodedPolyline ?? null,
      })),
      distanceMeters: route.distanceMeters ?? 0,
      durationSeconds: secs(route.duration),
    };
  }).then((r) => ({
    ...r,
    legs: r.legs.map((leg, i) => ({ ...leg, fromStopId: stops[i].id, toStopId: stops[i + 1].id })),
  }));
}

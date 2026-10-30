// All Google Maps Platform calls live here. The API key never leaves the Worker.
// Field masks keep every request on the cheapest SKU that covers what we show.

import type {
  Area,
  Bounds,
  BusinessStatus,
  CitySuggestion,
  CrawlRoute,
  LatLng,
  PlaceDetails,
  PlaceSummary,
} from "../shared/types";
import { isCountryCode } from "../shared/countries";
import { distanceMeters, encodePolyline } from "../shared/geo";
import { cached } from "./cache";
import type { Env } from "./env";
import { HttpError } from "./http";

const PLACES = "https://places.googleapis.com/v1";
const ROUTES = "https://routes.googleapis.com/directions/v2:computeRoutes";

const DETAILS_TTL = 300; // 5 minutes
const SEARCH_TTL = 300;
const ROUTE_TTL = 600;
// Bumped when the route post-processing changes, so cached routes are recomputed.
const ROUTE_VERSION = 2;
const PHOTO_TTL = 1800;

// Google place types that count as somewhere to drink. There is no "taproom"
// type: taprooms are listed as brewery, brewpub or bar.
const DRINK_TYPES = [
  "pub",
  "bar",
  "brewery",
  "brewpub",
  "beer_garden",
  "gastropub",
  "irish_pub",
  "sports_bar",
  "cocktail_bar",
  "wine_bar",
  "bar_and_grill",
  "lounge_bar",
];
const DRINK_TYPE_SET = new Set(DRINK_TYPES);
// Types requested by "near me" (a pub-crawl focused subset of DRINK_TYPES).
const NEARBY_TYPES = ["pub", "bar", "brewery", "brewpub", "beer_garden", "gastropub", "irish_pub"];

// Search: Pro SKU fields only.
const SEARCH_FIELDS = [
  "places.id",
  "places.types",
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
  types?: string[];
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

export function searchPlaces(
  env: Env,
  query: string,
  near: LatLng | null,
  bias: Bounds | null = null,
): Promise<PlaceSummary[]> {
  const q = query.trim();
  const nearKey = near ? `${near.lat.toFixed(3)},${near.lng.toFixed(3)}` : "";
  const biasKey = bias ? [bias.low.lat, bias.low.lng, bias.high.lat, bias.high.lng].map((n) => n.toFixed(2)).join(",") : "";
  const rect = (b: Bounds) => ({
    rectangle: {
      low: { latitude: b.low.lat, longitude: b.low.lng },
      high: { latitude: b.high.lat, longitude: b.high.lng },
    },
  });
  return cached(`search:${q.toLowerCase()}:${nearKey}:${biasKey}`, SEARCH_TTL, async () => {
    let data: { places?: GPlace[] };
    if (q) {
      // No type bias here: biasing towards "bar" pushes breweries and taprooms
      // out of the results. Instead, drinking spots are filtered below.
      data = await google(env, `${PLACES}/places:searchText`, SEARCH_FIELDS, {
        textQuery: q,
        pageSize: 20,
        // Prefer results near the user if we know where they are, otherwise in the
        // crawl's town/country.
        ...(near
          ? { locationBias: { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 5000 } } }
          : bias
            ? { locationBias: rect(bias) }
            : {}),
      });
    } else if (near) {
      data = await google(env, `${PLACES}/places:searchNearby`, SEARCH_FIELDS, {
        // Primary type, so hotels or cinemas that merely contain a bar are left out.
        includedPrimaryTypes: NEARBY_TYPES,
        maxResultCount: 20,
        rankPreference: "DISTANCE",
        locationRestriction: {
          circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 1500 },
        },
      });
    } else {
      throw new HttpError(400, "Provide a search term or a location");
    }
    const places = data.places ?? [];
    // Keep only drinking spots; if none match (an unusually typed venue searched
    // by name), fall back to everything Google returned.
    const drinks = places.filter((p) => p.types?.some((t) => DRINK_TYPE_SET.has(t)));
    return (drinks.length ? drinks : places).map(toSummary);
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

const DIRECT_MAX_METERS = 200;
const DIRECT_DETOUR_RATIO = 2;
const WALKING_SPEED = 1.3; // metres per second

/** Walking route through the stops, in order, via Routes API computeRoutes. */
export function walkingRoute(env: Env, stops: { id: number; placeId: string }[]): Promise<CrawlRoute> {
  if (stops.length < 2) return Promise.resolve({ legs: [], distanceMeters: 0, durationSeconds: 0 });
  const key = `route${ROUTE_VERSION}:${stops.map((s) => s.placeId).join(">")}`;
  return cached(key, ROUTE_TTL, async () => {
    const wp = (s: { placeId: string }) => ({ placeId: s.placeId });
    const data = await google<{
      routes?: {
        distanceMeters?: number;
        duration?: string;
        legs?: {
          distanceMeters?: number;
          duration?: string;
          polyline?: { encodedPolyline?: string };
          startLocation?: { latLng?: { latitude: number; longitude: number } };
          endLocation?: { latLng?: { latitude: number; longitude: number } };
        }[];
      }[];
    }>(
      env,
      ROUTES,
      "routes.legs.distanceMeters,routes.legs.duration,routes.legs.polyline.encodedPolyline,routes.legs.startLocation,routes.legs.endLocation",
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
    const ll = (p?: { latLng?: { latitude: number; longitude: number } }) =>
      p?.latLng ? { lat: p.latLng.latitude, lng: p.latLng.longitude } : null;
    // Cached by place sequence (shared across crawls); stop ids are attached below.
    const legs = (route.legs ?? []).map((leg) => {
      const routed = {
        distanceMeters: leg.distanceMeters ?? 0,
        durationSeconds: secs(leg.duration),
        polyline: leg.polyline?.encodedPolyline ?? null,
        direct: false,
      };
      // Google's walking routes only use official crossings, so two pubs facing
      // each other across a road can get a long detour. When they're very close
      // and the detour is more than double the direct distance, show the direct way.
      const from = ll(leg.startLocation);
      const to = ll(leg.endLocation);
      if (!from || !to) return routed;
      const straight = distanceMeters(from, to);
      if (straight > DIRECT_MAX_METERS || routed.distanceMeters <= straight * DIRECT_DETOUR_RATIO) return routed;
      const walked = Math.round(straight * 1.2); // allow for getting round things
      return {
        distanceMeters: walked,
        durationSeconds: Math.max(30, Math.round(walked / WALKING_SPEED)),
        polyline: encodePolyline([from, to]),
        direct: true,
      };
    });
    return {
      legs,
      distanceMeters: legs.reduce((n, l) => n + l.distanceMeters, 0),
      durationSeconds: legs.reduce((n, l) => n + l.durationSeconds, 0),
    };
  }).then((r) => ({
    ...r,
    legs: r.legs.map((leg, i) => ({ ...leg, fromStopId: stops[i].id, toStopId: stops[i + 1].id })),
  }));
}

// ---------- areas (country / town or city) ----------

const AREA_TTL = 300;
const COUNTRY_ID_TTL = 86_400; // a country's Place ID; Place IDs may be stored indefinitely
const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

/** English name for an ISO country code, or null if it isn't a real region. */
export function countryName(code: unknown): string | null {
  if (!isCountryCode(code)) return null;
  try {
    const name = regionNames.of(code);
    return name && name !== code ? name : null;
  } catch {
    return null;
  }
}

/** Town/city suggestions within one country (Places Autocomplete). */
export function suggestCities(
  env: Env,
  input: string,
  countryCode: string,
  sessionToken: string | null,
): Promise<CitySuggestion[]> {
  const q = input.trim();
  if (q.length < 2) return Promise.resolve([]);
  if (!countryName(countryCode)) throw new HttpError(400, "Unknown country");
  return cached(`cities:${countryCode}:${q.toLowerCase()}`, SEARCH_TTL, async () => {
    const data = await google<{
      suggestions?: {
        placePrediction?: {
          placeId: string;
          structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } };
          text?: { text: string };
        };
      }[];
    }>(
      env,
      `${PLACES}/places:autocomplete`,
      "suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat,suggestions.placePrediction.text",
      {
        input: q,
        includedPrimaryTypes: ["(cities)"],
        includedRegionCodes: [countryCode.toLowerCase()],
        languageCode: "en",
        ...(sessionToken ? { sessionToken } : {}),
      },
    );
    return (data.suggestions ?? []).flatMap((s) => {
      const p = s.placePrediction;
      if (!p) return [];
      return [
        {
          placeId: p.placeId,
          name: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "",
          detail: p.structuredFormat?.secondaryText?.text ?? null,
        },
      ];
    });
  });
}

/** The Place ID of a country, looked up by its English name. */
export function countryPlaceId(env: Env, countryCode: string): Promise<string | null> {
  const name = countryName(countryCode);
  if (!name) return Promise.resolve(null);
  return cached(`country:${countryCode}`, COUNTRY_ID_TTL, async () => {
    const data = await google<{ suggestions?: { placePrediction?: { placeId: string } }[] }>(
      env,
      `${PLACES}/places:autocomplete`,
      "suggestions.placePrediction.placeId",
      { input: name, includedPrimaryTypes: ["country"], includedRegionCodes: [countryCode.toLowerCase()] },
    );
    return data.suggestions?.[0]?.placePrediction?.placeId ?? null;
  });
}

interface GArea {
  id: string;
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  viewport?: { low: { latitude: number; longitude: number }; high: { latitude: number; longitude: number } };
  types?: string[];
  addressComponents?: { shortText: string; types: string[] }[];
}

/** Location, map bounds and name of an area (Place Details, Essentials fields only). */
export function getArea(
  env: Env,
  placeId: string,
  sessionToken: string | null = null,
): Promise<Area & { countryCode: string | null }> {
  if (!isPlaceId(placeId)) throw new HttpError(400, "Invalid place id");
  return cached(`area:${placeId}`, AREA_TTL, async () => {
    const qs = sessionToken ? `?sessionToken=${encodeURIComponent(sessionToken)}&languageCode=en` : "?languageCode=en";
    const p = await google<GArea>(
      env,
      `${PLACES}/places/${encodeURIComponent(placeId)}${qs}`,
      "id,formattedAddress,location,viewport,types,addressComponents",
    );
    if (!p.location) throw new HttpError(422, "That place has no location");
    const ll = (v: { latitude: number; longitude: number }) => ({ lat: v.latitude, lng: v.longitude });
    return {
      placeId: p.id,
      name: p.formattedAddress ?? "",
      center: ll(p.location),
      viewport: p.viewport ? { low: ll(p.viewport.low), high: ll(p.viewport.high) } : null,
      isCountry: Boolean(p.types?.includes("country")),
      countryCode: p.addressComponents?.find((c) => c.types.includes("country"))?.shortText ?? null,
    };
  });
}

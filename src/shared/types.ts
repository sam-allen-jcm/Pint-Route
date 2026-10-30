// Types shared by the Worker API and the React client.

export type BusinessStatus =
  | "OPERATIONAL"
  | "CLOSED_TEMPORARILY"
  | "CLOSED_PERMANENTLY"
  | "BUSINESS_STATUS_UNSPECIFIED";

export interface LatLng {
  lat: number;
  lng: number;
}

/** A search result, fetched live from Places (never stored). */
export interface PlaceSummary {
  id: string;
  name: string;
  address: string;
  location: LatLng | null;
  businessStatus: BusinessStatus;
  typeLabel: string | null;
}

export interface PhotoRef {
  /** Places photo resource name, e.g. places/XXX/photos/YYY */
  name: string;
  attributions: { displayName: string; uri?: string }[];
}

/** Live place details, fetched from Places with short-lived caching only. */
export interface PlaceDetails extends PlaceSummary {
  googleMapsUri: string | null;
  openNow: boolean | null;
  /** Today's opening hours line, e.g. "Monday: 11:00 AM – 11:00 PM" */
  todayHours: string | null;
  weekdayHours: string[];
  photo: PhotoRef | null;
}

export interface Bounds {
  low: LatLng; // south-west
  high: LatLng; // north-east
}

/** The town/city (or country) a crawl is in, resolved live from Places. */
export interface Area {
  placeId: string;
  /** e.g. "Leeds, UK" or "United Kingdom" */
  name: string;
  center: LatLng;
  viewport: Bounds | null;
  /** True for a whole country (no town/city picked). */
  isCountry: boolean;
}

/** A town/city suggestion while typing. */
export interface CitySuggestion {
  placeId: string;
  name: string;
  detail: string | null;
}

export interface Stop {
  id: number;
  placeId: string;
  position: number;
  visitedOn: string | null;
  note: string | null;
}

export interface User {
  id: number;
  email: string;
  name: string;
}

/** A crawl in the logged-in user's account list. */
export interface CrawlSummary {
  slug: string;
  name: string;
  stopCount: number;
  visitedCount: number;
  updatedAt: string;
}

export interface Crawl {
  slug: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  stops: Stop[];
  /** True when the request carried a valid edit token or comes from the owner. */
  canEdit: boolean;
  /** True when the crawl belongs to the logged-in user. */
  isOwner: boolean;
  /** True when the request's X-Edit-Token is this crawl's edit token. */
  hasValidToken: boolean;
  /** ISO country code chosen when the crawl was created (null for older crawls). */
  countryCode: string | null;
  area: Area | null;
}

export interface CreatedCrawl {
  slug: string;
  editToken: string;
}

export interface RouteLeg {
  fromStopId: number;
  toStopId: number;
  distanceMeters: number;
  durationSeconds: number;
  /** Google encoded polyline */
  polyline: string | null;
  /**
   * True when the stops are so close that Google's route (which sticks to
   * official crossings) was replaced by the direct way across.
   */
  direct: boolean;
}

export interface CrawlRoute {
  legs: RouteLeg[];
  distanceMeters: number;
  durationSeconds: number;
}

export interface StatsResponse {
  /** YYYY-MM-DD, oldest first */
  days: string[];
  totals: { users: number; crawls: number; stops: number; visited: number; shared: number };
  /** Daily counts per event, aligned with `days`. */
  series: Record<string, number[]>;
  /** What happened to crawls created in the period. */
  funnel: { created: number; withStop: number; withTwo: number; shared: number; visited: number };
  countries: { code: string; count: number }[];
  areas: { name: string; count: number }[];
}

export const MAX_STOPS = 25;

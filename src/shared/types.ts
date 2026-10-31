import type { OpeningHours } from "./hours";

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
  /** Structured opening hours, to check a future arrival time. */
  hours: OpeningHours | null;
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

/** Where the group meets before the first stop. Any kind of place. */
export interface MeetingPoint {
  placeId: string;
  name: string;
  address: string;
  location: LatLng | null;
  googleMapsUri: string | null;
}

/** RouteLeg.fromStopId for the leg from the meeting point to the first stop. */
export const MEETING_POINT_ID = 0;

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
  /** False until the emailed verification link is used; shared links stay off until then. */
  emailVerified: boolean;
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
  /** False while the owner hasn't verified their email: the share link doesn't work yet. */
  ownerVerified: boolean;
  /** True when the request's X-Edit-Token is this crawl's edit token. */
  hasValidToken: boolean;
  /** ISO country code chosen when the crawl was created (null for older crawls). */
  countryCode: string | null;
  area: Area | null;
  meetingPoint: MeetingPoint | null;
  /** Local start date/time "YYYY-MM-DDTHH:MM", or null if not set. */
  startsAt: string | null;
  /**
   * Minutes spent at each stop. When set (with a start time), each stop shows an
   * estimated arrival; when null, stops show their opening hours for the day.
   */
  minutesPerStop: number | null;
}

export interface CreatedCrawl {
  slug: string;
  editToken: string;
}

export interface RouteLeg {
  /** MEETING_POINT_ID (0) for the leg from the meeting point. */
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

/** Today's Google Maps Platform usage and daily limits, read live from Google Cloud Monitoring. */
export interface GoogleQuotaResponse {
  /** False until the GOOGLE_CLOUD_SA_KEY secret is added. */
  configured: boolean;
  /** Set when Google Cloud couldn't be read (permissions, API not enabled, …). */
  error?: string;
  projectId?: string;
  /** Google's day starts at midnight Pacific Time: this is that moment, as an ISO timestamp. */
  dayStart?: string;
  /** Daily limits, with how much of each has been used today. limit null = unlimited. */
  limits: { service: string; quota: string; limitName: string; limit: number | null; usedToday: number }[];
  /** Requests made today, per API method (including the browser's map loads). */
  requests: { service: string; method: string; count: number; errors: number }[];
}

export const MAX_STOPS = 25;

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

export interface Stop {
  id: number;
  placeId: string;
  position: number;
  visitedOn: string | null;
  note: string | null;
}

export interface Crawl {
  slug: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  stops: Stop[];
  /** True when the request carried a valid edit token. */
  canEdit: boolean;
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
}

export interface CrawlRoute {
  legs: RouteLeg[];
  distanceMeters: number;
  durationSeconds: number;
}

export const MAX_STOPS = 25;

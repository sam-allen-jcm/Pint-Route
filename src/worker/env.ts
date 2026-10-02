export interface Env {
  DB: D1Database;
  /** Secret: server-side key for Places API (New) and Routes API. */
  GOOGLE_PLACES_API_KEY: string;
  ASSETS: Fetcher;
}

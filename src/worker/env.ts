export interface Env {
  DB: D1Database;
  /** Secret: server-side key for Places API (New) and Routes API. */
  GOOGLE_PLACES_API_KEY: string;
  ASSETS: Fetcher;
  /** Rate limiters for login/register (wrangler.jsonc "ratelimits"). */
  AUTH_EMAIL_LIMITER?: RateLimit;
  AUTH_IP_LIMITER?: RateLimit;
}

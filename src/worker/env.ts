export interface Env {
  DB: D1Database;
  /** Secret: server-side key for Places API (New) and Routes API. */
  GOOGLE_PLACES_API_KEY: string;
  ASSETS: Fetcher;
  /** Rate limiters for login/register (wrangler.jsonc "ratelimits"). */
  AUTH_EMAIL_LIMITER?: RateLimit;
  AUTH_IP_LIMITER?: RateLimit;
  /** Per-IP cap on Google-backed endpoints. */
  GOOGLE_LIMITER?: RateLimit;
  /** Per-account cap on creating crawls. */
  CREATE_LIMITER?: RateLimit;
  /** Secret: Resend API key for outgoing email. */
  RESEND_API_KEY?: string;
  /**
   * Secret (optional): a Google Cloud service-account key (the whole JSON file) with the
   * "Monitoring Viewer" role, so /stats can show live Google Maps usage and daily limits.
   */
  GOOGLE_CLOUD_SA_KEY?: string;
  /** Secret: comma-separated emails allowed to open the /stats dashboard. */
  ADMIN_EMAILS?: string;
  /** Public address of the app, used in emailed links, e.g. "https://pintroute.com". */
  APP_URL?: string;
  /** Sender for outgoing email, e.g. "Pint Route <noreply@pintroute.com>". */
  EMAIL_FROM?: string;
  /** Local development only: "true" prints unsent emails to the console. */
  DEV_LOG_EMAILS?: string;
}

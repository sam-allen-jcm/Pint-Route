// Live Google Maps Platform usage and daily limits for the /stats page, read from
// Google Cloud Monitoring with a read-only service account (GOOGLE_CLOUD_SA_KEY secret).
// Only aggregate request counts are read: nothing about our users is sent to Google here.

import type { GoogleQuotaResponse } from "../shared/types";
import type { Env } from "./env";
import { toBase64Url } from "./crypto";

/** The Google APIs Pint Route uses. */
const SERVICES: Record<string, string> = {
  "places.googleapis.com": "Places API (New)",
  "routes.googleapis.com": "Routes API",
  "maps-backend.googleapis.com": "Maps JavaScript API",
};
// Cloud Monitoring filters take a list of values with one_of(...), not OR.
const SERVICE_FILTER = `one_of(${Object.keys(SERVICES)
  .map((s) => `"${s}"`)
  .join(", ")})`;

/** Anything this big is Google's way of saying "unlimited". */
const UNLIMITED = 1e15;

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

interface TimeSeries {
  metric: { labels?: Record<string, string> };
  resource: { labels?: Record<string, string> };
  points?: { value: { int64Value?: string; doubleValue?: number } }[];
}

let tokenCache: { key: string; token: string; expires: number } | null = null;
let resultCache: { expires: number; value: GoogleQuotaResponse } | null = null;

function readKey(env: Env): ServiceAccount | null {
  if (!env.GOOGLE_CLOUD_SA_KEY) return null;
  try {
    const key = JSON.parse(env.GOOGLE_CLOUD_SA_KEY) as ServiceAccount;
    return key.client_email && key.private_key && key.project_id ? key : null;
  } catch {
    return null;
  }
}

/** Swaps a signed JWT for a short-lived, read-only access token (cached ~55 minutes). */
async function accessToken(sa: ServiceAccount): Promise<string> {
  if (tokenCache && tokenCache.key === sa.client_email && tokenCache.expires > Date.now()) return tokenCache.token;

  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const now = Math.floor(Date.now() / 1000);
  const enc = (o: unknown) => toBase64Url(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = `${enc({ alg: "RS256", typ: "JWT" })}.${enc({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/monitoring.read",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })}`;
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${toBase64Url(new Uint8Array(sig))}`,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; error_description?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(`Google sign-in failed: ${data.error_description ?? res.status}. Check the service-account key.`);
  }
  tokenCache = { key: sa.client_email, token: data.access_token, expires: Date.now() + 55 * 60_000 };
  return data.access_token;
}

/** Start of Google's quota day: midnight in America/Los_Angeles. */
function pacificMidnight(now = new Date()): Date {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const elapsed = (Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second)) * 1000;
  return new Date(Math.floor((now.getTime() - elapsed) / 1000) * 1000);
}

async function listSeries(
  token: string,
  project: string,
  filter: string,
  start: Date,
  end: Date,
  aligner: string,
  reducer: string,
  groupBy: string[],
): Promise<TimeSeries[]> {
  const periodSeconds = Math.max(60, Math.ceil((end.getTime() - start.getTime()) / 1000));
  const params = new URLSearchParams({
    filter,
    "interval.startTime": start.toISOString(),
    "interval.endTime": end.toISOString(),
    "aggregation.alignmentPeriod": `${periodSeconds}s`,
    "aggregation.perSeriesAligner": aligner,
    "aggregation.crossSeriesReducer": reducer,
    view: "FULL",
  });
  groupBy.forEach((g) => params.append("aggregation.groupByFields", g));
  const out: TimeSeries[] = [];
  let pageToken = "";
  for (let page = 0; page < 10; page++) {
    if (pageToken) params.set("pageToken", pageToken);
    const res = await fetch(`https://monitoring.googleapis.com/v3/projects/${project}/timeSeries?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await res.json().catch(() => ({}))) as {
      timeSeries?: TimeSeries[];
      nextPageToken?: string;
      error?: { message?: string; status?: string };
    };
    if (!res.ok) {
      const why = data.error?.message ?? `HTTP ${res.status}`;
      throw new Error(
        res.status === 403
          ? `Google Cloud refused access (${why}). Give the service account the "Monitoring Viewer" role and enable the Cloud Monitoring API.`
          : `Google Cloud Monitoring error: ${why}`,
      );
    }
    out.push(...(data.timeSeries ?? []));
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return out;
}

const total = (s: TimeSeries) =>
  (s.points ?? []).reduce((n, p) => n + Number(p.value.int64Value ?? p.value.doubleValue ?? 0), 0);
const latest = (s: TimeSeries) => {
  const p = s.points?.[0]; // newest first
  return p ? Number(p.value.int64Value ?? p.value.doubleValue ?? 0) : 0;
};
const serviceName = (s: string) => SERVICES[s] ?? s;
/** "google.maps.places.v1.Places.SearchText" → "SearchText" */
const shortName = (s: string) => s.split(/[./]/).filter(Boolean).pop() ?? s;

export async function getGoogleQuotas(env: Env): Promise<GoogleQuotaResponse> {
  const sa = readKey(env);
  if (!sa) {
    return env.GOOGLE_CLOUD_SA_KEY
      ? {
          configured: false,
          error: "GOOGLE_CLOUD_SA_KEY isn't a valid service-account key file.",
          limits: [],
          requests: [],
        }
      : { configured: false, limits: [], requests: [] };
  }
  if (resultCache && resultCache.expires > Date.now()) return resultCache.value;

  const now = new Date();
  const dayStart = pacificMidnight(now);
  try {
    const token = await accessToken(sa);
    const project = encodeURIComponent(sa.project_id);
    // Each query stands alone, so one failing still leaves the others on the card.
    const settled = await Promise.allSettled([
      // Current limits (sampled now and then, so look back a day and take the latest).
      listSeries(
        token,
        project,
        `metric.type="serviceruntime.googleapis.com/quota/limit" AND resource.type="consumer_quota" AND resource.label.service = ${SERVICE_FILTER}`,
        new Date(now.getTime() - 25 * 3_600_000),
        now,
        "ALIGN_NEXT_OLDER",
        "REDUCE_MIN",
        ["resource.label.service", "metric.label.quota_metric", "metric.label.limit_name"],
      ),
      // Usage counted against each quota since Google's day began.
      listSeries(
        token,
        project,
        `metric.type="serviceruntime.googleapis.com/quota/rate/net_usage" AND resource.type="consumer_quota" AND resource.label.service = ${SERVICE_FILTER}`,
        dayStart,
        now,
        "ALIGN_SUM",
        "REDUCE_SUM",
        ["resource.label.service", "metric.label.quota_metric"],
      ),
      // Every request today, per method, with error counts.
      listSeries(
        token,
        project,
        `metric.type="serviceruntime.googleapis.com/api/request_count" AND resource.type="consumed_api" AND resource.label.service = ${SERVICE_FILTER}`,
        dayStart,
        now,
        "ALIGN_SUM",
        "REDUCE_SUM",
        ["resource.label.service", "resource.label.method", "metric.label.response_code_class"],
      ),
    ]);
    const failures = settled.flatMap((r) => (r.status === "rejected" ? [(r.reason as Error).message] : []));
    if (failures.length === settled.length) throw new Error(failures[0]);
    const [limitSeries, usageSeries, requestSeries] = settled.map((r) => (r.status === "fulfilled" ? r.value : []));

    const used = new Map<string, number>();
    for (const s of usageSeries) {
      used.set(`${s.resource.labels?.service}|${s.metric.labels?.quota_metric}`, total(s));
    }

    const limits = limitSeries
      .filter((s) => /day/i.test(s.metric.labels?.limit_name ?? ""))
      .map((s) => {
        const service = s.resource.labels?.service ?? "";
        const quotaMetric = s.metric.labels?.quota_metric ?? "";
        const value = latest(s);
        return {
          service: serviceName(service),
          quota: shortName(quotaMetric),
          limitName: s.metric.labels?.limit_name ?? "",
          limit: value < 0 || value >= UNLIMITED ? null : value,
          usedToday: used.get(`${service}|${quotaMetric}`) ?? 0,
        };
      })
      .sort((a, b) => a.service.localeCompare(b.service) || a.quota.localeCompare(b.quota));

    const byMethod = new Map<string, { service: string; method: string; count: number; errors: number }>();
    for (const s of requestSeries) {
      const service = serviceName(s.resource.labels?.service ?? "");
      const method = shortName(s.resource.labels?.method ?? "");
      const key = `${service}|${method}`;
      const row = byMethod.get(key) ?? { service, method, count: 0, errors: 0 };
      const n = total(s);
      row.count += n;
      if (/^[45]/.test(s.metric.labels?.response_code_class ?? "")) row.errors += n;
      byMethod.set(key, row);
    }
    const requests = [...byMethod.values()].filter((r) => r.count > 0).sort((a, b) => b.count - a.count);

    const value: GoogleQuotaResponse = {
      configured: true,
      projectId: sa.project_id,
      dayStart: dayStart.toISOString(),
      limits,
      requests,
      ...(failures.length ? { error: `Some figures are missing: ${failures.join(" / ")}` } : {}),
    };
    if (!failures.length) resultCache = { expires: Date.now() + 5 * 60_000, value };
    return value;
  } catch (err) {
    console.error("Google Cloud quota read failed", (err as Error).message);
    return { configured: true, projectId: sa.project_id, error: (err as Error).message, limits: [], requests: [] };
  }
}

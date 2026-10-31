import { MAX_STOPS, MEETING_POINT_ID, type Bounds, type LatLng } from "../shared/types";
import {
  forgotPassword,
  getUser,
  login,
  logout,
  register,
  requireUser,
  resendVerification,
  resetPassword,
  verifyEmail,
} from "./auth";
import {
  addStop,
  claimCrawls,
  listMyCrawls,
  createCrawl,
  deleteCrawl,
  getCrawl,
  getStopsForRoute,
  removeStop,
  updateCrawl,
  reorderStops,
  updateStop,
} from "./crawls";
import type { Env } from "./env";
import { getPhotoUri, getPlace, isPlaceId, searchPlaces, suggestCities, suggestPlaces, walkingRoute } from "./google";
import { HttpError, json, readJson } from "./http";
import { getStats, isAdmin, requireAdmin } from "./stats";
import { getGoogleQuotas } from "./googleCloud";
import { crawlPage } from "./sharePreview";
import { CLIENT_EVENTS, recordUsage } from "./usage";

const SLUG = "([a-z0-9]{6,32})";

function parseNear(url: URL): LatLng | null {
  const lat = url.searchParams.get("lat");
  const lng = url.searchParams.get("lng");
  if (lat === null || lng === null) return null;
  const near = { lat: Number(lat), lng: Number(lng) };
  if (!Number.isFinite(near.lat) || !Number.isFinite(near.lng) || Math.abs(near.lat) > 90 || Math.abs(near.lng) > 180) {
    throw new HttpError(400, "Invalid location");
  }
  return near;
}

/** "south,west,north,east" → Bounds */
function parseBounds(param: string | null): Bounds | null {
  if (!param) return null;
  const n = param.split(",").map(Number);
  const [s, w, no, e] = n;
  if (n.length !== 4 || !n.every(Number.isFinite) || Math.abs(s) > 90 || Math.abs(no) > 90 || s > no) {
    throw new HttpError(400, "Invalid bias");
  }
  if (Math.abs(w) > 180 || Math.abs(e) > 180) throw new HttpError(400, "Invalid bias");
  return { low: { lat: s, lng: w }, high: { lat: no, lng: e } };
}

async function handleApi(request: Request, env: Env, ctx: ExecutionContext, url: URL): Promise<Response> {
  const path = url.pathname.replace(/\/+$/, "");
  const method = request.method;
  let m: RegExpMatchArray | null;
  // Anonymous daily counts (see usage.ts); written after the response is sent.
  const track = (event: string, detail = "") => ctx.waitUntil(recordUsage(env, event, detail));

  // ---- Places (live from Google, short-lived cache) ----
  // Anything that may call Google is rate-limited per IP to protect the API bill.
  const googleBacked = path.startsWith("/api/places") || /^\/api\/crawls\/[a-z0-9]+\/(route|stops)$/.test(path);
  if (googleBacked && env.GOOGLE_LIMITER) {
    const ip = request.headers.get("CF-Connecting-IP") ?? "local";
    if (!(await env.GOOGLE_LIMITER.limit({ key: ip })).success) {
      throw new HttpError(429, "You're going a bit fast. Please wait a moment and try again.");
    }
  }
  if (path === "/api/places/search" && method === "GET") {
    const q = (url.searchParams.get("q") ?? "").slice(0, 120);
    const places = await searchPlaces(env, q, parseNear(url), parseBounds(url.searchParams.get("bias")));
    track(q ? "search" : "search_near_me");
    return json({ places });
  }
  if (path === "/api/places/cities" && method === "GET") {
    const q = (url.searchParams.get("q") ?? "").slice(0, 80);
    const country = (url.searchParams.get("country") ?? "").toUpperCase();
    const session = url.searchParams.get("session");
    const sessionToken = session && /^[A-Za-z0-9_-]{8,64}$/.test(session) ? session : null;
    return json({ cities: await suggestCities(env, q, country, sessionToken) });
  }
  if (path === "/api/places/anywhere" && method === "GET") {
    // Any kind of place, for meeting points.
    const q = (url.searchParams.get("q") ?? "").slice(0, 100);
    const country = (url.searchParams.get("country") ?? "").toUpperCase() || null;
    const session = url.searchParams.get("session");
    const sessionToken = session && /^[A-Za-z0-9_-]{8,64}$/.test(session) ? session : null;
    return json({
      places: await suggestPlaces(env, q, country, parseBounds(url.searchParams.get("bias")), sessionToken),
    });
  }
  if (path === "/api/places/photo" && method === "GET") {
    const uri = await getPhotoUri(env, url.searchParams.get("name") ?? "", Number(url.searchParams.get("w") ?? 400));
    return new Response(null, { status: 302, headers: { Location: uri, "Cache-Control": "private, max-age=600" } });
  }
  if (path === "/api/places" && method === "GET") {
    const ids = (url.searchParams.get("ids") ?? "").split(",").filter(Boolean);
    if (ids.length > MAX_STOPS || !ids.every(isPlaceId)) throw new HttpError(400, "Invalid ids");
    const results = await Promise.allSettled(ids.map((id) => getPlace(env, id)));
    const places = Object.fromEntries(
      results.flatMap((r, i) => (r.status === "fulfilled" ? [[ids[i], r.value]] : [])),
    );
    return json({ places }, { headers: { "Cache-Control": "private, max-age=120" } });
  }

  // ---- Accounts ----
  if (path === "/api/auth/register" && method === "POST") {
    const res = await register(request, env, ctx, await readJson(request));
    track("signup");
    return res;
  }
  if (path === "/api/auth/login" && method === "POST") {
    try {
      const res = await login(request, env, await readJson(request));
      track("login");
      return res;
    } catch (err) {
      if (err instanceof HttpError && err.status === 401) track("login_failed");
      throw err;
    }
  }
  if (path === "/api/auth/logout" && method === "POST") return logout(request, env);
  if (path === "/api/auth/me" && method === "GET") {
    const user = await getUser(request, env);
    return json({ user, isAdmin: isAdmin(user, env) });
  }
  if (path === "/api/auth/forgot" && method === "POST") {
    const res = await forgotPassword(request, env, ctx, await readJson(request));
    track("password_reset_requested");
    return res;
  }
  if (path === "/api/auth/verify" && method === "POST") {
    const res = await verifyEmail(env, await readJson(request));
    track("email_verified");
    return res;
  }
  if (path === "/api/auth/resend-verification" && method === "POST") {
    const res = await resendVerification(request, env, ctx);
    track("verification_resent");
    return res;
  }
  if (path === "/api/auth/reset" && method === "POST") {
    const res = await resetPassword(env, await readJson(request));
    track("password_reset_completed");
    return res;
  }
  if (path === "/api/me/crawls" && method === "GET") {
    const user = await requireUser(request, env);
    return json({ crawls: await listMyCrawls(env, user.id) });
  }
  if (path === "/api/me/claim" && method === "POST") {
    const user = await requireUser(request, env);
    return json({ claimed: await claimCrawls(env, user.id, await readJson(request)) });
  }

  // ---- Usage stats ----
  if (path === "/api/events" && method === "POST") {
    // Things only the browser sees (e.g. sharing). Unknown names are ignored.
    const body = await readJson(request);
    if (typeof body.event === "string" && CLIENT_EVENTS.has(body.event)) track(body.event);
    return new Response(null, { status: 204 });
  }
  if (path === "/api/admin/stats" && method === "GET") {
    await requireAdmin(request, env);
    const days = [7, 30, 90].includes(Number(url.searchParams.get("days"))) ? Number(url.searchParams.get("days")) : 30;
    return json(await getStats(env, days));
  }
  if (path === "/api/admin/google-quotas" && method === "GET") {
    await requireAdmin(request, env);
    return json(await getGoogleQuotas(env));
  }

  // ---- Crawls (D1) ----
  if (path === "/api/crawls" && method === "POST") {
    const body = await readJson(request);
    const creator = await getUser(request, env);
    if (creator && env.CREATE_LIMITER && !(await env.CREATE_LIMITER.limit({ key: String(creator.id) })).success) {
      throw new HttpError(429, "That's a lot of crawls! Please wait a minute before creating another.");
    }
    const created = await createCrawl(request, env, body);
    track("crawl_created", typeof body.countryCode === "string" ? body.countryCode.toUpperCase() : "");
    if (body.cityPlaceId) track("crawl_created_with_town");
    if (body.startsAt) track("crawl_created_with_start_time");
    if (await getUser(request, env)) track("crawl_created_logged_in");
    return json(created, { status: 201 });
  }
  if ((m = path.match(new RegExp(`^/api/crawls/${SLUG}$`)))) {
    const slug = m[1];
    if (method === "GET") {
      const crawl = await getCrawl(request, env, slug);
      if (!crawl.canEdit) {
        // Opened via a shared link by someone who can't edit it.
        track("shared_view");
        ctx.waitUntil(
          env.DB.prepare("UPDATE crawls SET shared_views = shared_views + 1 WHERE slug = ?")
            .bind(slug)
            .run()
            .catch(() => undefined),
        );
      }
      return json(crawl);
    }
    if (method === "PATCH") {
      const body = await readJson(request);
      await updateCrawl(request, env, slug, body);
      if ("name" in body) track("crawl_renamed");
      if ("countryCode" in body) track("crawl_area_changed");
      if ("meetPlaceId" in body) track(body.meetPlaceId ? "meeting_point_set" : "meeting_point_removed");
      if ("startsAt" in body) track(body.startsAt ? "start_time_set" : "start_time_cleared");
      return json(await getCrawl(request, env, slug));
    }
    if (method === "DELETE") {
      await deleteCrawl(request, env, slug);
      track("crawl_deleted");
      return json({ ok: true });
    }
  }
  if ((m = path.match(new RegExp(`^/api/crawls/${SLUG}/route$`))) && method === "GET") {
    const param = url.searchParams.get("stops");
    const order = param === null ? null : param.split(",").filter(Boolean).map(Number);
    if (order && (order.length > MAX_STOPS || !order.every(Number.isInteger))) throw new HttpError(400, "Invalid stops");
    // No browser caching: the route changes whenever stops change (the Worker
    // still caches Google's answer per place sequence).
    const { meetPlaceId, stops } = await getStopsForRoute(env, m[1], order, request);
    // The walk starts at the meeting point, if there is one.
    const waypoints = [...(meetPlaceId && stops.length ? [{ id: MEETING_POINT_ID, placeId: meetPlaceId }] : []), ...stops];
    return json(await walkingRoute(env, waypoints));
  }
  if ((m = path.match(new RegExp(`^/api/crawls/${SLUG}/stops$`))) && method === "POST") {
    const stop = await addStop(request, env, m[1], await readJson(request));
    track("stop_added");
    return json(stop, { status: 201 });
  }
  if ((m = path.match(new RegExp(`^/api/crawls/${SLUG}/stops/order$`))) && method === "PUT") {
    await reorderStops(request, env, m[1], await readJson(request));
    track("stops_reordered");
    return json(await getCrawl(request, env, m[1]));
  }
  if ((m = path.match(new RegExp(`^/api/crawls/${SLUG}/stops/(\\d+)$`)))) {
    const stopId = Number(m[2]);
    if (method === "PATCH") {
      const body = await readJson(request);
      const stop = await updateStop(request, env, m[1], stopId, body);
      if ("visitedOn" in body) track(body.visitedOn ? "stop_visited" : "stop_unvisited");
      if ("note" in body) track("note_saved");
      return json(stop);
    }
    if (method === "DELETE") {
      await removeStop(request, env, m[1], stopId);
      track("stop_removed");
      return json({ ok: true });
    }
  }

  throw new HttpError(404, "Not found");
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    // Shared crawl links: put the crawl's name into the link preview tags.
    const crawlPath = url.pathname.match(/^\/c\/([a-z0-9]{6,32})\/?$/);
    if (crawlPath && request.method === "GET") return crawlPage(request, env, crawlPath[1]);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    try {
      return await handleApi(request, env, ctx, url);
    } catch (err) {
      if (err instanceof HttpError) {
        return json({ error: err.message, ...(err.code ? { code: err.code } : {}) }, { status: err.status });
      }
      console.error(err);
      return json({ error: "Something went wrong" }, { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;

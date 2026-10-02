import { MAX_STOPS, type LatLng } from "../shared/types";
import {
  addStop,
  createCrawl,
  deleteCrawl,
  getCrawl,
  getStopsForRoute,
  removeStop,
  renameCrawl,
  reorderStops,
  updateStop,
} from "./crawls";
import type { Env } from "./env";
import { getPhotoUri, getPlace, isPlaceId, searchPlaces, walkingRoute } from "./google";
import { HttpError, json, readJson } from "./http";

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

async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname.replace(/\/+$/, "");
  const method = request.method;
  let m: RegExpMatchArray | null;

  // ---- Places (live from Google, short-lived cache) ----
  if (path === "/api/places/search" && method === "GET") {
    const q = (url.searchParams.get("q") ?? "").slice(0, 120);
    return json({ places: await searchPlaces(env, q, parseNear(url)) });
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

  // ---- Crawls (D1) ----
  if (path === "/api/crawls" && method === "POST") {
    return json(await createCrawl(env, await readJson(request)), { status: 201 });
  }
  if ((m = path.match(new RegExp(`^/api/crawls/${SLUG}$`)))) {
    const slug = m[1];
    if (method === "GET") return json(await getCrawl(request, env, slug));
    if (method === "PATCH") {
      await renameCrawl(request, env, slug, await readJson(request));
      return json(await getCrawl(request, env, slug));
    }
    if (method === "DELETE") {
      await deleteCrawl(request, env, slug);
      return json({ ok: true });
    }
  }
  if ((m = path.match(new RegExp(`^/api/crawls/${SLUG}/route$`))) && method === "GET") {
    const stops = await getStopsForRoute(env, m[1]);
    return json(await walkingRoute(env, stops), { headers: { "Cache-Control": "private, max-age=60" } });
  }
  if ((m = path.match(new RegExp(`^/api/crawls/${SLUG}/stops$`))) && method === "POST") {
    return json(await addStop(request, env, m[1], await readJson(request)), { status: 201 });
  }
  if ((m = path.match(new RegExp(`^/api/crawls/${SLUG}/stops/order$`))) && method === "PUT") {
    await reorderStops(request, env, m[1], await readJson(request));
    return json(await getCrawl(request, env, m[1]));
  }
  if ((m = path.match(new RegExp(`^/api/crawls/${SLUG}/stops/(\\d+)$`)))) {
    const stopId = Number(m[2]);
    if (method === "PATCH") return json(await updateStop(request, env, m[1], stopId, await readJson(request)));
    if (method === "DELETE") {
      await removeStop(request, env, m[1], stopId);
      return json({ ok: true });
    }
  }

  throw new HttpError(404, "Not found");
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    try {
      return await handleApi(request, env, url);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, { status: err.status });
      console.error(err);
      return json({ error: "Something went wrong" }, { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;

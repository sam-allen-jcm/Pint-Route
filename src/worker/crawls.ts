import { MAX_STOPS, type Area, type MeetingPoint, type Crawl, type CrawlSummary, type CreatedCrawl, type Stop } from "../shared/types";
import type { Env } from "./env";
import { countryName, countryPlaceId, getArea, getMeetingPoint, getPlace, isPlaceId } from "./google";
import { getUser } from "./auth";
import { randomToken, sha256 } from "./crypto";
import { HttpError } from "./http";

interface CrawlRow {
  id: number;
  slug: string;
  name: string;
  edit_token_hash: string;
  owner_id: number | null;
  country_code: string | null;
  area_place_id: string | null;
  meet_place_id: string | null;
  created_at: string;
  updated_at: string;
}

interface StopRow {
  id: number;
  place_id: string;
  position: number;
  visited_on: string | null;
  note: string | null;
}

const SLUG_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // no 0/o/1/l lookalikes
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function randomSlug(length = 10): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => SLUG_ALPHABET[b % SLUG_ALPHABET.length]).join("");
}

function cleanName(name: unknown): string {
  if (typeof name !== "string") throw new HttpError(400, "Name is required");
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) throw new HttpError(400, "Name is required");
  if (trimmed.length > 80) throw new HttpError(400, "Name must be 80 characters or fewer");
  return trimmed;
}

async function loadCrawl(env: Env, slug: string): Promise<CrawlRow> {
  const row = await env.DB.prepare("SELECT * FROM crawls WHERE slug = ?").bind(slug).first<CrawlRow>();
  if (!row) throw new HttpError(404, "Crawl not found");
  return row;
}

async function tokenMatches(request: Request, crawl: CrawlRow): Promise<boolean> {
  const token = request.headers.get("X-Edit-Token");
  return Boolean(token) && (await sha256(token!)) === crawl.edit_token_hash;
}

async function isOwner(request: Request, env: Env, crawl: CrawlRow): Promise<boolean> {
  if (crawl.owner_id === null) return false;
  const user = await getUser(request, env);
  return user?.id === crawl.owner_id;
}

/** Edit rights come from the private edit token, or from owning the crawl. */
async function hasEditAccess(request: Request, env: Env, crawl: CrawlRow): Promise<boolean> {
  return (await tokenMatches(request, crawl)) || (await isOwner(request, env, crawl));
}

async function requireEdit(request: Request, env: Env, slug: string): Promise<CrawlRow> {
  const crawl = await loadCrawl(env, slug);
  if (!(await hasEditAccess(request, env, crawl))) throw new HttpError(403, "This link is read-only");
  return crawl;
}

async function listStops(env: Env, crawlId: number): Promise<Stop[]> {
  const { results } = await env.DB.prepare(
    "SELECT id, place_id, position, visited_on, note FROM stops WHERE crawl_id = ? ORDER BY position, id",
  )
    .bind(crawlId)
    .all<StopRow>();
  return results.map((r) => ({
    id: r.id,
    placeId: r.place_id,
    position: r.position,
    visitedOn: r.visited_on,
    note: r.note,
  }));
}

function touch(env: Env, crawlId: number) {
  return env.DB.prepare("UPDATE crawls SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").bind(
    crawlId,
  );
}

/**
 * Works out the area to store for a new crawl: the chosen town/city (checked to
 * be in the chosen country), or else the country itself.
 */
async function resolveArea(
  env: Env,
  body: { countryCode?: unknown; cityPlaceId?: unknown; sessionToken?: unknown },
): Promise<{ countryCode: string | null; areaPlaceId: string | null }> {
  if (body.countryCode === undefined || body.countryCode === null) return { countryCode: null, areaPlaceId: null };
  const countryCode = typeof body.countryCode === "string" ? body.countryCode.toUpperCase() : "";
  if (!countryName(countryCode)) throw new HttpError(400, "Choose a country");

  const sessionToken =
    typeof body.sessionToken === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(body.sessionToken) ? body.sessionToken : null;
  if (body.cityPlaceId) {
    if (!isPlaceId(body.cityPlaceId)) throw new HttpError(400, "Invalid town or city");
    const area = await getArea(env, body.cityPlaceId, sessionToken);
    if (area.countryCode && area.countryCode !== countryCode) {
      throw new HttpError(400, "That town or city isn't in the chosen country");
    }
    return { countryCode, areaPlaceId: area.placeId };
  }
  // Country only. If Google is unavailable, still create the crawl (no area).
  const areaPlaceId = await countryPlaceId(env, countryCode).catch(() => null);
  return { countryCode, areaPlaceId };
}

export async function createCrawl(
  request: Request,
  env: Env,
  body: { name?: unknown; countryCode?: unknown; cityPlaceId?: unknown; sessionToken?: unknown },
): Promise<CreatedCrawl> {
  const name = cleanName(body.name);
  const { countryCode, areaPlaceId } = await resolveArea(env, body);
  const user = await getUser(request, env);
  const editToken = randomToken();
  const hash = await sha256(editToken);
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = randomSlug();
    try {
      await env.DB.prepare(
        "INSERT INTO crawls (slug, name, edit_token_hash, owner_id, country_code, area_place_id) VALUES (?, ?, ?, ?, ?, ?)",
      )
        .bind(slug, name, hash, user?.id ?? null, countryCode, areaPlaceId)
        .run();
      return { slug, editToken };
    } catch (err) {
      if (!String(err).includes("UNIQUE")) throw err;
    }
  }
  throw new HttpError(500, "Could not allocate a share link, please try again");
}

export async function getCrawl(request: Request, env: Env, slug: string): Promise<Crawl> {
  const crawl = await loadCrawl(env, slug);
  return {
    slug: crawl.slug,
    name: crawl.name,
    createdAt: crawl.created_at,
    updatedAt: crawl.updated_at,
    stops: await listStops(env, crawl.id),
    canEdit: await hasEditAccess(request, env, crawl),
    isOwner: await isOwner(request, env, crawl),
    hasValidToken: await tokenMatches(request, crawl),
    countryCode: crawl.country_code,
    area: await loadArea(env, crawl.area_place_id),
    meetingPoint: await loadMeetingPoint(env, crawl.meet_place_id),
  };
}

async function loadMeetingPoint(env: Env, placeId: string | null): Promise<MeetingPoint | null> {
  if (!placeId) return null;
  try {
    return await getMeetingPoint(env, placeId);
  } catch (err) {
    console.error("Could not load meeting point", placeId, err);
    return null;
  }
}

/** Live details of a crawl's area; a Google hiccup just means no area. */
async function loadArea(env: Env, placeId: string | null): Promise<Area | null> {
  if (!placeId) return null;
  try {
    const { countryCode: _, ...area } = await getArea(env, placeId);
    return area;
  } catch (err) {
    console.error("Could not load crawl area", placeId, err);
    return null;
  }
}

/** The logged-in user's crawls, most recently changed first. */
export async function listMyCrawls(env: Env, userId: number): Promise<CrawlSummary[]> {
  const { results } = await env.DB.prepare(
    `SELECT c.slug, c.name, c.updated_at,
            COUNT(s.id) AS stop_count, COUNT(s.visited_on) AS visited_count
     FROM crawls c LEFT JOIN stops s ON s.crawl_id = c.id
     WHERE c.owner_id = ?
     GROUP BY c.id
     ORDER BY c.updated_at DESC
     LIMIT 200`,
  )
    .bind(userId)
    .all<{ slug: string; name: string; updated_at: string; stop_count: number; visited_count: number }>();
  return results.map((r) => ({
    slug: r.slug,
    name: r.name,
    stopCount: r.stop_count,
    visitedCount: r.visited_count,
    updatedAt: r.updated_at,
  }));
}

/**
 * Moves crawls created on this device (proved by their edit tokens) into the
 * user's account. Crawls that already have an owner are left alone.
 */
export async function claimCrawls(env: Env, userId: number, body: { crawls?: unknown }): Promise<number> {
  const items = Array.isArray(body.crawls) ? body.crawls.slice(0, 100) : [];
  let claimed = 0;
  for (const item of items) {
    const { slug, editToken } = (item ?? {}) as { slug?: unknown; editToken?: unknown };
    if (typeof slug !== "string" || typeof editToken !== "string" || editToken.length > 100) continue;
    const res = await env.DB.prepare(
      "UPDATE crawls SET owner_id = ? WHERE slug = ? AND edit_token_hash = ? AND owner_id IS NULL",
    )
      .bind(userId, slug, await sha256(editToken))
      .run();
    claimed += res.meta.changes ?? 0;
  }
  return claimed;
}

/**
 * Stops to route through. With `order` (stop ids, as the client currently shows
 * them) the route follows exactly that sequence, so it can't lag behind a
 * delete or reorder that is still being saved. Ids must belong to this crawl.
 */
export async function getStopsForRoute(
  env: Env,
  slug: string,
  order: number[] | null,
): Promise<{ meetPlaceId: string | null; stops: Stop[] }> {
  const crawl = await loadCrawl(env, slug);
  const stops = await listStops(env, crawl.id);
  const meetPlaceId = crawl.meet_place_id;
  if (!order) return { meetPlaceId, stops };
  const byId = new Map(stops.map((s) => [s.id, s]));
  if (new Set(order).size !== order.length || !order.every((id) => byId.has(id))) {
    throw new HttpError(409, "Stop list is out of date, please refresh");
  }
  return { meetPlaceId, stops: order.map((id) => byId.get(id)!) };
}

/** Renames a crawl, changes its country/town, and/or sets or clears its meeting point. */
export async function updateCrawl(
  request: Request,
  env: Env,
  slug: string,
  body: { name?: unknown; countryCode?: unknown; cityPlaceId?: unknown; sessionToken?: unknown; meetPlaceId?: unknown },
) {
  const crawl = await requireEdit(request, env, slug);
  const sets: string[] = [];
  const values: (string | null)[] = [];
  if ("name" in body) {
    sets.push("name = ?");
    values.push(cleanName(body.name));
  }
  if ("countryCode" in body) {
    if (!body.countryCode) throw new HttpError(400, "Choose a country");
    const { countryCode, areaPlaceId } = await resolveArea(env, body);
    sets.push("country_code = ?", "area_place_id = ?");
    values.push(countryCode, areaPlaceId);
  }
  if ("meetPlaceId" in body) {
    let meet: string | null = null;
    if (body.meetPlaceId !== null) {
      if (!isPlaceId(body.meetPlaceId)) throw new HttpError(400, "Invalid meeting point");
      const sessionToken =
        typeof body.sessionToken === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(body.sessionToken)
          ? body.sessionToken
          : null;
      // Validates the place with Google (and ends the autocomplete session).
      meet = (await getMeetingPoint(env, body.meetPlaceId, sessionToken)).placeId;
    }
    sets.push("meet_place_id = ?");
    values.push(meet);
  }
  if (!sets.length) throw new HttpError(400, "Nothing to update");
  await env.DB.prepare(
    `UPDATE crawls SET ${sets.join(", ")}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
  )
    .bind(...values, crawl.id)
    .run();
}

export async function deleteCrawl(request: Request, env: Env, slug: string) {
  const crawl = await requireEdit(request, env, slug);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM stops WHERE crawl_id = ?").bind(crawl.id),
    env.DB.prepare("DELETE FROM crawls WHERE id = ?").bind(crawl.id),
  ]);
}

export async function addStop(request: Request, env: Env, slug: string, body: { placeId?: unknown }): Promise<Stop> {
  const crawl = await requireEdit(request, env, slug);
  if (!isPlaceId(body.placeId)) throw new HttpError(400, "Invalid place id");
  const placeId = body.placeId;

  const count = await env.DB.prepare("SELECT COUNT(*) AS n, COALESCE(MAX(position), -1) AS maxPos FROM stops WHERE crawl_id = ?")
    .bind(crawl.id)
    .first<{ n: number; maxPos: number }>();
  if ((count?.n ?? 0) >= MAX_STOPS) throw new HttpError(400, `A crawl can have at most ${MAX_STOPS} stops`);

  // Validates the id with Google (and warms the short-lived cache for the client).
  await getPlace(env, placeId);

  const position = (count?.maxPos ?? -1) + 1;
  const row = await env.DB.prepare(
    "INSERT INTO stops (crawl_id, place_id, position) VALUES (?, ?, ?) RETURNING id, place_id, position, visited_on, note",
  )
    .bind(crawl.id, placeId, position)
    .first<StopRow>();
  await touch(env, crawl.id).run();
  if (!row) throw new HttpError(500, "Could not add stop");
  return { id: row.id, placeId: row.place_id, position: row.position, visitedOn: row.visited_on, note: row.note };
}

export async function reorderStops(request: Request, env: Env, slug: string, body: { stopIds?: unknown }) {
  const crawl = await requireEdit(request, env, slug);
  const ids = body.stopIds;
  if (!Array.isArray(ids) || !ids.every((n) => Number.isInteger(n))) {
    throw new HttpError(400, "stopIds must be an array of stop ids");
  }
  const existing = await listStops(env, crawl.id);
  const existingIds = new Set(existing.map((s) => s.id));
  if (ids.length !== existing.length || new Set(ids).size !== ids.length || !ids.every((id) => existingIds.has(id))) {
    throw new HttpError(409, "Stop list is out of date, please refresh");
  }
  await env.DB.batch([
    ...ids.map((id, position) =>
      env.DB.prepare("UPDATE stops SET position = ? WHERE id = ? AND crawl_id = ?").bind(position, id, crawl.id),
    ),
    touch(env, crawl.id),
  ]);
}

export async function updateStop(
  request: Request,
  env: Env,
  slug: string,
  stopId: number,
  body: { visitedOn?: unknown; note?: unknown },
): Promise<Stop> {
  const crawl = await requireEdit(request, env, slug);
  const sets: string[] = [];
  const values: (string | null)[] = [];

  if ("visitedOn" in body) {
    const v = body.visitedOn;
    if (v !== null && (typeof v !== "string" || !DATE_RE.test(v) || Number.isNaN(Date.parse(v)))) {
      throw new HttpError(400, "visitedOn must be YYYY-MM-DD or null");
    }
    sets.push("visited_on = ?");
    values.push(v as string | null);
  }
  if ("note" in body) {
    const n = body.note;
    if (n !== null && typeof n !== "string") throw new HttpError(400, "note must be text or null");
    if (typeof n === "string" && n.length > 500) throw new HttpError(400, "Notes are limited to 500 characters");
    sets.push("note = ?");
    values.push(typeof n === "string" && n.trim() ? n.trim() : null);
  }
  if (!sets.length) throw new HttpError(400, "Nothing to update");

  const row = await env.DB.prepare(
    `UPDATE stops SET ${sets.join(", ")} WHERE id = ? AND crawl_id = ? RETURNING id, place_id, position, visited_on, note`,
  )
    .bind(...values, stopId, crawl.id)
    .first<StopRow>();
  if (!row) throw new HttpError(404, "Stop not found");
  await touch(env, crawl.id).run();
  return { id: row.id, placeId: row.place_id, position: row.position, visitedOn: row.visited_on, note: row.note };
}

export async function removeStop(request: Request, env: Env, slug: string, stopId: number) {
  const crawl = await requireEdit(request, env, slug);
  const res = await env.DB.prepare("DELETE FROM stops WHERE id = ? AND crawl_id = ?").bind(stopId, crawl.id).run();
  if (!res.meta.changes) throw new HttpError(404, "Stop not found");
  await touch(env, crawl.id).run();
}

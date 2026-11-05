import {
  MAX_STOPS,
  MIN_PUBLIC_STOPS,
  type CommunityCrawl,
  type CommunityPage,
  type CrawlRating,
  type Area,
  type MeetingPoint,
  type Crawl,
  type CrawlSummary,
  type CreatedCrawl,
  type Stop,
} from "../shared/types";
import type { Env } from "./env";
import { countryName, countryPlaceId, getArea, getMeetingPoint, getPlace, isPlaceId } from "./google";
import { getUser } from "./auth";
import { randomToken, sha256 } from "./crypto";
import { containsLink } from "../shared/content";
import { HttpError } from "./http";
import { isAdmin } from "./stats";

interface CrawlRow {
  id: number;
  slug: string;
  name: string;
  edit_token_hash: string;
  owner_id: number | null;
  country_code: string | null;
  area_place_id: string | null;
  meet_place_id: string | null;
  starts_at: string | null;
  minutes_per_stop: number | null;
  is_public: number;
  published_at: string | null;
  copy_count: number;
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

/** "YYYY-MM-DDTHH:MM" (a real date and time) or null. */
function cleanStartsAt(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const m = typeof v === "string" ? v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/) : null;
  if (!m) throw new HttpError(400, "Start must be a date and time");
  const [, y, mo, d, h, mi] = m.map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d, h, mi));
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d || h > 23 || mi > 59) {
    throw new HttpError(400, "Start must be a valid date and time");
  }
  if (y < 2000 || y > 2100) throw new HttpError(400, "Start date is out of range");
  return v as string;
}

function cleanMinutesPerStop(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 10 || n > 240) throw new HttpError(400, "Time per pub must be 10–240 minutes");
  return n;
}

function cleanName(name: unknown): string {
  if (typeof name !== "string") throw new HttpError(400, "Name is required");
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) throw new HttpError(400, "Name is required");
  if (trimmed.length > 80) throw new HttpError(400, "Name must be 80 characters or fewer");
  if (containsLink(trimmed)) throw new HttpError(400, "Crawl names can't contain web links");
  return trimmed;
}

async function loadCrawl(env: Env, slug: string): Promise<CrawlRow> {
  const row = await env.DB.prepare("SELECT * FROM crawls WHERE slug = ?").bind(slug).first<CrawlRow>();
  if (!row) throw new HttpError(404, "Crawl not found");
  return row;
}

/** Whether the crawl's owner has verified their email (crawls from before accounts count as verified). */
async function ownerVerified(env: Env, crawl: CrawlRow): Promise<boolean> {
  if (crawl.owner_id === null) return true;
  const row = await env.DB.prepare("SELECT email_verified_at FROM users WHERE id = ?")
    .bind(crawl.owner_id)
    .first<{ email_verified_at: string | null }>();
  return Boolean(row?.email_verified_at);
}

/**
 * Shared links only work once the owner has verified their email. Editors can
 * always see their own crawl.
 */
async function assertVisible(request: Request, env: Env, crawl: CrawlRow): Promise<boolean> {
  const verified = await ownerVerified(env, crawl);
  if (!verified && !(await hasEditAccess(request, env, crawl))) {
    throw new HttpError(403, "This crawl isn't available yet", "unverified");
  }
  return verified;
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
  body: {
    name?: unknown;
    countryCode?: unknown;
    cityPlaceId?: unknown;
    sessionToken?: unknown;
    startsAt?: unknown;
    minutesPerStop?: unknown;
  },
): Promise<CreatedCrawl> {
  const name = cleanName(body.name);
  const startsAt = cleanStartsAt(body.startsAt);
  const minutesPerStop = cleanMinutesPerStop(body.minutesPerStop);
  // An account is needed to create a crawl (keeps out spam); sharing also needs a verified email.
  const user = await getUser(request, env);
  if (!user) throw new HttpError(401, "Create a free account (or log in) to save your crawl");
  const { countryCode, areaPlaceId } = await resolveArea(env, body);
  const editToken = randomToken();
  const hash = await sha256(editToken);
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = randomSlug();
    try {
      await env.DB.prepare(
        `INSERT INTO crawls (slug, name, edit_token_hash, owner_id, country_code, area_place_id, starts_at, minutes_per_stop)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(slug, name, hash, user.id, countryCode, areaPlaceId, startsAt, minutesPerStop)
        .run();
      return { slug, editToken };
    } catch (err) {
      if (!String(err).includes("UNIQUE")) throw err;
    }
  }
  throw new HttpError(500, "Could not allocate a share link, please try again");
}

async function ratingFor(env: Env, crawl: CrawlRow, userId: number | null): Promise<CrawlRating> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS count, AVG(stars) AS average,
            (SELECT stars FROM ratings WHERE crawl_id = ? AND user_id = ?) AS mine,
            (SELECT stars FROM ratings WHERE crawl_id = ? AND user_id = ?) AS by_owner
     FROM ratings WHERE crawl_id = ?`,
  )
    .bind(crawl.id, userId ?? -1, crawl.id, crawl.owner_id ?? -1, crawl.id)
    .first<{ count: number; average: number | null; mine: number | null; by_owner: number | null }>();
  return {
    count: row?.count ?? 0,
    average: row?.average == null ? null : Math.round(row.average * 10) / 10,
    mine: row?.mine ?? null,
    byOwner: row?.by_owner ?? null,
  };
}

export async function getCrawl(request: Request, env: Env, slug: string): Promise<Crawl> {
  const crawl = await loadCrawl(env, slug);
  const verified = await assertVisible(request, env, crawl);
  const canEdit = await hasEditAccess(request, env, crawl);
  const isPublic = crawl.is_public === 1;
  let stops = await listStops(env, crawl.id);
  // On a public crawl, notes and ticked-off dates stay private to people who can edit it.
  if (isPublic && !canEdit) stops = stops.map((s) => ({ ...s, note: null, visitedOn: null }));
  const author =
    isPublic && crawl.owner_id !== null
      ? ((
          await env.DB.prepare("SELECT username FROM users WHERE id = ?")
            .bind(crawl.owner_id)
            .first<{ username: string | null }>()
        )?.username ?? null)
      : null;
  const user = await getUser(request, env);
  return {
    isPublic,
    author,
    rating: await ratingFor(env, crawl, user?.id ?? null),
    copyCount: crawl.copy_count,
    ownerVerified: verified,
    slug: crawl.slug,
    name: crawl.name,
    createdAt: crawl.created_at,
    updatedAt: crawl.updated_at,
    stops,
    canEdit,
    isOwner: await isOwner(request, env, crawl),
    hasValidToken: await tokenMatches(request, crawl),
    countryCode: crawl.country_code,
    area: await loadArea(env, crawl.area_place_id),
    meetingPoint: await loadMeetingPoint(env, crawl.meet_place_id),
    startsAt: crawl.starts_at,
    minutesPerStop: crawl.minutes_per_stop,
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
    `SELECT c.slug, c.name, c.updated_at, c.is_public,
            COUNT(s.id) AS stop_count, COUNT(s.visited_on) AS visited_count,
            (SELECT COUNT(*) FROM ratings r WHERE r.crawl_id = c.id) AS rating_count,
            (SELECT AVG(stars) FROM ratings r WHERE r.crawl_id = c.id) AS rating_average
     FROM crawls c LEFT JOIN stops s ON s.crawl_id = c.id
     WHERE c.owner_id = ?
     GROUP BY c.id
     ORDER BY c.updated_at DESC
     LIMIT 200`,
  )
    .bind(userId)
    .all<{
      slug: string;
      name: string;
      updated_at: string;
      is_public: number;
      stop_count: number;
      visited_count: number;
      rating_count: number;
      rating_average: number | null;
    }>();
  return results.map((r) => ({
    isPublic: r.is_public === 1,
    rating: {
      count: r.rating_count,
      average: r.rating_average == null ? null : Math.round(r.rating_average * 10) / 10,
    },
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
  request: Request,
): Promise<{ meetPlaceId: string | null; stops: Stop[] }> {
  const crawl = await loadCrawl(env, slug);
  await assertVisible(request, env, crawl);
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
  body: {
    name?: unknown;
    countryCode?: unknown;
    cityPlaceId?: unknown;
    sessionToken?: unknown;
    meetPlaceId?: unknown;
    startsAt?: unknown;
    minutesPerStop?: unknown;
  },
) {
  const crawl = await requireEdit(request, env, slug);
  const sets: string[] = [];
  const values: (string | number | null)[] = [];
  if ("startsAt" in body) {
    sets.push("starts_at = ?");
    values.push(cleanStartsAt(body.startsAt));
  }
  if ("minutesPerStop" in body) {
    sets.push("minutes_per_stop = ?");
    values.push(cleanMinutesPerStop(body.minutesPerStop));
  }
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
    env.DB.prepare("DELETE FROM ratings WHERE crawl_id = ?").bind(crawl.id),
    env.DB.prepare("DELETE FROM stops WHERE crawl_id = ?").bind(crawl.id),
    env.DB.prepare("DELETE FROM crawls WHERE id = ?").bind(crawl.id),
  ]);
}

export async function addStop(request: Request, env: Env, slug: string, body: { placeId?: unknown }): Promise<Stop> {
  const crawl = await requireEdit(request, env, slug);
  if (!isPlaceId(body.placeId)) throw new HttpError(400, "Invalid place id");
  const placeId = body.placeId;

  const count = await env.DB.prepare(
    "SELECT COUNT(*) AS n, COALESCE(MAX(position), -1) AS maxPos FROM stops WHERE crawl_id = ?",
  )
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
    // Notes are for logged-in users (as well as needing edit rights).
    if (!(await getUser(request, env))) throw new HttpError(401, "Log in to add notes");
    const n = body.note;
    if (n !== null && typeof n !== "string") throw new HttpError(400, "note must be text or null");
    if (typeof n === "string" && n.length > 500) throw new HttpError(400, "Notes are limited to 500 characters");
    if (typeof n === "string" && containsLink(n)) throw new HttpError(400, "Notes can't contain web links");
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

// ---------- Community: public crawls, copies and ratings ----------

/**
 * PUT /api/crawls/:slug/public { isPublic }. Only the owner (logged in, email
 * confirmed) can publish; the owner or an admin can unpublish.
 */
export async function setPublic(request: Request, env: Env, slug: string, body: { isPublic?: unknown }) {
  if (typeof body.isPublic !== "boolean") throw new HttpError(400, "isPublic must be true or false");
  const crawl = await loadCrawl(env, slug);
  const user = await getUser(request, env);
  if (!user) throw new HttpError(401, "Log in to change this");
  const owner = crawl.owner_id === user.id;
  if (!owner && !(body.isPublic === false && isAdmin(user, env))) {
    throw new HttpError(403, "Only the person who made this crawl can make it public");
  }
  if (body.isPublic) {
    if (!user.emailVerified)
      throw new HttpError(403, "Confirm your email address before making crawls public", "unverified");
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM stops WHERE crawl_id = ?")
      .bind(crawl.id)
      .first<{ n: number }>();
    if ((n?.n ?? 0) < MIN_PUBLIC_STOPS) {
      throw new HttpError(400, `Add at least ${MIN_PUBLIC_STOPS} pubs before making this crawl public`);
    }
  }
  await env.DB.prepare(
    `UPDATE crawls SET is_public = ?, published_at = CASE WHEN ? THEN COALESCE(published_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ELSE NULL END
     WHERE id = ?`,
  )
    .bind(body.isPublic ? 1 : 0, body.isPublic ? 1 : 0, crawl.id)
    .run();
}

/**
 * POST /api/crawls/:slug/copy: copies a public crawl's route (pubs, order, town,
 * meeting point) into the logged-in user's account. Notes, ticks and times aren't copied.
 */
export async function copyCrawl(request: Request, env: Env, slug: string): Promise<CreatedCrawl> {
  const user = await getUser(request, env);
  if (!user) throw new HttpError(401, "Log in to copy this crawl");
  const source = await loadCrawl(env, slug);
  const own = source.owner_id === user.id;
  if (!(source.is_public === 1 && (await ownerVerified(env, source))) && !own) {
    throw new HttpError(403, "Only public crawls can be copied");
  }
  const stops = await listStops(env, source.id);
  const editToken = randomToken();
  const hash = await sha256(editToken);
  for (let attempt = 0; attempt < 5; attempt++) {
    const newSlug = randomSlug();
    const created = await env.DB.prepare(
      `INSERT INTO crawls (slug, name, edit_token_hash, owner_id, country_code, area_place_id, meet_place_id, minutes_per_stop)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
      .bind(
        newSlug,
        source.name,
        hash,
        user.id,
        source.country_code,
        source.area_place_id,
        source.meet_place_id,
        source.minutes_per_stop,
      )
      .first<{ id: number }>()
      .catch((err) => {
        if (String(err).includes("UNIQUE")) return null;
        throw err;
      });
    if (!created) continue;
    await env.DB.batch([
      ...stops.map((s, i) =>
        env.DB.prepare("INSERT INTO stops (crawl_id, place_id, position) VALUES (?, ?, ?)").bind(
          created.id,
          s.placeId,
          i,
        ),
      ),
      ...(own ? [] : [env.DB.prepare("UPDATE crawls SET copy_count = copy_count + 1 WHERE id = ?").bind(source.id)]),
    ]);
    return { slug: newSlug, editToken };
  }
  throw new HttpError(500, "Could not allocate a share link, please try again");
}

/**
 * PUT /api/crawls/:slug/rating { stars: 1-5 | null }: logged in, email confirmed, one per account.
 * Creators may rate their own crawl; the crawl page says when the average includes it.
 */
export async function rateCrawl(
  request: Request,
  env: Env,
  slug: string,
  body: { stars?: unknown },
): Promise<CrawlRating> {
  const user = await getUser(request, env);
  if (!user) throw new HttpError(401, "Log in to rate this crawl");
  if (!user.emailVerified) throw new HttpError(403, "Confirm your email address to rate crawls", "unverified");
  const crawl = await loadCrawl(env, slug);
  if (crawl.is_public !== 1) throw new HttpError(403, "Only public crawls can be rated");
  if (body.stars === null) {
    await env.DB.prepare("DELETE FROM ratings WHERE crawl_id = ? AND user_id = ?").bind(crawl.id, user.id).run();
  } else {
    const stars = Number(body.stars);
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw new HttpError(400, "Choose 1 to 5 stars");
    await env.DB.prepare(
      `INSERT INTO ratings (crawl_id, user_id, stars) VALUES (?, ?, ?)
       ON CONFLICT (crawl_id, user_id) DO UPDATE SET stars = excluded.stars, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    )
      .bind(crawl.id, user.id, stars)
      .run();
  }
  return ratingFor(env, crawl, user.id);
}

const PAGE_SIZE = 20;

/** GET /api/community?sort=top|new&country=GB&q=&page=0 */
export async function listCommunity(env: Env, params: URLSearchParams): Promise<CommunityPage> {
  const sort = params.get("sort") === "new" ? "new" : "top";
  const country = (params.get("country") ?? "").toUpperCase();
  const q = (params.get("q") ?? "").trim().slice(0, 60);
  const page = Math.min(Math.max(Number(params.get("page")) || 0, 0), 50);
  const limit = Math.min(Math.max(Number(params.get("limit")) || PAGE_SIZE, 1), PAGE_SIZE);

  const where = [
    "c.is_public = 1",
    "u.email_verified_at IS NOT NULL",
    `(SELECT COUNT(*) FROM stops s WHERE s.crawl_id = c.id) >= ${MIN_PUBLIC_STOPS}`,
  ];
  const binds: unknown[] = [];
  if (/^[A-Z]{2}$/.test(country)) {
    where.push("c.country_code = ?");
    binds.push(country);
  }
  if (q) {
    where.push("c.name LIKE ? ESCAPE '\\'");
    binds.push(`%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  }
  // "Top": average pulled towards 3 stars until a crawl has a few ratings.
  const order =
    sort === "new"
      ? "c.published_at DESC"
      : "(COALESCE(r.total, 0) + 6.0) / (COALESCE(r.count, 0) + 2) DESC, COALESCE(r.count, 0) DESC, c.published_at DESC";
  const { results } = await env.DB.prepare(
    `SELECT c.slug, c.name, c.country_code, c.area_place_id, c.copy_count, c.published_at, u.username,
            (SELECT COUNT(*) FROM stops s WHERE s.crawl_id = c.id) AS stop_count,
            COALESCE(r.count, 0) AS rating_count, r.average AS rating_average
     FROM crawls c
     JOIN users u ON u.id = c.owner_id
     LEFT JOIN (SELECT crawl_id, COUNT(*) AS count, SUM(stars) AS total, AVG(stars) AS average FROM ratings GROUP BY crawl_id) r
       ON r.crawl_id = c.id
     WHERE ${where.join(" AND ")}
     ORDER BY ${order}
     LIMIT ? OFFSET ?`,
  )
    .bind(...binds, limit + 1, page * limit)
    .all<{
      slug: string;
      name: string;
      country_code: string | null;
      area_place_id: string | null;
      copy_count: number;
      published_at: string;
      username: string | null;
      stop_count: number;
      rating_count: number;
      rating_average: number | null;
    }>();

  const rows = results.slice(0, limit);
  // Town names come live from Google (cached), per Google's terms.
  const areaIds = [...new Set(rows.map((r) => r.area_place_id).filter((id): id is string => Boolean(id)))];
  const areas = new Map<string, string>();
  await Promise.all(
    areaIds.map(async (id) => {
      const area = await loadArea(env, id);
      // A country-only crawl's "area" is the country itself: no town to show.
      if (area && !area.isCountry) areas.set(id, area.name);
    }),
  );
  const crawls: CommunityCrawl[] = rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    author: r.username ?? "Pint Route user",
    countryCode: r.country_code,
    areaName: (r.area_place_id && areas.get(r.area_place_id)) || null,
    stopCount: r.stop_count,
    rating: {
      count: r.rating_count,
      average: r.rating_average == null ? null : Math.round(r.rating_average * 10) / 10,
    },
    copyCount: r.copy_count,
    publishedAt: r.published_at,
  }));
  return { crawls, nextPage: results.length > limit ? page + 1 : null };
}

import { MAX_STOPS, type Crawl, type CreatedCrawl, type Stop } from "../shared/types";
import type { Env } from "./env";
import { getPlace, isPlaceId } from "./google";
import { HttpError } from "./http";

interface CrawlRow {
  id: number;
  slug: string;
  name: string;
  edit_token_hash: string;
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

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
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

async function hasEditAccess(request: Request, crawl: CrawlRow): Promise<boolean> {
  const token = request.headers.get("X-Edit-Token");
  if (!token) return false;
  return (await sha256(token)) === crawl.edit_token_hash;
}

async function requireEdit(request: Request, env: Env, slug: string): Promise<CrawlRow> {
  const crawl = await loadCrawl(env, slug);
  if (!(await hasEditAccess(request, crawl))) throw new HttpError(403, "This link is read-only");
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

export async function createCrawl(env: Env, body: { name?: unknown }): Promise<CreatedCrawl> {
  const name = cleanName(body.name);
  const editToken = randomToken();
  const hash = await sha256(editToken);
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = randomSlug();
    try {
      await env.DB.prepare("INSERT INTO crawls (slug, name, edit_token_hash) VALUES (?, ?, ?)")
        .bind(slug, name, hash)
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
    canEdit: await hasEditAccess(request, crawl),
  };
}

export async function getStopsForRoute(env: Env, slug: string): Promise<Stop[]> {
  const crawl = await loadCrawl(env, slug);
  return listStops(env, crawl.id);
}

export async function renameCrawl(request: Request, env: Env, slug: string, body: { name?: unknown }) {
  const crawl = await requireEdit(request, env, slug);
  const name = cleanName(body.name);
  await env.DB.prepare(
    "UPDATE crawls SET name = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
  )
    .bind(name, crawl.id)
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

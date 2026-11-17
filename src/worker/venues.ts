// The venue directory: UK pubs, bars, taprooms and clubs.
//
// Data comes from the Food Standards Agency's food hygiene rating scheme (Open
// Government Licence v3.0), imported per council area by an admin. Each venue is
// linked to Google by Place ID the first time someone opens it, so its opening
// hours and photos can be shown live. Google's own content is never stored.

import type {
  FsaAuthority,
  LatLng,
  PlaceDetails,
  VenueDetails,
  VenueKind,
  VenueSearchResult,
  VenueMapResult,
  VenueSummary,
} from "../shared/types";
import { cached, forget } from "./cache";
import type { Env } from "./env";
import { getPlace, google } from "./google";
import { HttpError } from "./http";

const FSA_DEFAULT_BASE = "https://api.ratings.food.gov.uk";
/** FSA business type "Pub/bar/nightclub". */
const FSA_PUB_TYPE = 7843;
const FSA_PAGE_SIZE = 5000;
const PAGE_SIZE = 30;
const AREA_PAGE_SIZE = 60;
/** How long before we try matching a venue to Google again after finding nothing. */
const GOOGLE_RECHECK_DAYS = 30;

interface VenueRow {
  id: number;
  slug: string;
  name: string;
  kind: VenueKind;
  address: string;
  town: string | null;
  town_slug: string | null;
  postcode: string | null;
  outcode: string | null;
  local_authority: string | null;
  lat: number | null;
  lng: number | null;
  fsa_id: number | null;
  hygiene_rating: string | null;
  hygiene_rating_date: string | null;
  google_place_id: string | null;
  google_checked_at: string | null;
  status: string;
}

// ---------- tidying the FSA's data ----------

const SMALL_WORDS = new Set(["a", "an", "and", "at", "by", "for", "in", "of", "on", "the", "to", "upon", "under"]);

/** "THE KINGS ARMS" → "The Kings Arms". Leaves mixed-case names alone. */
export function tidyName(raw: string): string {
  let name = raw.trim().replace(/\s+/g, " ");
  // "Crown (The)" / "Crown, The" → "The Crown"
  const the = name.match(/^(.*?)[\s,]*\(?\bthe\)?$/i);
  if (the && the[1] && /\(the\)$|,\s*the$/i.test(name)) name = `The ${the[1]}`;
  if (name === name.toUpperCase() && /[A-Z]/.test(name)) {
    name = name
      .toLowerCase()
      .split(" ")
      .map((w, i) => {
        if (i > 0 && SMALL_WORDS.has(w)) return w;
        return w.replace(/(^|[-(/'’.&])([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase());
      })
      .join(" ")
      // "King'S" → "King's"
      .replace(/(['’])S\b/g, "$1s");
  }
  return name;
}

const COUNTIES = new Set(
  [
    "bedfordshire",
    "berkshire",
    "buckinghamshire",
    "cambridgeshire",
    "cheshire",
    "cornwall",
    "cumbria",
    "derbyshire",
    "devon",
    "dorset",
    "durham",
    "county durham",
    "east sussex",
    "essex",
    "gloucestershire",
    "hampshire",
    "herefordshire",
    "hertfordshire",
    "kent",
    "lancashire",
    "leicestershire",
    "lincolnshire",
    "norfolk",
    "northamptonshire",
    "northumberland",
    "nottinghamshire",
    "oxfordshire",
    "rutland",
    "shropshire",
    "somerset",
    "staffordshire",
    "suffolk",
    "surrey",
    "warwickshire",
    "west sussex",
    "wiltshire",
    "worcestershire",
    "north yorkshire",
    "east yorkshire",
    "west yorkshire",
    "south yorkshire",
    "east riding of yorkshire",
    "greater london",
    "greater manchester",
    "merseyside",
    "tyne and wear",
    "west midlands",
    "isle of wight",
    "middlesex",
    "london",
    "england",
    "wales",
    "scotland",
    "united kingdom",
    "uk",
    "gwynedd",
    "powys",
    "dyfed",
    "gwent",
    "clwyd",
    "glamorgan",
    "south glamorgan",
    "mid glamorgan",
    "west glamorgan",
    "fife",
    "lothian",
    "strathclyde",
    "highland",
    "grampian",
    "tayside",
    "county antrim",
    "county down",
    "co antrim",
    "co down",
    "northern ireland",
  ].map((c) => c.toLowerCase()),
);

function titleIfUpper(s: string): string {
  return s === s.toUpperCase() && /[A-Z]/.test(s) ? tidyName(s) : s;
}

/** The town from the FSA's free-form address lines (they vary a lot). */
function pickTown(lines: string[], authority: string | null): string | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (COUNTIES.has(line.toLowerCase())) continue;
    // A street, not a town.
    if (
      /\d/.test(line) ||
      /\b(road|street|lane|avenue|square|place|parade|hill|way|row|terrace|walk|close|green)\b/i.test(line)
    ) {
      continue;
    }
    if (i === 0 && lines.length > 1) break; // line 1 is usually the building or street
    return titleIfUpper(line);
  }
  return authority
    ? authority
        .replace(/\b(City|Borough|District|County|Metropolitan|Council|of)\b/gi, "")
        .replace(/\s+/g, " ")
        .trim() || authority
    : null;
}

/** Best guess from the name. Admins (and later owners) can correct it. */
export function guessKind(name: string): VenueKind {
  const n = name.toLowerCase();
  if (/\bnight ?club\b/.test(n)) return "nightclub";
  if (
    /\b(cricket|rugby|football|golf|tennis|bowls|bowling|hockey|sports?|social|working ?men'?s|conservative|labour|liberal|legion|rfc|sailing|rowing|yacht|scouts?|church|village hall|community (centre|center|hall)|memorial hall|parish|theatre|cinema|university|students'? union|college|school|bingo|casino|masonic|veterans|servicemen'?s|members)\b/.test(
      n,
    ) ||
    /\b(fc|cc|afc)$/.test(n) ||
    /\bclub\b/.test(n)
  ) {
    return "club";
  }
  if (/\b(tap ?room|tap ?house|brewery|brewing|brew ?co|brewpub|brew ?house)\b/.test(n)) return "taproom";
  if (/\b(bar|lounge|cocktails?|wine bar)\b/.test(n)) return "bar";
  return "pub";
}

function slugify(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
}

function normalisePostcode(pc: string | null | undefined): { postcode: string | null; outcode: string | null } {
  const compact = (pc ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (compact.length < 5 || compact.length > 7) return { postcode: pc?.trim() || null, outcode: null };
  const outcode = compact.slice(0, -3);
  return { postcode: `${outcode} ${compact.slice(-3)}`, outcode };
}

const OUTCODE_RE = /^[A-Z]{1,2}\d[A-Z\d]?$/;
const POSTCODE_RE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/;

// ---------- importing from the FSA ----------

interface FsaEstablishment {
  FHRSID: number;
  BusinessName: string;
  AddressLine1?: string;
  AddressLine2?: string;
  AddressLine3?: string;
  AddressLine4?: string;
  PostCode?: string;
  RatingValue?: string;
  RatingDate?: string;
  LocalAuthorityName?: string;
  geocode?: { longitude?: string | number | null; latitude?: string | number | null };
}

async function fsa<T>(env: Env, path: string): Promise<T> {
  const base = (env.FSA_API_BASE || FSA_DEFAULT_BASE).replace(/\/+$/, "");
  const res = await fetch(`${base}${path}`, { headers: { "x-api-version": "2", Accept: "application/json" } });
  if (!res.ok)
    throw new HttpError(502, `The Food Standards Agency's data service answered ${res.status}. Try again later.`);
  return (await res.json()) as T;
}

/** Admin: council areas in the FSA data, with what we've imported. */
export async function listAuthorities(env: Env): Promise<FsaAuthority[]> {
  const data = await cached("fsa:authorities", 86_400, () =>
    fsa<{ authorities?: { LocalAuthorityId: number; Name: string }[] }>(env, "/Authorities/basic"),
  );
  const { results } = await env.DB.prepare("SELECT authority_id, venue_count, imported_at FROM fsa_imports").all<{
    authority_id: number;
    venue_count: number;
    imported_at: string;
  }>();
  const done = new Map(results.map((r) => [r.authority_id, r]));
  return (data.authorities ?? [])
    .map((a) => ({
      id: a.LocalAuthorityId,
      name: a.Name,
      importedAt: done.get(a.LocalAuthorityId)?.imported_at ?? null,
      venueCount: done.get(a.LocalAuthorityId)?.venue_count ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function num(v: string | number | null | undefined): number | null {
  const n = typeof v === "number" ? v : Number.parseFloat(v ?? "");
  return Number.isFinite(n) && n !== 0 ? n : null;
}

/** Admin: imports (or refreshes) every pub/bar/club in one council area. */
export async function importAuthority(
  env: Env,
  authorityId: number,
): Promise<{ name: string; fetched: number; added: number; updated: number; closed: number; total: number }> {
  if (!Number.isInteger(authorityId) || authorityId <= 0) throw new HttpError(400, "Invalid council area");
  const started = new Date().toISOString();

  const establishments: FsaEstablishment[] = [];
  let authorityName = "";
  for (let page = 1; page <= 10; page++) {
    const data = await fsa<{ establishments?: FsaEstablishment[]; meta?: { totalPages?: number } }>(
      env,
      `/Establishments?localAuthorityId=${authorityId}&businessTypeId=${FSA_PUB_TYPE}&pageSize=${FSA_PAGE_SIZE}&pageNumber=${page}`,
    );
    establishments.push(...(data.establishments ?? []));
    authorityName ||= data.establishments?.[0]?.LocalAuthorityName ?? "";
    if (!data.meta?.totalPages || page >= data.meta.totalPages) break;
  }
  if (!authorityName) {
    const list = await listAuthorities(env).catch(() => []);
    authorityName = list.find((a) => a.id === authorityId)?.name ?? `Area ${authorityId}`;
  }

  // Existing venues in this area keep their slug and Google link.
  const { results: existing } = await env.DB.prepare("SELECT fsa_id, slug FROM venues WHERE fsa_authority_id = ?")
    .bind(authorityId)
    .all<{ fsa_id: number; slug: string }>();
  const known = new Map(existing.map((r) => [r.fsa_id, r.slug]));

  const rows = establishments
    .filter((e) => e.FHRSID && e.BusinessName?.trim())
    .map((e) => {
      const name = tidyName(e.BusinessName);
      const authority = e.LocalAuthorityName?.trim() || authorityName || null;
      const { postcode, outcode } = normalisePostcode(e.PostCode);
      const lines = [e.AddressLine1, e.AddressLine2, e.AddressLine3, e.AddressLine4]
        .map((l) => (l ?? "").trim())
        .filter((l) => l && l.toUpperCase().replace(/\s/g, "") !== (postcode ?? "").replace(/\s/g, ""));
      const town = pickTown(lines, authority);
      return {
        fsaId: e.FHRSID,
        name,
        kind: guessKind(name),
        address: lines.map(titleIfUpper).join(", "),
        town,
        postcode,
        outcode,
        authority,
        lat: num(e.geocode?.latitude),
        lng: num(e.geocode?.longitude),
        rating: e.RatingValue?.trim() || null,
        ratingDate: e.RatingDate ? e.RatingDate.slice(0, 10) : null,
        slug: known.get(e.FHRSID) ?? "",
      };
    });

  // Unique slugs for new venues: "the-bell-reading", or "the-bell-reading-123456" if taken.
  const fresh = rows.filter((r) => !r.slug);
  const wanted = fresh.map((r) => slugify(`${r.name} ${r.town ?? r.authority ?? ""}`) || `venue-${r.fsaId}`);
  const taken = new Set<string>();
  for (let i = 0; i < wanted.length; i += 90) {
    const chunk = [...new Set(wanted.slice(i, i + 90))];
    if (!chunk.length) continue;
    const { results } = await env.DB.prepare(
      `SELECT slug FROM venues WHERE slug IN (${chunk.map(() => "?").join(",")})`,
    )
      .bind(...chunk)
      .all<{ slug: string }>();
    results.forEach((r) => taken.add(r.slug));
  }
  fresh.forEach((r, i) => {
    const slug = taken.has(wanted[i]) ? `${wanted[i]}-${r.fsaId}` : wanted[i];
    taken.add(slug);
    r.slug = slug;
  });

  const upsert = env.DB.prepare(
    `INSERT INTO venues (slug, name, kind, address, town, town_slug, postcode, outcode, local_authority, lat, lng, fsa_id,
                         fsa_authority_id, hygiene_rating, hygiene_rating_date, source, seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'fsa', ?)
     ON CONFLICT (fsa_id) DO UPDATE SET
       name = excluded.name, kind = excluded.kind, address = excluded.address, town = excluded.town, town_slug = excluded.town_slug,
       postcode = excluded.postcode, outcode = excluded.outcode, local_authority = excluded.local_authority,
       lat = excluded.lat, lng = excluded.lng, fsa_authority_id = excluded.fsa_authority_id,
       hygiene_rating = excluded.hygiene_rating, hygiene_rating_date = excluded.hygiene_rating_date,
       seen_at = excluded.seen_at,
       status = CASE WHEN venues.status = 'closed' THEN 'active' ELSE venues.status END,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
  );
  const statements = rows.map((r) =>
    upsert.bind(
      r.slug,
      r.name,
      r.kind,
      r.address,
      r.town,
      r.town ? slugify(r.town) || null : null,
      r.postcode,
      r.outcode,
      r.authority,
      r.lat,
      r.lng,
      r.fsaId,
      authorityId,
      r.rating,
      r.ratingDate,
      started,
    ),
  );
  for (let i = 0; i < statements.length; i += 50) await env.DB.batch(statements.slice(i, i + 50));

  // Gone from the FSA's register: most likely closed.
  const closed = await env.DB.prepare(
    "UPDATE venues SET status = 'closed' WHERE fsa_authority_id = ? AND status = 'active' AND (seen_at IS NULL OR seen_at < ?)",
  )
    .bind(authorityId, started)
    .run();
  const total = rows.length;
  await env.DB.prepare(
    `INSERT INTO fsa_imports (authority_id, name, venue_count, imported_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (authority_id) DO UPDATE SET name = excluded.name, venue_count = excluded.venue_count, imported_at = excluded.imported_at`,
  )
    .bind(authorityId, authorityName, total, started)
    .run();

  // New towns should show in "Browse by town" straight away.
  await forget("venues:towns");

  return {
    name: authorityName,
    fetched: establishments.length,
    added: fresh.length,
    updated: total - fresh.length,
    closed: closed.meta.changes ?? 0,
    total,
  };
}

// ---------- searching ----------

const LIST_COLS = "slug, name, kind, town, postcode, lat, lng";

function toSummary(
  r: Pick<VenueRow, "slug" | "name" | "kind" | "town" | "postcode" | "lat" | "lng">,
  from?: LatLng,
): VenueSummary {
  const location = r.lat !== null && r.lng !== null ? { lat: r.lat, lng: r.lng } : null;
  return {
    slug: r.slug,
    name: r.name,
    kind: r.kind,
    town: r.town,
    postcode: r.postcode,
    location,
    distanceMeters: from && location ? Math.round(metres(from, location)) : null,
  };
}

function metres(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** SQL for the kind filter. Members' clubs are left out unless asked for. */
function kindFilter(kind: string | null): { sql: string; binds: string[] } {
  const kinds = ["pub", "bar", "taproom", "nightclub", "club"];
  if (kind && kinds.includes(kind)) return { sql: "kind = ?", binds: [kind] };
  return { sql: "kind != 'club'", binds: [] };
}

/** GET /api/venues?q=&near=lat,lng&kind=&page= */
export async function searchVenues(env: Env, params: URLSearchParams): Promise<VenueSearchResult> {
  const q = (params.get("q") ?? "").trim().slice(0, 80);
  const kind = kindFilter(params.get("kind"));
  const page = Math.min(Math.max(Number(params.get("page")) || 0, 0), 20);
  const nearMatch = (params.get("near") ?? "").match(/^(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)$/);

  if (nearMatch) {
    const near = { lat: Number(nearMatch[1]), lng: Number(nearMatch[2]) };
    // A box of about 3 km around the point, then sorted by real distance.
    const dLat = 0.027;
    const dLng = dLat / Math.max(Math.cos((near.lat * Math.PI) / 180), 0.2);
    const { results } = await env.DB.prepare(
      `SELECT ${LIST_COLS} FROM venues
       WHERE status = 'active' AND ${kind.sql} AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?
       LIMIT 400`,
    )
      .bind(...kind.binds, near.lat - dLat, near.lat + dLat, near.lng - dLng, near.lng + dLng)
      .all<VenueRow>();
    const sorted = results
      .map((r) => toSummary(r, near))
      .sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0));
    const slice = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    return { venues: slice, nextPage: sorted.length > (page + 1) * PAGE_SIZE ? page + 1 : null };
  }

  if (!q) throw new HttpError(400, "Type a pub name, town or postcode");
  const upper = q.toUpperCase();

  // A postcode or the first half of one: everything in that postcode district.
  if (OUTCODE_RE.test(upper) || POSTCODE_RE.test(upper)) {
    const outcode = OUTCODE_RE.test(upper) ? upper : normalisePostcode(upper).outcode;
    const exact = OUTCODE_RE.test(upper) ? "" : (normalisePostcode(upper).postcode ?? "");
    // A full postcode lists venues at that exact postcode first, then the rest of the district.
    const { results } = await env.DB.prepare(
      `SELECT ${LIST_COLS} FROM venues WHERE outcode = ? AND status = 'active' AND ${kind.sql}
       ORDER BY postcode = ? DESC, name LIMIT ? OFFSET ?`,
    )
      .bind(outcode, ...kind.binds, exact, PAGE_SIZE + 1, page * PAGE_SIZE)
      .all<VenueRow>();
    return {
      venues: results.slice(0, PAGE_SIZE).map((r) => toSummary(r)),
      nextPage: results.length > PAGE_SIZE ? page + 1 : null,
    };
  }

  // Words: full-text search over name, town, postcode and council. Each word is a prefix,
  // so "nags rea" finds The Nags Head in Reading.
  const words = q
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6);
  if (!words.length) throw new HttpError(400, "Type a pub name, town or postcode");
  // "kings" should also find "King's" (stored as "king" + "s"), so try it without the s too.
  const match = words
    .map((w) => (w.length > 3 && w.endsWith("s") ? `("${w}"* OR "${w.slice(0, -1)}")` : `"${w}"*`))
    .join(" AND "); // FTS5 needs an explicit AND next to brackets
  const { results } = await env.DB.prepare(
    `SELECT v.slug, v.name, v.kind, v.town, v.postcode, v.lat, v.lng
     FROM venues_fts f JOIN venues v ON v.id = f.rowid
     WHERE venues_fts MATCH ? AND v.status = 'active' AND v.${kind.sql.replace(/^kind/, "kind")}
     ORDER BY bm25(venues_fts, 10.0, 3.0, 2.0, 1.0), v.name
     LIMIT ? OFFSET ?`,
  )
    .bind(match, ...kind.binds, PAGE_SIZE + 1, page * PAGE_SIZE)
    .all<VenueRow>();
  return {
    venues: results.slice(0, PAGE_SIZE).map((r) => toSummary(r)),
    nextPage: results.length > PAGE_SIZE ? page + 1 : null,
  };
}

/** GET /api/venues/area/:area: everything in a town, council area or postcode district. */
export async function areaVenues(env: Env, area: string, params: URLSearchParams): Promise<VenueSearchResult> {
  const decoded = decodeURIComponent(area).trim().slice(0, 60);
  const raw = decoded.replace(/-/g, " ");
  if (!raw) throw new HttpError(404, "Area not found");
  const kind = kindFilter(params.get("kind"));
  const page = Math.min(Math.max(Number(params.get("page")) || 0, 0), 50);
  const upper = raw.toUpperCase();
  const where = OUTCODE_RE.test(upper.replace(/\s/g, ""))
    ? { sql: "outcode = ?", bind: upper.replace(/\s/g, ""), name: upper.replace(/\s/g, "") }
    : { sql: "(town_slug = ? OR local_authority = ? COLLATE NOCASE)", bind: slugify(decoded), name: null };
  const binds = where.sql.includes("local_authority") ? [where.bind, raw] : [where.bind];

  const [count, list] = await env.DB.batch([
    env.DB.prepare(
      `SELECT COUNT(*) AS n,
              MAX(CASE WHEN town_slug = ? THEN town END) AS town,
              MAX(CASE WHEN local_authority = ? COLLATE NOCASE THEN local_authority END) AS authority,
              MIN(lat) AS south, MAX(lat) AS north, MIN(lng) AS west, MAX(lng) AS east
       FROM venues WHERE ${where.sql} AND status = 'active' AND ${kind.sql}`,
    ).bind(slugify(decoded), raw, ...binds, ...kind.binds),
    env.DB.prepare(
      `SELECT ${LIST_COLS} FROM venues WHERE ${where.sql} AND status = 'active' AND ${kind.sql}
       ORDER BY name LIMIT ? OFFSET ?`,
    ).bind(...binds, ...kind.binds, AREA_PAGE_SIZE + 1, page * AREA_PAGE_SIZE),
  ]);
  const total = (count.results[0] as { n: number } | undefined)?.n ?? 0;
  const rows = list.results as VenueRow[];
  // Show the area's name as the data spells it ("Reading", not "reading").
  const areaName =
    where.name ??
    (count.results[0] as { town?: string | null } | undefined)?.town ??
    (count.results[0] as { authority?: string | null } | undefined)?.authority ??
    (total ? raw.replace(/\b\w/g, (c) => c.toUpperCase()) : null);
  const box = count.results[0] as {
    south: number | null;
    north: number | null;
    west: number | null;
    east: number | null;
  };
  return {
    venues: rows.slice(0, AREA_PAGE_SIZE).map((r) => toSummary(r)),
    nextPage: rows.length > AREA_PAGE_SIZE ? page + 1 : null,
    areaName,
    total,
    bounds:
      box && box.south !== null && box.north !== null && box.west !== null && box.east !== null
        ? { low: { lat: box.south, lng: box.west }, high: { lat: box.north, lng: box.east } }
        : null,
  };
}

const MAP_LIMIT = 500;
/** A map showing more than about this many degrees across is too zoomed out to list every pub. */
const MAP_MAX_SPAN = 0.6;

/** GET /api/venues/in?b=south,west,north,east&kind=: venues on the visible part of a map. */
export async function venuesInBounds(env: Env, params: URLSearchParams): Promise<VenueMapResult> {
  const b = (params.get("b") ?? "").split(",").map(Number);
  if (b.length !== 4 || b.some((n) => !Number.isFinite(n))) throw new HttpError(400, "Invalid map area");
  const [south, west, north, east] = b;
  if (south > north || west > east || Math.abs(south) > 90 || Math.abs(west) > 180)
    throw new HttpError(400, "Invalid map area");
  if (north - south > MAP_MAX_SPAN || east - west > MAP_MAX_SPAN * 2) {
    throw new HttpError(400, "Zoom in to see pubs", "zoom_in");
  }
  const kind = kindFilter(params.get("kind"));
  const { results } = await env.DB.prepare(
    `SELECT ${LIST_COLS} FROM venues
     WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ? AND status = 'active' AND ${kind.sql}
     LIMIT ?`,
  )
    .bind(south, north, west, east, ...kind.binds, MAP_LIMIT + 1)
    .all<VenueRow>();
  return { venues: results.slice(0, MAP_LIMIT).map((r) => toSummary(r)), truncated: results.length > MAP_LIMIT };
}

/** GET /api/venues/towns: every town with venues, for "Browse by town" (cached for 10 minutes). */
export function listTowns(env: Env): Promise<{ name: string; slug: string; count: number }[]> {
  return cached("venues:towns", 600, async () => {
    const { results } = await env.DB.prepare(
      `SELECT MIN(town) AS name, town_slug AS slug, COUNT(*) AS count FROM venues
       WHERE status = 'active' AND kind != 'club' AND town_slug IS NOT NULL AND town_slug != ''
       GROUP BY town_slug ORDER BY town_slug`,
    ).all<{ name: string; slug: string; count: number }>();
    return results;
  });
}

// ---------- a venue's page ----------

const STOP_WORDS = new Set([
  "the",
  "and",
  "of",
  "at",
  "inn",
  "pub",
  "bar",
  "ph",
  "public",
  "house",
  "hotel",
  "ltd",
  "limited",
]);

function nameTokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/['’]/g, "")
      .split(/[^a-z0-9]+/)
      .filter((w) => w && !STOP_WORDS.has(w)),
  );
}

/** Share of words in common (0–1), ignoring "the", "inn", "pub"… */
function nameSimilarity(a: string, b: string): number {
  const x = nameTokens(a);
  const y = nameTokens(b);
  if (!x.size || !y.size) return a.trim().toLowerCase() === b.trim().toLowerCase() ? 1 : 0;
  let common = 0;
  x.forEach((w) => y.has(w) && common++);
  return common / Math.min(x.size, y.size);
}

/**
 * Finds the venue's Google Place ID: a text search for its name and postcode near its
 * location, accepting only a close, similarly named result. Stored, so it's one call per venue.
 */
async function linkToGoogle(env: Env, v: VenueRow): Promise<string | null> {
  if (v.google_place_id) return v.google_place_id;
  const recheckAfter = Date.now() - GOOGLE_RECHECK_DAYS * 86_400_000;
  if (v.google_checked_at && Date.parse(v.google_checked_at) > recheckAfter) return null;
  if (!env.GOOGLE_PLACES_API_KEY) return null;

  let placeId: string | null = null;
  try {
    const here = v.lat !== null && v.lng !== null ? { lat: v.lat, lng: v.lng } : null;
    const data = await google<{
      places?: { id: string; displayName?: { text: string }; location?: { latitude: number; longitude: number } }[];
    }>(env, "https://places.googleapis.com/v1/places:searchText", "places.id,places.displayName,places.location", {
      textQuery: [v.name, v.postcode ?? v.town].filter(Boolean).join(", "),
      pageSize: 5,
      ...(here
        ? { locationBias: { circle: { center: { latitude: here.lat, longitude: here.lng }, radius: 300 } } }
        : {}),
    });
    const best = (data.places ?? [])
      .map((p) => {
        const loc = p.location ? { lat: p.location.latitude, lng: p.location.longitude } : null;
        return {
          id: p.id,
          score: nameSimilarity(v.name, p.displayName?.text ?? ""),
          distance: here && loc ? metres(here, loc) : null,
        };
      })
      .filter((p) => p.score >= 0.5 && (p.distance === null || p.distance <= 250))
      .sort((a, b) => b.score - a.score || (a.distance ?? 0) - (b.distance ?? 0))[0];
    placeId = best?.id ?? null;
  } catch (err) {
    console.error("Google match failed for venue", v.slug, err);
    return null; // try again next time
  }
  await env.DB.prepare("UPDATE venues SET google_place_id = ?, google_checked_at = ? WHERE id = ?")
    .bind(placeId ?? "", new Date().toISOString(), v.id)
    .run();
  return placeId;
}

/** GET /api/venues/:slug */
export async function getVenue(env: Env, slug: string): Promise<VenueDetails> {
  const v = await env.DB.prepare("SELECT * FROM venues WHERE slug = ? AND status != 'hidden'")
    .bind(slug)
    .first<VenueRow>();
  if (!v) throw new HttpError(404, "We couldn't find that venue");

  const placeId = await linkToGoogle(env, v);
  let place: PlaceDetails | null = null;
  if (placeId) {
    place = await getPlace(env, placeId).catch((err) => {
      console.error("Google details failed for venue", slug, err);
      return null;
    });
  }
  const { results: crawls } = placeId
    ? await env.DB.prepare(
        `SELECT DISTINCT c.slug, c.name, u.username
         FROM stops s JOIN crawls c ON c.id = s.crawl_id JOIN users u ON u.id = c.owner_id
         WHERE s.place_id = ? AND c.is_public = 1 AND u.email_verified_at IS NOT NULL
         ORDER BY c.published_at DESC LIMIT 5`,
      )
        .bind(placeId)
        .all<{ slug: string; name: string; username: string | null }>()
    : { results: [] };

  return {
    ...toSummary(v),
    address: v.address,
    outcode: v.outcode,
    townSlug: v.town_slug,
    localAuthority: v.local_authority,
    hygiene:
      v.fsa_id && v.hygiene_rating
        ? {
            rating: v.hygiene_rating,
            date: v.hygiene_rating_date,
            url: `https://ratings.food.gov.uk/business/${v.fsa_id}`,
          }
        : null,
    place,
    placeId,
    publicCrawls: crawls.map((c) => ({ slug: c.slug, name: c.name, author: c.username ?? "Pint Route user" })),
  };
}

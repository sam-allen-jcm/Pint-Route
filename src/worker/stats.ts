// Owner-only usage dashboard data. Access is limited to the email addresses in
// the ADMIN_EMAILS secret (comma-separated).

import type { StatsResponse, User } from "../shared/types";
import { getUser } from "./auth";
import type { Env } from "./env";
import { getArea } from "./google";
import { HttpError } from "./http";

export function isAdmin(user: User | null, env: Env): boolean {
  if (!user || !env.ADMIN_EMAILS) return false;
  const admins = env.ADMIN_EMAILS.split(",").map((e) => e.trim().toLowerCase());
  return admins.includes(user.email.toLowerCase());
}

export async function requireAdmin(request: Request, env: Env): Promise<User> {
  const user = await getUser(request, env);
  if (!user) throw new HttpError(401, "Please log in");
  if (!isAdmin(user, env)) throw new HttpError(403, "Not available");
  return user;
}

const n = (v: unknown) => Number(v ?? 0);

export async function getStats(env: Env, days: number): Promise<StatsResponse> {
  const today = new Date();
  const dayList = Array.from({ length: days }, (_, i) => {
    const d = new Date(today.getTime() - (days - 1 - i) * 86_400_000);
    return d.toISOString().slice(0, 10);
  });
  const from = dayList[0];
  const fromTs = `${from}T00:00:00.000Z`;

  const [totals, usage, signups, funnel, countries, areas] = await env.DB.batch([
    env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM users) AS users,
         (SELECT COUNT(*) FROM crawls) AS crawls,
         (SELECT COUNT(*) FROM stops) AS stops,
         (SELECT COUNT(*) FROM stops WHERE visited_on IS NOT NULL) AS visited,
         (SELECT COUNT(*) FROM crawls WHERE shared_views > 0) AS shared`,
    ),
    env.DB.prepare("SELECT day, event, SUM(count) AS count FROM usage_daily WHERE day >= ? GROUP BY day, event").bind(
      from,
    ),
    env.DB.prepare("SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS count FROM users WHERE created_at >= ? GROUP BY day").bind(
      fromTs,
    ),
    // What happened to crawls created in the period.
    env.DB.prepare(
      `SELECT
         COUNT(*) AS created,
         SUM(CASE WHEN n >= 1 THEN 1 ELSE 0 END) AS with_stop,
         SUM(CASE WHEN n >= 2 THEN 1 ELSE 0 END) AS with_two,
         SUM(CASE WHEN shared_views > 0 THEN 1 ELSE 0 END) AS shared,
         SUM(CASE WHEN v >= 1 THEN 1 ELSE 0 END) AS visited
       FROM (
         SELECT c.id, c.shared_views, COUNT(s.id) AS n, COUNT(s.visited_on) AS v
         FROM crawls c LEFT JOIN stops s ON s.crawl_id = c.id
         WHERE c.created_at >= ?
         GROUP BY c.id
       )`,
    ).bind(fromTs),
    env.DB.prepare(
      `SELECT country_code AS code, COUNT(*) AS count FROM crawls
       WHERE created_at >= ? AND country_code IS NOT NULL GROUP BY country_code ORDER BY count DESC LIMIT 10`,
    ).bind(fromTs),
    env.DB.prepare(
      `SELECT area_place_id AS id, COUNT(*) AS count FROM crawls
       WHERE created_at >= ? AND area_place_id IS NOT NULL GROUP BY area_place_id ORDER BY count DESC LIMIT 20`,
    ).bind(fromTs),
  ]);

  const series: Record<string, number[]> = {};
  const index = new Map(dayList.map((d, i) => [d, i]));
  const add = (event: string, day: string, count: number) => {
    const i = index.get(day);
    if (i === undefined) return;
    (series[event] ??= new Array(days).fill(0))[i] += count;
  };
  for (const r of usage.results as { day: string; event: string; count: number }[]) add(r.event, r.day, n(r.count));
  for (const r of signups.results as { day: string; count: number }[]) add("signup_total", r.day, n(r.count));

  // Area names come live from Google (we only store Place IDs).
  const areaRows = areas.results as { id: string; count: number }[];
  const areaInfo = await Promise.all(
    areaRows.map((r) =>
      getArea(env, r.id)
        .then((a) => ({ name: a.name, isCountry: a.isCountry }))
        .catch(() => ({ name: "Unknown place", isCountry: false })),
    ),
  );

  const t = (totals.results[0] ?? {}) as Record<string, number>;
  const f = (funnel.results[0] ?? {}) as Record<string, number>;
  return {
    days: dayList,
    totals: {
      users: n(t.users),
      crawls: n(t.crawls),
      stops: n(t.stops),
      visited: n(t.visited),
      shared: n(t.shared),
    },
    series,
    funnel: {
      created: n(f.created),
      withStop: n(f.with_stop),
      withTwo: n(f.with_two),
      shared: n(f.shared),
      visited: n(f.visited),
    },
    countries: (countries.results as { code: string; count: number }[]).map((r) => ({ code: r.code, count: n(r.count) })),
    // Towns only: crawls with just a country are covered by `countries`.
    areas: areaRows
      .map((r, i) => ({ ...areaInfo[i], count: n(r.count) }))
      .filter((a) => !a.isCountry)
      .slice(0, 10)
      .map(({ name, count }) => ({ name, count })),
  };
}

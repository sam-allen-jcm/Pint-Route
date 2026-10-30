// Anonymous usage statistics, kept as daily counts in D1 (usage_daily).
// Never record who did something: no user ids, emails, IPs or crawl slugs.

import type { Env } from "./env";

/** Actions the browser may report itself (things the server can't see). */
export const CLIENT_EVENTS = new Set(["share_opened", "share_link_shared", "edit_link_copied", "map_viewed", "my_location_on"]);

export function recordUsage(env: Env, event: string, detail = ""): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  return env.DB.prepare(
    `INSERT INTO usage_daily (day, event, detail, count) VALUES (?, ?, ?, 1)
     ON CONFLICT (day, event, detail) DO UPDATE SET count = count + 1`,
  )
    .bind(day, event, detail.slice(0, 40))
    .run()
    .then(() => undefined)
    .catch((err) => console.error("usage stats write failed", event, err));
}

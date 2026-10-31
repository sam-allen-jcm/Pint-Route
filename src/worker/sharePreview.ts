// Link previews for shared crawls. WhatsApp, iMessage, Slack etc. read the
// page's <meta> tags, so for /c/<slug> the Worker puts the crawl's own name
// and a short summary into the HTML before serving it.

import { parseStart } from "../shared/hours";
import type { Env } from "./env";
import { getArea } from "./google";

interface CrawlSummaryRow {
  name: string;
  area_place_id: string | null;
  starts_at: string | null;
  stop_count: number;
}

/** "A pub crawl in London · 8 pubs · Sat 31 Oct, 13:00" */
async function describe(env: Env, c: CrawlSummaryRow): Promise<string> {
  const parts: string[] = [];
  let where: string | null = null;
  if (c.area_place_id) {
    // The town's name comes live from Google (cached); skip it if unavailable.
    where = await getArea(env, c.area_place_id)
      .then((a) => (a.isCountry ? a.name : a.name.split(",")[0]))
      .catch(() => null);
  }
  parts.push(where ? `A pub crawl in ${where}` : "A pub crawl");
  if (c.stop_count) parts.push(`${c.stop_count} ${c.stop_count === 1 ? "pub" : "pubs"}`);
  const start = parseStart(c.starts_at);
  if (start) {
    // en-GB formatting so previews read the same for everyone, e.g. "Sat 31 Oct, 13:00".
    const day = new Date(`${start.date}T12:00:00Z`).toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
    const hh = String(Math.floor(start.minutes / 60)).padStart(2, "0");
    const mm = String(start.minutes % 60).padStart(2, "0");
    parts.push(`${day}, ${hh}:${mm}`);
  }
  return `${parts.join(" · ")}. Plan, share and tick off pubs with Pint Route.`;
}

export async function crawlPage(request: Request, env: Env, slug: string): Promise<Response> {
  const page = await env.ASSETS.fetch(request); // the SPA's index.html
  const type = page.headers.get("Content-Type") ?? "";
  if (!page.ok || !type.includes("text/html")) return page;

  let crawl: CrawlSummaryRow | null = null;
  try {
    crawl = await env.DB.prepare(
      `SELECT c.name, c.area_place_id, c.starts_at, COUNT(s.id) AS stop_count
       FROM crawls c
       LEFT JOIN users u ON u.id = c.owner_id
       LEFT JOIN stops s ON s.crawl_id = c.id
       WHERE c.slug = ? AND (c.owner_id IS NULL OR u.email_verified_at IS NOT NULL)
       GROUP BY c.id`,
    )
      .bind(slug)
      .first<CrawlSummaryRow>();
  } catch (err) {
    console.error("share preview lookup failed", err);
  }
  // Unknown crawl, or owner not verified yet: the generic Pint Route preview.
  if (!crawl) return page;

  const title = `${crawl.name} · Pint Route`;
  const description = await describe(env, crawl);
  const origin = env.APP_URL?.replace(/\/+$/, "") || new URL(request.url).origin;
  const canonical = `${origin}/c/${slug}`;

  const setContent = (content: string) => ({
    element(el: Element) {
      el.setAttribute("content", content);
    },
  });

  const rewritten = new HTMLRewriter()
    .on("title", {
      element(el) {
        el.setInnerContent(title); // escaped as text
      },
    })
    .on('meta[property="og:title"]', setContent(title))
    .on('meta[property="og:description"]', setContent(description))
    .on('meta[name="description"]', setContent(description))
    .on('meta[property="og:image:alt"]', setContent(title))
    .on("head", {
      element(el) {
        el.append(`<meta property="og:url" content="${canonical.replace(/"/g, "&quot;")}" />`, { html: true });
      },
    })
    .transform(page);

  const headers = new Headers(rewritten.headers);
  // The name can change, so don't let caches hold a stale preview for long.
  headers.set("Cache-Control", "public, max-age=60");
  return new Response(rewritten.body, { status: rewritten.status, headers });
}

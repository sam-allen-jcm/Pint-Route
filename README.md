# Pint Route 🍺

A mobile-first pub crawl planner. Search for pubs, build a crawl, see the walking
route between stops, tick pubs off as you go, and share a read-only link with your mates.

- **Front end:** React + Vite, served as Workers static assets
- **API:** Cloudflare Worker under `/api/*` (via `@cloudflare/vite-plugin`)
- **Database:** Cloudflare D1 (binding `DB`), SQL migrations in [`migrations/`](migrations)
- **Google:** Places API (New) and Routes API called **only from the Worker**; Maps JavaScript API in the browser

There's no local development setup to maintain. Everything builds and deploys in
Cloudflare Workers Builds from this GitHub repo.

---

## 1. One-time setup

### Create the D1 database

Create it in the Cloudflare dashboard (**Storage & Databases → D1 → Create**) and name it
`round-trip-db`. If you'd rather use a terminal, run `npx wrangler d1 create round-trip-db`.

Its ID is set as `database_id` in [`wrangler.jsonc`](wrangler.jsonc). If you ever recreate
the database, update that value and commit it.

### Google Cloud keys

You need **two separate API keys**:

| Key | Used by | Enable these APIs | Restrict it by |
| --- | --- | --- | --- |
| Server key → `GOOGLE_PLACES_API_KEY` | Worker only | **Places API (New)**, **Routes API** | API restrictions (those two APIs). There's no referrer, because calls come from Cloudflare. |
| Browser key → `VITE_GOOGLE_MAPS_KEY` | Browser map | **Maps JavaScript API** | **HTTP referrer**, e.g. `https://pint-route.<your-subdomain>.workers.dev/*` and your custom domain |

> The walking route uses the **Routes API** (`computeRoutes`, `WALK`) from the Worker,
> because the legacy Directions API can't be enabled on new Google Cloud projects.

The map uses Advanced Markers, which need a Map ID. It defaults to Google's `DEMO_MAP_ID`.
To use your own styled map, set `VITE_GOOGLE_MAPS_MAP_ID` (optional).

---

## 2. Cloudflare Workers Builds settings

Connect the repo in **Workers & Pages → Create → Import a repository**. If the Worker already
exists, go to **Worker → Settings → Build**. Then set:

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Build command | `npm run build` |
| Deploy command | `npx wrangler d1 migrations apply DB --remote && npx wrangler deploy` |
| Root directory | `/` (repo root) |

The Worker name must be **`pint-route`**, which matches `name` in `wrangler.jsonc`.

`npm run build` runs `vite build`, which outputs the client assets (`dist/client`) and the
Worker (`dist/pint_route`). It also writes a redirect config (`.wrangler/deploy/config.json`)
that `wrangler d1 migrations apply` and `wrangler deploy` both pick up automatically.

### Secrets and variables

| Name | Kind | Where to set it | Notes |
| --- | --- | --- | --- |
| `GOOGLE_PLACES_API_KEY` | **Runtime secret** | Worker → Settings → **Variables and Secrets** → Add → type *Secret* (or `npx wrangler secret put GOOGLE_PLACES_API_KEY`) | Server-side key. Never exposed to the browser. |
| `VITE_GOOGLE_MAPS_KEY` | **Build variable** | Worker → Settings → **Build** → **Variables and secrets** | Inlined into the JS bundle at build time, so it must be a *build* variable. It's public, so restrict it by HTTP referrer. |
| `VITE_GOOGLE_MAPS_MAP_ID` | Build variable (optional) | Same as above | Defaults to `DEMO_MAP_ID`. |

After changing a build variable, trigger a new build (push a commit or use **Retry build**)
so the new value gets baked in. The runtime secret survives deploys and takes effect without
a rebuild.

---

## 3. Database migrations

Migrations are plain SQL files in [`migrations/`](migrations), numbered in order
(`0001_init.sql`, `0002_….sql`, …).

They're applied automatically on every deploy by the first half of the deploy command:

```sh
npx wrangler d1 migrations apply DB --remote
```

Wrangler records applied migrations in a `d1_migrations` table, so each file runs exactly
once and re-running is a no-op. To change the schema, add a **new** numbered file. Never
edit one that has already been applied. If a migration fails, the `&&` stops the deploy, so
the previous version keeps serving.

The API token Workers Builds uses needs **D1 edit** permission. The token Cloudflare creates
for Workers Builds normally includes it. If you use a custom token, add *Account → D1 → Edit*.

---

## How it works

### Data & Google terms

- D1 stores **only Place IDs** plus our own data: crawl name, stop order, visited date and notes.
  See [`migrations/0001_init.sql`](migrations/0001_init.sql).
- Names, addresses, opening hours, business status and photos are fetched **live** from
  Places via the Worker. They're cached only briefly (5 min for details and search, 10 min
  for routes, 30 min for photo URLs) in isolate memory and the Cloudflare Cache API. They're
  never written to D1.
- Every Google request sends a **field mask**. Search asks only for basic fields (id, name,
  address, location, status, type). Details add opening hours and photo references.
  Routes asks only for leg distance, duration and polyline.
- Photos are proxied through `/api/places/photo`, which redirects to Google's short-lived
  photo URL, so the server key is never exposed. Author attributions are shown with each photo.

### Closed pubs

- Search results hide anything whose `businessStatus` isn't `OPERATIONAL`, and say how many were hidden.
- Stops already on a crawl that later close are **flagged** with a red "Permanently closed" or
  "Temporarily closed" badge, and their map pin turns grey.

### Sharing & editing (no accounts)

- Creating a crawl returns a random public **slug** (`/c/<slug>`) and a random private
  **edit token**. The database stores only a SHA-256 hash of the token.
- The token is kept in the creator's browser (`localStorage`) and sent as an
  `X-Edit-Token` header on writes. Anyone with just the slug link gets a read-only view.
- **Share → Copy private edit link** produces `/c/<slug>#edit=<token>` so you can edit on
  another phone. The token is in the URL fragment, which browsers never send to the server.
  The token is saved on that device and stripped from the address bar.
- Crawls are capped at 25 stops, which keeps them within the Routes API's waypoint limit
  for walking routes.

### API

| Method & path | Auth | Purpose |
| --- | --- | --- |
| `GET /api/places/search?q=&lat=&lng=` | – | Text Search (`q`, location-biased if `lat`/`lng` given) or Nearby Search (`lat`/`lng` only, types `pub`, `bar`) |
| `GET /api/places?ids=a,b,c` | – | Live details for stops |
| `GET /api/places/photo?name=&w=` | – | Redirect to a place photo |
| `POST /api/crawls` | – | Create crawl → `{ slug, editToken }` |
| `GET /api/crawls/:slug` | optional | Crawl + stops (`canEdit` reflects the token) |
| `PATCH /api/crawls/:slug` | edit | Rename `{ name }` |
| `DELETE /api/crawls/:slug` | edit | Delete crawl |
| `GET /api/crawls/:slug/route` | – | Walking route: per-leg time, distance and polyline |
| `POST /api/crawls/:slug/stops` | edit | Add a stop `{ placeId }` |
| `PUT /api/crawls/:slug/stops/order` | edit | Reorder `{ stopIds: [...] }` |
| `PATCH /api/crawls/:slug/stops/:id` | edit | `{ visitedOn: "YYYY-MM-DD" \| null, note }` |
| `DELETE /api/crawls/:slug/stops/:id` | edit | Remove a stop |

### Project layout

```
migrations/            D1 SQL migrations
src/worker/            Worker API (index.ts router, crawls.ts D1, google.ts Places/Routes, cache.ts)
src/client/            React app (pages/, components/, styles.css)
src/shared/types.ts    Types shared by the Worker and the client
wrangler.jsonc         Worker name, D1 binding, assets config
vite.config.ts         React + Cloudflare Vite plugins
```

`npm run typecheck` type-checks both the client and the Worker.

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

### Email (Resend)

Password-reset emails are sent with [Resend](https://resend.com) from `noreply@pintroute.com`.

1. Create a Resend account, then **Domains → Add domain** → `pintroute.com`.
2. Add the DNS records Resend shows (SPF, DKIM) to `pintroute.com` in Cloudflare
   (**DNS → Records**). Resend's "Sign in to Cloudflare" button can add them for you.
   Wait until Resend shows the domain as **Verified**.
3. **API Keys → Create API key** with *Sending access*, restricted to `pintroute.com`.
4. Add it to the Worker as the `RESEND_API_KEY` secret (see the table below).

The sender address is the `EMAIL_FROM` variable in `wrangler.jsonc`, and links in emails use
`APP_URL` (`https://pintroute.com`), whichever address the request came in on. Until the key is set,
reset requests still succeed for the user, but no email is sent and the Worker logs an error.

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
| `ADMIN_EMAILS` | **Runtime secret** | Worker → Settings → **Variables and Secrets** → Add → type *Secret* | Comma-separated emails allowed to open the private `/stats` dashboard (must be registered accounts). |
| `RESEND_API_KEY` | **Runtime secret** | Worker → Settings → **Variables and Secrets** → Add → type *Secret* | Resend API key for password-reset emails. |
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

- D1 stores **only Place IDs** plus our own data: crawl name, stop order, visited date and notes,
  and each crawl's country code and **area** (the Place ID of its town/city, or of the country).
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

### Where a crawl is

- New crawls pick a **country** (defaulting to the last one used on that device, else the
  phone's region) and an optional **town or city**, suggested by Places Autocomplete limited to
  that country (`(cities)` types, with a session token so typing plus the final lookup bill as
  one session). The Worker checks the town is in the chosen country.
- Without a town, the country's own Place ID is looked up and stored instead.
- Editors can change the country/town later by tapping the 📍 chip in the crawl's header.
- Once a crawl has stops, pub searches are biased towards, sorted by and labelled with the
  straight-line distance from the **last stop** ("120 m from The Wheatsheaf"); "near me"
  results are measured from the user.
- The area's location and bounds are fetched live (Essentials fields, cached 5 minutes). A crawl
  with no stops opens with the map framed on it, and text searches prefer results there.

### Crawl screens

- **Stops** tab: the crawl as you walk it: meeting point, each pub with "Tick off" (editors) and
  notes (shown to all; only logged-in editors can add or edit them, enforced by the API).
- Sections are switched from the pinned header: on desktop, **Stops** / **Edit crawl** buttons next to Share (the map is always shown beside the list); on phones, a **☰ menu** with Stops, Map, Edit crawl, Share and My crawls. Nothing is fixed to the bottom of the screen, which is left free for the cookie-settings button.
- **Map** tab (phones; always visible beside the list on wide screens): stops, route, meeting point,
  and **Show my location**, a live blue dot with an accuracy circle that follows you as you walk
  while the page is open. The position stays in the browser.
- **Edit crawl** tab (editors): meeting point, reorder (▲/▼) and remove (✕) stops, add pubs, and
  delete the crawl.

### Start time and opening hours

- A crawl can have an optional start date and time (set when creating it, or in **Edit crawl → When**)
  and an optional "time at each pub". Stored as local wall-clock time
  (`crawls.starts_at`, `crawls.minutes_per_stop`).
- With a date but **no** time at each pub, each stop shows its opening hours for that date
  ("Sat 31 Oct: 11:00 – midnight", or "closed all day"), using `openingsOn()` in `src/shared/hours.ts`.
- With a time at each pub as well, each stop instead shows an estimated arrival time: start, plus walking legs, plus time at earlier pubs.
  It also shows whether the venue will be open then ("Open until 11 PM", "⚠ Closes 10:30 PM, soon after
  you arrive", "⚠ Closed then, opens 5 PM"), worked out from Google's opening-hours periods
  (`src/shared/hours.ts`). It uses the dated hours for the next 7 days, which include holidays, and the
  regular weekly hours further ahead.

### Branding on shared crawls

- The crawl header shows a "🍺 Pint Route" wordmark on desktop and a small "PINT ROUTE" label above
  the crawl name on phones. Its contents line up with the page content (same max width as the
  list + map). The browser tab reads "<crawl name> · Pint Route".
- Link previews (WhatsApp, iMessage, Slack…) use Open Graph tags in `index.html` and
  `public/og-image.png` (1200×630).

### Meeting point

- A crawl can have an optional **meeting point** before stop 1. It can be any place (a market,
  station, landmark or address), chosen with Places Autocomplete without a type filter and biased
  to the crawl's town. Only its Place ID is stored (`crawls.meet_place_id`); its name, address and
  location are fetched live.
- The walking route starts there, the map shows it with a 🚩 marker, and before any pubs are
  added, pub searches measure distance from it.

### Walking route

- Routes API (`WALK`) gives each leg's time, distance and line. Google sticks to official
  pedestrian crossings, so two pubs facing each other across a road can get a long detour.
  When the stops are under **200 m** apart and Google's route is more than **twice** the
  straight-line distance, the leg is replaced by the direct way across (straight line, ×1.2
  for the distance, at 1.3 m/s), labelled "just across the road".

### Analytics

- **Cloudflare Web Analytics** (enabled in the dashboard with automatic injection) covers visitors,
  page views, referrers, countries, devices and page speed. It's cookieless.
- **Usage events**: the Worker counts actions as anonymous daily totals in D1 (`usage_daily`):
  crawls created (by country), pubs added/removed/ticked off, searches, shared crawls opened,
  sign-ups, log-ins, password resets. Actions only the browser sees (share sheet, map tab) are
  reported via `POST /api/events` (allow-listed names only). No user, IP or crawl identifiers
  are stored.
- **`/stats`**: a private dashboard (tiles, new-crawl funnel, daily charts, top countries and
  towns) for accounts listed in the `ADMIN_EMAILS` secret.

### Legal and compliance

- **CookieYes** consent banner script is loaded first in `index.html`.
- Legal pages: `/privacy`, `/terms`, `/cookies`, linked from a footer on every page along with
  "Cookie settings" (reopens CookieYes) and a responsible-drinking link.
- Registration requires ticking a legal-drinking-age + Terms/Privacy box. The server rejects
  sign-ups without it and records `terms_version` and `terms_accepted_at` on the account.
- **These pages must be kept in step with the code.** The rules, file locations and data
  inventory are in [`CLAUDE.md`](CLAUDE.md).

### Closed pubs

- Search results hide anything whose `businessStatus` isn't `OPERATIONAL`, and say how many were hidden.
- Stops already on a crawl that later close are **flagged** with a red "Permanently closed" or
  "Temporarily closed" badge, and their map pin turns grey.

### Accounts (optional)

- People can register and log in with **email + password**, but don't have to: guests can
  still create and share crawls exactly as before.
- Passwords are hashed with **PBKDF2-SHA256** (random 16-byte salt, 100,000 iterations, the
  maximum Workers' WebCrypto allows). The iteration count is stored with each hash so it can
  be raised later.
- Logging in sets a random session token in an **HttpOnly, Secure, SameSite=Lax** cookie
  (`pr_session`, 30 days). D1 stores only its SHA-256, so a database leak doesn't expose live
  sessions. Logging out deletes the session.
- Login and registration are **rate-limited** with Workers Rate Limiting bindings: 10 attempts
  a minute per email address, and 60 a minute per IP (looser, because many phones share an IP
  on mobile networks and pub Wi-Fi). Failed logins don't reveal whether an email has an account.
- A crawl created while logged in belongs to that account. On login or sign-up, crawls created
  on that device as a guest are moved into the account, using the edit tokens stored there.
  Owners can edit their crawls from any device they're logged in on. Logging out removes this
  device's edit tokens for the account's crawls, so the next person on a shared phone can't
  edit them.
- **Password reset:** "Forgot password?" emails a one-time link (via Resend) that expires
  after 1 hour; requesting a new link cancels the old one. The token travels in the URL
  fragment (`/reset-password#token=…`) so it never reaches server logs, and D1 stores only
  its SHA-256. Setting a new password signs the account out everywhere and logs in on that
  device. The response is identical, and equally fast, whether or not the email has an account.
- **Not built yet:** changing email or password while logged in, and deleting an account.

### Sharing & editing

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

"edit" means a valid `X-Edit-Token` header **or** a session cookie for the crawl's owner.

| Method & path | Auth | Purpose |
| --- | --- | --- |
| `GET /api/places/search?q=&lat=&lng=&bias=` | – | Text Search (`q`, location-biased by `lat`/`lng`, else by `bias` = `south,west,north,east`; results filtered to drinking spots) or Nearby Search (`lat`/`lng` only: pubs, bars, breweries/taprooms, brewpubs, beer gardens, gastropubs, Irish pubs) |
| `GET /api/places?ids=a,b,c` | – | Live details for stops |
| `GET /api/places/photo?name=&w=` | – | Redirect to a place photo |
| `GET /api/places/cities?q=&country=GB&session=` | – | Town/city suggestions within a country |
| `GET /api/places/anywhere?q=&country=&bias=&session=` | – | Any-place suggestions (for meeting points) |
| `POST /api/auth/register` | – | `{ name, email, password }` → creates account, sets session cookie |
| `POST /api/auth/login` | – | `{ email, password }` → sets session cookie |
| `POST /api/auth/logout` | session | Ends the session |
| `GET /api/auth/me` | – | `{ user }` (or `null`) |
| `POST /api/auth/forgot` | – | `{ email }` → emails a reset link if the account exists (always `{ ok: true }`) |
| `POST /api/auth/reset` | – | `{ token, password }` → sets the new password, ends other sessions, logs in |
| `GET /api/me/crawls` | session | The user's crawls, newest first |
| `POST /api/me/claim` | session | `{ crawls: [{ slug, editToken }] }` → moves guest crawls into the account |
| `POST /api/crawls` | – | `{ name, countryCode?, cityPlaceId?, sessionToken? }` → `{ slug, editToken }` (owned by the user if logged in) |
| `GET /api/crawls/:slug` | optional | Crawl + stops (`canEdit` from the token or ownership, `isOwner`) |
| `PATCH /api/crawls/:slug` | edit | `{ name }`, `{ countryCode, cityPlaceId?, sessionToken? }` and/or `{ meetPlaceId \| null, sessionToken? }` |
| `DELETE /api/crawls/:slug` | edit | Delete crawl |
| `GET /api/crawls/:slug/route?stops=1,2,3` | – | Walking route through the given stop ids in that order (defaults to the saved order): per-leg time, distance and polyline |
| `POST /api/crawls/:slug/stops` | edit | Add a stop `{ placeId }` |
| `POST /api/events` | – | `{ event }` anonymous count for browser-only actions (allow-listed) |
| `GET /api/admin/stats?days=7\|30\|90` | admin | Usage dashboard data |
| `PUT /api/crawls/:slug/stops/order` | edit | Reorder `{ stopIds: [...] }` |
| `PATCH /api/crawls/:slug/stops/:id` | edit | `{ visitedOn: "YYYY-MM-DD" \| null, note }` |
| `DELETE /api/crawls/:slug/stops/:id` | edit | Remove a stop |

### Project layout

```
migrations/            D1 SQL migrations
src/worker/            Worker API (index.ts router, auth.ts accounts, email.ts Resend, crawls.ts D1, google.ts Places/Routes, cache.ts)
src/client/            React app (pages/, components/, auth.tsx, styles.css)
src/shared/types.ts    Types shared by the Worker and the client
wrangler.jsonc         Worker name, D1 binding, rate limiters, assets config
vite.config.ts         React + Cloudflare Vite plugins
```

`npm run typecheck` type-checks both the client and the Worker.

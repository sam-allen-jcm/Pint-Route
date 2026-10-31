# Pint Route: notes for Claude

Pub crawl planner at https://pintroute.com. React + Vite front end, Cloudflare Worker API
(`src/worker`), D1 database (`migrations/`), deployed by Cloudflare Workers Builds from `main`.
See README.md for setup, secrets and the API, and **`docs/ROADMAP.md`** for planned work
(phone apps, monetisation, backlog). Keep the roadmap current as items are built.

## Standing rule: keep the legal pages accurate

The owner's instruction: **"Update the legal pages as necessary as we add features and other
services. We must not get sued."**

So, in the **same change** as any feature that affects any of the following, update the legal
pages and say so in your reply:

- **New personal data** collected or stored (new form fields, columns in `migrations/`,
  anything stored in logs), or existing data used for a new purpose
- **New third-party service** or API, especially if it receives user data or the browser loads it.
  Examples: analytics, an email or SMS provider, payments, error tracking, a CDN, social login.
- **Cookies, local storage or tracking**. Anything non-essential (analytics, ads) also needs
  CookieYes consent before it runs, and it goes in the cookie table.
- **Changes to sharing or visibility** of crawls or profiles, or new user-generated content
  (reviews, photos, comments, messages)
- **Location, contacts, camera** or other device permissions
- **Retention changes**, e.g. new deletion jobs or keeping data longer
- **Payments, subscriptions, ads, affiliate links, competitions or promotions**. These
  need new Terms sections and possibly consumer-law information.
- **New user groups or regions** (e.g. EU/US marketing, under-18s; the app must stay
  legal-drinking-age only)
- **Account features** (deletion, data export, email changes): update the rights and retention
  sections

### Where things live

| What | File |
| --- | --- |
| Operator name, contact email, governing law | `src/client/legal/config.ts` (`LEGAL`) |
| "Last updated" date on all legal pages | `src/client/legal/config.ts` (`LEGAL_UPDATED`) |
| Privacy Policy (data table, processors, transfers, retention, rights) | `src/client/pages/legal/PrivacyPage.tsx` |
| Terms of Use | `src/client/pages/legal/TermsPage.tsx` |
| Cookie Policy (cookie/storage table) | `src/client/pages/legal/CookiesPage.tsx` |
| Version accepted at registration (stored per user) | `src/shared/legal.ts` (`TERMS_VERSION`) |
| Footer links and responsible-drinking line | `src/client/components/SiteFooter.tsx` |
| Cookie banner | CookieYes script at the top of `index.html` |

### Checklist when updating

1. Edit the relevant page(s) so they describe what the code **actually does**. Don't promise
   anything the code doesn't do; if a promise needs code (e.g. a deletion job), build it too.
2. Set `LEGAL_UPDATED` to today's date.
3. If the Terms or Privacy Policy change **materially**, also set `TERMS_VERSION` to today's date
   (new sign-ups record it) and tell the owner that existing account holders should be notified.
4. Update the data inventory below.
5. Tell the owner in your reply what changed in the legal pages and why. Flag anything that needs
   their action (e.g. a new processor's DPA, an ICO fee change, CookieYes rescans/categories) or
   that a solicitor should review: payments, competitions, anything involving minors, health
   claims, or sale of alcohol.

## Data inventory (keep current)

| Data | Where | Retention |
| --- | --- | --- |
| Account: email, display name, PBKDF2 password hash, terms version and acceptance time, email verified time | D1 `users` | Until deletion is requested (by email; no self-serve deletion yet) |
| Email verification tokens (SHA-256, expiry) | D1 `email_verifications` | 3 days validity; deleted when used, superseded, or (expired) when anyone is next sent a link |
| Sessions (SHA-256 of cookie token, expiry) | D1 `sessions`, cookie `pr_session` | 30 days / logout / password reset |
| Password reset tokens (SHA-256, expiry) | D1 `password_resets` | 1 hour validity; deleted when used or superseded |
| Crawls: name, Place IDs, order, visited dates, notes (only logged-in editors can write them), country code, area Place ID, meeting point Place ID, start date/time, minutes per stop, owner | D1 `crawls`, `stops` | Until deleted. An account is required to create one. Public to anyone with the share link once the owner's email is verified (before that, editors only, and link previews are generic). Link previews (`src/worker/sharePreview.ts`) expose the name, town, pub count and start date/time to messaging apps |
| Guest edit tokens, last country | Browser localStorage `pint-route:crawls`, `pint-route:last-country` | Until cleared |
| Location, "near me" | Sent to Worker and Google, not stored; rounded copy cached ≤5 min | Transient |
| Location, "Show my location" (live dot on map) | Browser only (`watchPosition`); never sent to the Worker. Google sees map tile requests for the area shown | Until switched off / page closed |
| IP address, request logs | Cloudflare (Workers observability logs); rate-limiter keys (IP, email, user id) | Short-term |
| Cookie consent | CookieYes cookie `cookieyes-consent` | 1 year |
| Usage stats: anonymous daily counts per event (+ coarse detail such as a country code) | D1 `usage_daily` (written by `src/worker/usage.ts`) | Indefinite (not personal data) |
| Share-link view count per crawl | D1 `crawls.shared_views` | With the crawl |
| Website analytics (pages, referrer, browser, country; cookieless) | Cloudflare Web Analytics (auto-injected beacon) | Cloudflare's retention |

**Usage stats rule:** `usage_daily` must never hold user ids, emails, IPs, session ids or crawl
slugs. If per-user analytics are ever wanted (e.g. PostHog), that needs CookieYes consent, a new
processor and legal updates.

**Processors:** Cloudflare (hosting, D1, logs, cookieless Web Analytics), Google Maps Platform (Places, Routes, Maps JS,
photos; the browser loads Maps directly), Resend (transactional email), CookieYes (consent).
The optional `GOOGLE_CLOUD_SA_KEY` (Monitoring Viewer only) lets `/stats` read aggregate Google
API usage and quotas from Cloud Monitoring (`src/worker/googleCloud.ts`); no user data goes to Google there.
Google Maps terms require us to bind users to the Google Maps/Google Earth Additional Terms and
Google Privacy Policy. Keep that section in the Terms.

**Google Places terms:** store only Place IDs in D1. Names, hours, photos and locations must be
fetched live, with short-lived caching only.

**Anti-spam:** creating a crawl needs an account; share links and previews only work once the
owner has verified their email (`assertVisible` in `src/worker/crawls.ts`); web links are rejected
in crawl names, notes and display names (`src/shared/content.ts`); rate limits cover login,
Google-backed endpoints (`GOOGLE_LIMITER`, per IP) and crawl creation (`CREATE_LIMITER`, per user).
Accounts that existed before verification was added were marked verified by migration 0009.

## Known gaps to close

- No self-serve **account deletion** or **data export** yet. Both are handled by email to
  legal@pintroute.com. Building them is the next privacy improvement.
- No cleanup job yet for long-unused guest crawls (the policy only says we *may* delete them).

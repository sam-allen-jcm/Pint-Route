# Pint Route: roadmap and future work

Planning notes for work that isn't built yet. Keep this file current: when something here gets
built, move it out (or tick it off) and note anything learned.

Anything below that touches personal data, payments, promotions, notifications or app-store
listings also triggers the **legal-pages rule in `CLAUDE.md`**.

---

## 1. Phone apps (iOS and Android)

### Recommended path

Three stages, each useful on its own. Don't skip stage 1.

| Stage | What | Effort | Gets us |
| --- | --- | --- | --- |
| **1. Installable web app (PWA)** | Web manifest, app icons, splash screen, service worker | 2–4 days | "Add to Home Screen" with an icon, full-screen app feel, offline viewing of a crawl already opened. No store fees or review. Also the base for stage 2. |
| **2. Store apps with Capacitor** | Wrap the existing React app in native iOS/Android shells and add native plugins | 2–4 weeks | Listed in the App Store and Google Play, push notifications, native share sheet, deep links. One codebase. |
| 3. Fully native (optional) | SwiftUI/Kotlin, or React Native | 2–3 months | Only if Capacitor hits real limits (e.g. smooth background tracking or heavy map work). The Worker API, D1 and auth are reused unchanged. |

### Stage 1: PWA checklist

- [ ] `public/manifest.webmanifest`: name, short name "Pint Route", theme `#2b1a10`, background
      `#f4e9d4`, `display: standalone`, start URL `/`
- [ ] Icons: 192, 512 and maskable 512 PNGs, plus an Apple touch icon (180) generated from
      `public/favicon.svg`
- [ ] Service worker (e.g. `vite-plugin-pwa`/Workbox): cache the app shell; cache each opened
      crawl's API response so it's readable with poor signal in a pub basement
- [ ] An "Install app" prompt on Android, and short "Share → Add to Home Screen" instructions on iOS
- [ ] Check CookieYes, Maps and login all behave in standalone mode

### Stage 2: Capacitor apps

**Setup**
- `@capacitor/core`, `@capacitor/ios` and `@capacitor/android`, with the Vite build output as the web
  dir. Bundle IDs, e.g. `com.pintroute.app`.
- **Accounts:** Apple Developer Program (£79/$99 a year) and Google Play Console ($25 once).
- **No local Mac needed:** build and sign in the cloud with **Codemagic**, **Ionic Appflow**
  or **Xcode Cloud**, triggered from GitHub like Workers Builds.

**Changes the app will need**
- **API base URL:** the app's pages load from `capacitor://localhost` (iOS) or
  `https://localhost` (Android), not pintroute.com. All `fetch('/api/…')` calls need an
  absolute base (`https://pintroute.com`), and the Worker needs **CORS** for those origins.
- **Auth:** cookie sessions are unreliable across that origin boundary (SameSite / third-party
  cookie rules in WKWebView). Add a **bearer-token login for the apps** (same `sessions` table,
  token in the `Authorization` header), and store it in the **iOS Keychain / Android Keystore**
  (e.g. `@capacitor/preferences` with a secure-storage plugin). Guest edit tokens move there too.
- **Maps:** the browser key is restricted by website, which doesn't work inside an app. Either:
  - use `@capacitor/google-maps` (native Maps SDK, with separate **iOS bundle-ID** and
    **Android package + SHA-1** restricted keys), or
  - keep the JS map and add app-restricted keys.

  The native SDK feels better.
- **Location:** `@capacitor/geolocation` for "Show my location", with proper permission strings.
  *Background* location (tracking with the phone locked) is possible but invites strict App
  Store review and needs a strong justification. Start with foreground only.
- **Deep links:** Universal Links (iOS, `apple-app-site-association`) and App Links (Android,
  `assetlinks.json`), served by the Worker from `/.well-known/`, so `pintroute.com/c/<slug>`
  opens in the app if installed and the website otherwise.
- **Native share sheet:** `@capacitor/share`.
- **Push notifications:** `@capacitor/push-notifications` + Firebase Cloud Messaging / APNs.
  Ideas: "Steve's Birthday starts in 1 hour", "You're near your next stop". Needs a
  `push_tokens` table, opt-in, and legal updates.
- **Haptics** on tick-off: `@capacitor/haptics`.

**Store requirements**
- **Age rating:** alcohol is a central theme, so expect **18+** on the App Store (the "alcohol"
  content descriptor) and the equivalent IARC rating on Google Play. The in-app age confirmation
  already exists.
- **Apple guideline 4.2 (minimum functionality):** a bare website wrapper gets rejected. Native
  share, push, deep links, offline crawls and native maps are what get it approved.
- **Sign in with Apple** is only *required* if we add other third-party logins (Google,
  Facebook). Email + password alone doesn't need it.
- **Account deletion must be possible in the app** (Apple requirement since 2022). Build
  self-serve deletion first (see backlog).
- Privacy "nutrition labels" (App Store) and the Data safety form (Google Play) must match
  `CLAUDE.md`'s data inventory.
- Store listings need a privacy policy URL (`/privacy`), a support URL and contact email, and
  screenshots.

**Legal updates when this ships:** new processors (Firebase/FCM, APNs, the build service if it
handles data), push-notification data, app identifiers, and possibly background location. Add
store-specific terms (Apple's standard EULA, or our Terms adapted).

---

## 2. Monetisation

### Principles

- **Free core forever:** creating, sharing, walking and ticking off crawls. That's the growth
  engine, because every shared link is free marketing.
- **Charge for things groups value on the night**, not for basics.
- **Never sell personal data.** Aggregated, anonymous insights only.
- **Alcohol marketing is regulated.** In the UK, the **CAP Code section 18** (ASA) covers alcohol
  ads, and the **Licensing Act 2003 mandatory conditions** ban irresponsible promotions such as
  "drink as much as you can" deals or drinking games. Nothing we sell or promote may encourage
  excessive or underage drinking. Get **solicitor review** before launching paid promotions or
  venue deals.
- **Google Maps Platform costs grow with use** (Places details with opening hours are the most
  expensive call). Revenue has to cover API costs per active crawl, so watch the Google Cloud
  billing dashboard and `/stats`.

### Options, in recommended order

**1. "Party Pack": a one-off upgrade per crawl (best first step)**
Pub crawls are occasional, so a **per-event purchase (≈ £3.99–£6.99)** suits them better than
a subscription. It suits stag and hen dos, birthdays and work socials. It could unlock:
- **RSVPs and a group list:** who's coming, and who's joining at which pub
- **Live group locations:** opt-in, for the night only, then auto-deleted
- **A kitty and bill-splitting tracker:** who bought which round
- **Fun extras:** custom crawl themes, a printable or shareable "crawl card" image, a dress code,
  forfeits and challenges (kept responsible, with no drinking games)
- **Photos per stop and an after-party recap page**

On iOS, unlocking digital features inside the app generally has to use Apple's in-app purchase
(15–30% fee). Selling the pack on the website (Stripe) and honouring it in the app is cheaper,
but check Apple's current rules for the UK/EU at the time.

**2. Venue partnerships (once there's traffic)**
- **"Featured" placement** in search results, always clearly labelled *Sponsored*, and only for
  venues that match the search anyway
- **Venue profiles and deals:** e.g. "10% off food for Pint Route groups", or "reserved area
  for groups of 8+"
- **Group booking requests** passed to the venue, possibly with a booking fee or commission
- **Pricing:** a flat monthly fee per venue (≈ £15–£50), or per redeemed deal

Google's terms: our sponsored content must be clearly separate from Google-sourced data. We
can't modify or present Places data as our own endorsement.

**3. Branded and official trails (B2B)**
- **Breweries and pub groups:** "The official Northern Monk taproom trail", or a branded crawl
  for a pub group's estate
- **Tourism boards, BIDs (Business Improvement Districts) and festivals:** curated "heritage pub
  trails", CAMRA-style ale trails, and beer festival maps
- **Corporate socials and event organisers:** private branded crawls for team events
- **Pricing:** setup fee plus annual licence. A few contracts can outweigh lots of small
  consumer payments.

**4. Affiliate links (easy, low effort)**
- **Getting home safely:** taxi or ride-hailing referral links at the last stop. This is
  revenue that's also good for responsible drinking.
- **Trains and hotels** for crawls in another city
- **Brewery tours and experiences** (e.g. GetYourGuide/Viator affiliate programmes)

**5. Merch (fun, good margins)**
- **Print-on-demand t-shirts** for stags, hens and birthdays, printed with the crawl's name and
  route (Printful/Printify, no stock to hold)

**Probably not:** display ads (poor experience, low revenue at our scale, and alcohol-ad rules
add risk), or paywalling core features.

### What to build first (when we get there)

1. Self-serve account deletion and data export (needed anyway for the app stores)
2. Stripe on the web, with a `purchases` table and a "Party Pack" flag per crawl
3. RSVPs and the group list (the most-wanted Party Pack feature, and useful free in a basic form)
4. Venue "deals" (curated by us at first, not self-serve)

Each needs Terms updates (payments, refunds, the 14-day cancellation right for digital content
under the Consumer Contracts Regulations), Privacy updates (Stripe as a processor), and VAT
registration once over the threshold. Get a solicitor to review.

---

## 3. Backlog (smaller items)

- [ ] **Self-serve account deletion and data export** (privacy gap, needed for the App Store)
- [ ] **Change email and password** while logged in
- [ ] **Clean-up job** for long-unused guest crawls (Cron Trigger; the Privacy Policy already
      says we *may* delete them)
- [ ] **Per-crawl preview image:** a generated image with the crawl name and stop count (e.g.
      Workers + `@vercel/og`/Satori), to go with the per-crawl title already in
      `src/worker/sharePreview.ts`
- [ ] **"Directions" link per leg** that opens Google Maps walking navigation
- [ ] **Skip visited / closed pubs** in the remaining route
- [ ] **Drag-to-reorder** stops (currently ▲/▼ buttons)
- [ ] **Rate limiting** on the public Google-backed endpoints (`/api/places/*`), to cap API spend
      if someone abuses them

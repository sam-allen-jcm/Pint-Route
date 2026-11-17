# Pint Route: roadmap and future work

Planning notes for work that isn't built yet. Keep this file current: when something here gets
built, move it out (or tick it off) and note anything learned.

Anything below that touches personal data, payments, promotions, reviews, notifications or
app-store listings also triggers the **legal-pages rule in `CLAUDE.md`**.

---

## 0. The plan on one page

**Where we're heading:** from a pub *crawl* planner to the place people go to find **the right
pub**: the one showing the match, with a pool table, a good tap list and food until 9. Pubs,
breweries and taprooms manage their own profiles, and that's what we eventually charge for.
Crawls stay free and remain the social hook ("every shared link is free marketing").

**What makes us different from Untappd and friends:** Untappd is great at rating beers but
cluttered and weak socially. We stay simple and venue-first: *where should we go tonight, and
with whom?* Answer that well on a phone in under 10 seconds and the rest follows.

**Phases** (each one is useful on its own; estimates are for one developer working with Claude):

| Phase | What | Rough size | Depends on |
| --- | --- | --- | --- |
| **0. Foundations** | Security hardening, automated tests and CI, admin roles, our own `venues` table seeded from open data | 2–3 weeks | – |
| **1. Venue directory** | Search pubs/breweries/taprooms, venue profile pages, "all pubs in an area" pages, filters | 3–4 weeks | 0 |
| **2. For Businesses** | Claim a venue, verify the claimant, owner dashboard, edit profile, Business Terms | 3–4 weeks | 1 |
| **3. Features and sport** | Structured features (pool, darts, Sky/TNT, garden, dogs…), crowd-confirmed; "showing the match" listings | 3–4 weeks | 1 (2 for owner edits) |
| **4. Beer** | Breweries and beer catalogue, tap lists with freshness, snap-the-board photo import, crowd pint prices | 4–6 weeks | 2 |
| **5. Ratings** | Structured ratings and the type-aware Pint Route Score (section 5) | 3–4 weeks | 1 (3 for venue types) |
| **5b. Social community** | Friends, crews on crawls (RSVP, shared progress, everyone rates), local feed, pub events, notifications, badges (section 6) | 5–7 weeks | 5; events need 2 |
| **6. Money** | Venue Pro subscription, local sponsored placement, brewery tier, Stripe billing | 3–4 weeks | 2 (+ traffic) |
| **7. Apps** | PWA, then App Store / Google Play (section 10) | see section 10 | ideally after 3 |

**Decisions needed from the owner** (each is discussed in the section shown):

1. **UK only at first?** Recommended: yes. Our open data, licensing law and sport channels are all UK-specific (section 1).
2. **Build our own venue database from open data** (Food Standards Agency, optionally OpenStreetMap) and link it to Google, rather than relying on Google alone? Recommended: yes (section 1).
3. **How claimants are verified:** phone-call code to the venue's listed number, plus Google Business Profile sign-in, with manual review as a fallback? (section 2)
4. **Prices:** crowd-reported "price of a pint" with dates, owners optional? (section 4)
5. **Sport fixtures:** pay for a licensed fixtures feed, or let pubs type in what they're showing? (section 3)
6. ~~Written reviews of pubs?~~ **Decided:** no free text; a structured, type-aware rating system instead (section 5).
7. **Business set-up:** stay as SA Consulting, or form a limited company before taking money from venues? (section 9)
8. **Friends model:** mutual friends (request and accept, recommended) or one-way following like Instagram? (section 6)
9. **Direct messages:** leave them out and link to WhatsApp instead (recommended), or build chat? (section 6)

---

## 1. Venue directory and profiles

### What users get

- **Search** for a pub, bar, brewery or taproom by name, or browse **near me** / **in an area**
  ("all pubs in Reading", "pubs in RG1"), as a list and on a map.
- **Filters:** open now, showing sport (and which channel), pool/darts, beer garden, dog
  friendly, food now, real ale, craft/taproom, live music, quiz night, step-free access…
- **Venue profile page** `/v/<slug>` (e.g. `/v/the-nags-head-reading`): photos, opening
  hours, map, features, what's on, beers on tap, food, links, and crawls that include it.
  Plus buttons for **add to a crawl**, **directions** and **share**.
- **Area pages** `/pubs/reading`, `/pubs/rg1`: the landing pages for search engines, and later
  the place where local sponsored slots live.

### Where the data comes from (important)

Google's Places terms say we may **store Place IDs only**. Names, hours, photos and ratings must
be fetched live, with only short temporary caching, and can't be used to build our own
database. Relying on Google alone has three problems:

1. **Cost:** every profile view and every row in an area list is a paid Place Details call.
   Search-engine crawlers visiting thousands of venue pages would run up the bill.
2. **SEO:** pages made of Google content can't really be indexed as our own content.
3. **Lock-in:** if Google changes prices or terms, the directory is gone.

**Recommendation: our own `venues` table, seeded from open data, linked to Google:**

| Source | What it gives us | Licence | Notes |
| --- | --- | --- | --- |
| **Food Standards Agency hygiene ratings** (API and bulk download) | Name, address, postcode, lat/lng and business type for almost every UK premises serving food or drink, including type "Pub/bar/nightclub" | **Open Government Licence** (store and reuse freely, with attribution) | Best base layer for the UK. Includes Scotland. Refreshed daily. |
| **OpenStreetMap** (`amenity=pub/bar`, `craft=brewery`) | Names, locations, some tags (real ale, garden, food) | ODbL: **share-alike** if we publish a derived database | Useful to cross-check; take legal care before mixing it into our database |
| **Google Places** (live) | Opening hours, photos, rating, "permanently closed", phone, website | Live display only; store the Place ID | Linked by matching name and location; fetched only when someone opens a profile |
| **Owners** (once claimed) | Everything they choose to add | Licensed to us under the Business Terms | Always wins over other sources |
| **Users** (crowd) | Features, pint prices, photos, corrections | Licensed to us under the Terms | Shown with "confirmed by 5 people · 3 days ago" |

**Cost controls:** area lists come from *our* table (no Google calls). Google is only called
for a single profile someone actually opens, and photos only load on demand.
`robots.txt` and rate limits stop crawlers walking every profile. Keep a Google Cloud budget
alert and daily caps (now visible on `/stats`).

### Data model (sketch)

`venues` (id, slug, name, kind: pub/bar/brewery/taproom/bottle-shop, address, postcode,
outward code e.g. `RG1`, lat, lng, google_place_id, fsa_id, osm_id, status, claimed_by,
created/updated), `venue_features` (venue, feature, value, source, confirmations,
last_confirmed), `venue_hours_override` (owner's own hours, which win over Google),
`venue_photos` (R2 key, uploader, moderation state), `areas` (towns, districts and postcode
areas for area pages). Name search: D1 FTS5. "Near me": a bounding-box query on indexed
lat/lng, then exact distance.

---

## 2. For Businesses: claiming a venue

A **"For businesses"** link in the footer and on every unclaimed profile ("Is this your pub?
Claim it free") leads to `/business`: a pitch page, then **search for your venue** (from our
venue table, so nobody can create a fake place), then **claim it**.

### Verifying that the claimant really runs the venue

No single method is perfect, so we offer tiers, quickest first:

| Method | How it works | Strength | Cost / effort |
| --- | --- | --- | --- |
| **Google Business Profile sign-in** | Claimant signs in with Google; the Business Profile API lists the locations they manage; if it matches this venue's Place ID, they're verified | Strong (Google has already verified them) | Free, but needs Google to approve our API access (apply early) |
| **Phone call to the listed number** | We phone the venue's number *as listed on Google* (never one the claimant types in) and a robot reads out a 6-digit code | Strong: you must be in the pub to answer | ~5–10p per call (e.g. Twilio Verify, a new processor) |
| **Email at the venue's own domain** | Code sent to `anything@<domain of the venue's listed website>` | Medium (watch for shared domains like pub-company sites) | Free (Resend) |
| **Postcard to the venue address** | Code posted to the premises | Strong but slow (3–5 days) | ~£1 per postcard (print-and-post API) |
| **Manual review** | Upload a **premises licence** (the licence holder and DPS appear on the council's public register) or a recent business bill; we check by hand and delete the document afterwards | Strong if done carefully | Our time |

**Recommended:** phone code + Google sign-in as the automatic routes, manual review as the
fallback. Rules:
- One **owner** per venue, who can invite **managers/staff** (roles).
- **Pub groups** (e.g. a managed estate) get a multi-venue account. Verify the company once,
  then add sites.
- **Disputes and changes of hands:** tenancies change often. A new claim on an
  already-claimed venue triggers a review; the old owner is notified; claims lapse if an
  owner stays inactive for 12 months.
- **2-factor sign-in is required** for business accounts (section 8).
- **Audit log** of every profile change (who, what, when), so a bad actor can be rolled back.
- A **"Claimed ✓"** badge only appears after verification.

### Owner dashboard (first version)

Edit description, hours overrides, features, food times, links (menu, booking, socials), photos
(upload with moderation), events, and later tap list and sport. Basic stats: profile views,
times added to crawls, direction taps. All free, because claimed profiles are what make
the directory good.

---

## 3. Features, sport and "what's on"

### Features: a fixed list, not free text

Free text can't be filtered, so features are a **fixed, structured list**, grouped:
- **Sport:** Sky Sports, **TNT Sports** (formerly BT Sport), Amazon Prime Video sport,
  Premier Sports, number of screens, big screen/projector, sound on for big games,
  "shows racing", "shows rugby/cricket/darts/F1/boxing/NFL"
- **Games:** pool, snooker, darts, table football, shuffleboard, board games, quiz night (day),
  karaoke, live music (days)
- **Drink:** real ale/cask (CAMRA-style; don't use CAMRA's trademarks), craft keg, taproom /
  brewery on site, cider focus, cocktails, low/no alcohol range, wine list
- **Food:** food served (times), Sunday roast, vegetarian/vegan options, kitchen closes at
- **Space:** beer garden, roof terrace, covered/heated outdoor area, function room,
  accommodation, parking, EV charging
- **Who's welcome:** dog friendly, family friendly (until what time), student pub, sports pub,
  quiet pub, LGBTQ+ friendly
- **Access:** step-free entrance, accessible toilet, hearing loop
- **Practical:** card only / cash only, late licence (until what time), Wi-Fi

**Who fills it in:**
1. **The crowd, from day one** (most pubs won't claim for a long time). Anyone logged in can
   say "has a pool table" or "no longer shows Sky". Each feature shows its confirmations and
   when it was last confirmed, and fades out if nobody re-confirms it. Visitors who have
   just checked in get a quick "still true?" prompt.
2. **Owners** of claimed venues can set features directly, and their answer wins (marked
   "from the venue").

### Sport: "who's showing the match?"

- A **fixtures list** (football, rugby, cricket, F1, boxing, darts…) where each fixture shows
  "showing near you". Venues tick the fixtures they're showing (plus "sound on", "booking
  advised"). The crowd can report "was showing it ✓".
- A "**Showing tonight**" filter on area pages and in search.
- **Fixture data licensing:** Football DataCo licenses Premier League/EFL/SPFL fixture lists
  and asserts rights in them. The legal position is contested, but in practice media
  companies license them. **Options:** (a) buy from a sports-data provider whose licence
  covers this use (budget roughly £50–£300 a month to start, check the licence terms), or (b) let
  venues type in what they're showing (cheaper, messier). **Get legal advice before
  launching football fixtures.**
- **Brand names:** "shows Sky Sports" is a fair descriptive use of the name. **Don't use
  Sky/TNT logos.** Business Terms must say venues are responsible for holding a
  **commercial** subscription for any sport they show. We don't want to promote pubs
  showing sport illegally on domestic subscriptions.
- **Competitors to know:** Matchpint (sport-in-pubs app), the broadcasters' own pub finders,
  WhatPub (CAMRA, real ale), Untappd (beer). Our angle is everything in one simple place,
  plus crawls.

---

## 4. Beer, tap lists and prices

### Beer catalogue

- `breweries` and `beers` (name, style, ABV, brewery) tables, our own. **Breweries claim
  their profile** (same verification as venues) and manage their own beer list. Users can
  suggest missing beers, which are de-duplicated before going live.
- Don't plan on the Untappd API: it's largely closed to new apps and its terms are
  restrictive. If we want ratings of beers later, we can add simple thumbs/notes ourselves.

### Tap lists that stay fresh (the hard part)

Pubs won't keep a list up to date unless it takes seconds. Ideas, roughly in order of payoff:

1. **"Still on?" one-tap updates:** the owner sees today's list and taps off anything that's
   run out. A beer goes on in two taps from the brewery catalogue.
2. **Snap the board:** the owner (or a regular) photographs the chalkboard or tap wall, and AI
   (e.g. Claude's vision) reads it into a draft tap list for one-tap approval. This is the
   lowest-effort way for pubs and a genuine differentiator. **New processor** (Anthropic), so
   Privacy updates are needed, and photos must be checked for faces.
3. **Freshness labels everywhere:** "Updated today" / "3 days ago" / hidden after 14 days
   without an update, so stale lists never mislead.
4. **Integrations later:** tap-list and stock systems some bars already use (e.g. Untappd for
   Business, BeerMenus-style tools) and EPOS systems. Partner talks only once we have traffic.
5. **Brewery "where to find our beer"** pages: breweries report which venues stock them.
   Breweries are a natural *paying* customer for this (section 7).

### Prices

Most pubs won't publish prices or keep them current. Recommended approach:
- **Crowd-reported "price of a pint"**: after a check-in, "what did you pay for a pint of
  ___?". Store the beer, price, date and reporter (shown only as aggregated). Show "Pint from
  £4.60 · reported 2 days ago" and a **£/££/£££ band** per venue.
- **Owners can optionally** add prices to tap-list items.
- This feeds great marketing: a "**Pint Price Index**" (cheapest/average pint by town), which
  is very press-friendly.
- Label prices clearly as "reported by visitors, check at the bar" (consumer-protection
  accuracy), and reject outliers automatically.

---

## 5. Ratings and the Pint Route Score

**Owner's decision:** no free-text reviews. Instead a **structured rating system**: quick to
give, hard to game, nothing to moderate, and much more useful than an average of stars,
because it rates a pub **against what kind of pub it is**. The aim: the best database of pubs,
taprooms and breweries in the UK.

### The core idea: describe first, then rate

A single star average misleads. A great local boozer and a great craft bar are good at
different things, and someone after 20 craft keg lines doesn't care that the Red Lion has
"only" 4 well-kept cask ales. So every rating has two halves:

**1. Describe it (facts, not opinions).** These build the venue's **character profile**:
- **What kind of place is it?** Pick up to 2 from a fixed list: *Local boozer · Traditional /
  real ale pub · Craft beer bar · Brewery taproom · Sports pub · Gastropub · Bar / cocktail
  bar · Student pub · Music / late venue · Hotel or chain pub*. Votes from many people (plus the
  owner's own pick and data signals such as tap-list make-up, sports channels and food
  service) settle on the venue's **type**, e.g. "Local boozer (82% agree)".
- **Price level:** £ / ££ / £££, plus optionally "what did you pay for a pint of ___?". This is
  a fact, not a score: cheap isn't "better" for everyone.
- **Vibe chips:** quiet / lively / loud, music, busy at weekends, family-friendly, dogs
  about, standing room only…
- **Did you eat? Watch sport? Use the garden?** These unlock the optional factors below.

**2. Rate it (1–5 on each factor that applies):**

| Factor | What it means | Shown when |
| --- | --- | --- |
| **Beer quality** | Condition, temperature, clean glass, well-kept cask | Always |
| **Beer range** | Range *for this kind of place* ("a good range for a local" is judged differently from a craft bar) | Always |
| **Value for money** | Fair for what you get. This is different from price level: a £7 pint can be good value in a top craft bar | Always |
| **Hospitality** | Friendly, welcoming to everyone, quick service, staff who know their beer | Always |
| **Atmosphere** | Did it feel like a good pub to be in? | Always |
| **Facilities** | Seating, toilets, cleanliness, accessibility, garden | Always |
| **Food** | Quality and value | Only if they ate |
| **Sport viewing** | Screens, sound, sightlines, room to watch | Only if they watched |

**Quick tags (fixed list, no free text):** "great cask", "interesting guest beers", "friendly
staff", "knowledgeable staff", "clean toilets", "good for groups", "dog bowls", plus the
negatives "warm beer", "slow service", "dirty toilets", "felt unwelcoming". These are shown as
counts ("14 people said: friendly staff"). They're specific and useful, with nothing to
moderate and little defamation risk.

**Time to complete: about 30 seconds.** Prompted at the natural moments: after ticking a pub
off on a crawl, after a check-in, or the next morning ("How was The Bell last night?"). One
rating per person per venue, updatable on later visits.

### Calculating the scores

- **Factor scores** use a *Bayesian average*: each venue starts at the average for its *type*
  and moves towards its own ratings as they come in. So 2 five-star ratings don't beat 200
  ratings averaging 4.6.
- **Recency:** older ratings count less (e.g. half weight after 12 months), because pubs change
  hands and landlords. A venue's score can recover after new management (the owner can flag "under new
  management", which speeds up the decay).
- **Trust weighting:** a **verified visit** (check-in confirmed by the phone's location at the
  time, or ticked off on a crawl that day) counts fully; an unverified rating counts half;
  brand-new accounts and accounts with suspicious patterns count less.
- **The Pint Route Score (0–100)** combines the factor scores **with weights that depend on the
  venue's type**, so each place is judged on what it's trying to be. Example starting weights
  (to be tuned against real data):

  | Factor | Local boozer | Craft bar / taproom | Real ale pub | Sports pub | Gastropub |
  | --- | --- | --- | --- | --- | --- |
  | Beer quality | 20% | 25% | 30% | 15% | 15% |
  | Beer range | 5% | 25% | 20% | 5% | 10% |
  | Value | 20% | 10% | 15% | 15% | 10% |
  | Hospitality | 25% | 15% | 15% | 15% | 20% |
  | Atmosphere | 20% | 15% | 15% | 20% | 15% |
  | Facilities | 10% | 10% | 5% | 10% | 10% |
  | Food / Sport | – | – | – | Sport 20% | Food 20% |

- **Confidence:** no headline score until a venue has at least ~5 ratings (it shows "Not enough
  ratings yet" and the character profile instead). Scores show their basis: "87 · from 64
  ratings".
- **"Best in town" lists** use the type-aware score: Top locals in Reading, Top craft bars in
  Leeds, Best for sport in Manchester. That's far more useful than a single league table.

### Personal match: "92% your kind of pub"

Users can (optionally) set their tastes: *what I like* (craft, cask, quiet locals, sport,
food…) and *what matters* (range, value, atmosphere…). Each venue then shows a **match %**
for them, combining the type-aware score with their preferences and the features they need
("must show Sky", "dog friendly"). Search can sort by "Best match". Preferences are stored
against the account, and editable and deletable in My account.

### Keeping it honest (and legal)

Star ratings with no text are still **consumer reviews** under the **DMCC Act 2024**, so the
fake-review duties apply. Safeguards, which also keep the data good:
- Email-verified accounts only; one rating per venue; rate limits; ratings editable but each
  edit re-dated.
- **Business accounts can't rate their own venue**, and their ratings of venues within a few
  miles of their own count for nothing (published policy, so competitors can't sink each
  other).
- **Anomaly detection:** bursts of ratings, clusters of new accounts, the same network or
  device, people who only ever give 1s or 5s. Suspicious ratings are held back from scores
  pending review. Owners can **flag ratings** they think are fake.
- **No incentives tied to sentiment:** badges for *rating* pubs are fine, rewards for
  *positive* ratings are not. Venues can put "Rate us on Pint Route" QR codes up, but can't
  invite only happy customers. **Paying for Pro or a sponsored slot never affects scores**,
  and we say so publicly.
- A public **"How our scores work"** page (method, weights, safeguards). This is required
  transparency, and builds trust.
- Ratings are **personal data** linked to the account. Publicly they appear only as
  aggregates (and, if a user chooses, on their own public profile).

### Making it the best pub database in the UK

- **Coverage target per town:** track "% of venues with 5+ ratings" and point users at gaps:
  "3 pubs on your crawl have no ratings yet".
- **The crawl is the engine:** every crawl tick-off is a rating prompt, so each crawl can
  produce 4–8 ratings without asking much.
- **Local scouts:** trusted regulars (high verified-visit counts) get a badge, and their
  "still true?" answers and type votes carry more weight.
- **Annual "Pint Route Awards"** by town and type (Best local in Reading 2027), from the
  scores. Venues love a window sticker, the press love a list, and both bring traffic.
- **Breweries:** taprooms are rated as venues. Beers themselves get a lighter rating later
  (thumbs up/down plus "tasted at" which venue), feeding "where's it good on tap?"

### Data model (sketch)

`venue_ratings` (venue, user, visited_on, verified_method, weight, created/updated, held_for_review),
`venue_rating_scores` (rating, factor, 1–5), `venue_rating_tags` (rating, tag),
`venue_type_votes` (rating, type), `venue_scores` (venue, factor, score, count, confidence,
computed_at; recomputed on write plus nightly for decay), `user_preferences` (user, likes,
weights, must-haves). Crawl ratings (the 1–5 stars on public crawls) stay separate.

---

## 6. Social community

Keep it simple and centred on *going out together*, not a general social network. Every
social feature should lead to people meeting in a pub, and produce better data along the way
(ratings, check-ins, features).

### Friends

- **Mutual friends** (request and accept), not one-way following: it suits planning nights out
  with people you know, and keeps check-ins private. Find friends by **username**, by an
  **invite link** ("Join me on Pint Route"), or by adding people you've been on a crawl with.
  No contact-book upload (privacy- and app-store-sensitive). Maybe later, opt-in only.
- **Public profile** `/u/<username>`: public crawls, badges, towns visited, and (if the user
  chooses) their ratings. Everything else is friends-only or private.
- **Privacy controls in My account:** who can send me requests (everyone / friends of friends
  / nobody), who sees my check-ins (friends / nobody), and whether I appear in "who's here".
  Plus **block** and **report** on every profile. Defaults are the most private sensible
  option.

### Crawls with friends ("the crew")

- The organiser **adds friends to a crawl** (or shares an invite link). Each person gets a
  role: **organiser** (everything), **co-organiser** (edit stops and times) or **going**
  (view, tick off, rate, chat-free).
- **RSVP:** going / maybe / can't make it, plus "joining at stop 3". The organiser sees the
  list; it replaces chasing people on WhatsApp (and becomes a Party Pack perk, section 7b).
- **Shared progress:** anyone in the crew can tick a pub off, and everyone sees where the group
  is now ("The crew is at stop 3: The Bell"). Live location stays opt-in and time-limited.
- **Notifications:** crawl starts in an hour, stop changed, someone joined. By email now, and
  push once there's an app. Each type can be switched off.
- **Each person rates:** after each pub, everyone in the crew gets the 30-second venue rating
  (section 5). These are **verified visits**, so they're the most trusted ratings we get.
  At the end, everyone rates **the crawl** (1–5), and gets a **recap card**: route, pubs, who
  came, distance walked, everyone's favourite stop. Easy to share, and free marketing.
- **Crawl ratings:** ratings from people who actually did the crawl are marked "went on it"
  and weighted above ratings from people who only browsed it in the Community. That extends
  today's crawl rating, where only public crawls can be rated.

### Local feed ("What's on near you")

A home-screen feed for the user's area (the town they choose, or near me when they've tapped
it), mixing:
- **Pub events:** quiz nights, live music, tap takeovers, meet-the-brewer, beer festivals,
  "showing the match tonight" (sections 2 and 3).
- **New and trending:** newly claimed venues, new taprooms, highest-rated this month, a
  venue's new beer on the board.
- **Community:** new public crawls in the area, crawls friends are going on (with a "join"
  button if invited), friends' check-ins and new badges.
- **Ranking:** relevance to the user (distance, their tastes from section 5, friends
  involved), then freshness. **Sponsored items** are clearly labelled and capped (e.g. 1 in
  10), and never shown as friend activity.

### Local pub events

- **Venues post events** from the owner dashboard: title, date/time, type (quiz, live music,
  sport, tap takeover, food night, festival), optional ticket/booking link, and a repeat rule
  ("every Tuesday"). Free for claimed venues; Pro venues get promoted placement (section 7a).
- **Users can add events** for unclaimed venues ("Quiz every Wednesday"), confirmed by others,
  like features. Free text is kept short and checked for links and banned words, with a report
  button.
- Users can tap **"Interested"** / **"Going"**, add the event to a crawl ("start at the quiz"),
  and add it to their calendar (.ics download, no third-party calendar access).
- **Event listings** per area and per type: "Quiz nights in Reading this week", "Tap
  takeovers in Leeds". These are great search-engine landing pages too.

### Things to steer clear of (for now)

- **Direct messages and group chat:** high moderation burden and the heaviest **Online Safety
  Act** duties. Groups already use WhatsApp, so link to it ("share to the group") instead.
- **Public "who's in the pub right now" lists:** a safety risk (stalking, harassment). Only
  ever friends-only and opt-in.
- **Drinking-volume features** (pints counted, "drink 5 beers" challenges): against the CAP
  Code and Portman Group spirit, and bad for the brand. Badges reward **places**, not **pints**.

### Badges

"Visited 10 pubs in Leeds", "5 breweries' taprooms", "a pub near every Premier League ground",
"First to rate a new venue", "Local scout" (section 5).

### Legal and safety checklist for this phase

New personal data (friendships, check-ins, RSVPs, crawl membership, event attendance,
preferences) goes in the Privacy Policy and data inventory. Notification emails need an
unsubscribe link for each type. User-posted events and photos need an **Online Safety Act**
risk assessment, reporting tools and a published approach to illegal content. Block and
report must exist **before** friends launch. Location features stay opt-in, time-limited and
off by default.

### Data model (sketch)

`friendships` (user_a, user_b, status, requested_by, created), `blocks`,
`crawl_members` (crawl, user, role, rsvp, joining_at_stop), `check_ins` (user, venue, at,
verified, visibility), `events` (venue, title, type, starts_at, repeat_rule, source:
owner/user, confirmations, status), `event_responses` (event, user, interested/going),
`notifications` (user, type, payload, read_at) and `notification_prefs`, `feed_items`
(computed per area, or built at read time from the tables above).

---

## 7. Monetisation

### 7a. Venue and brewery side (new: the main revenue engine)

**Principle:** claiming and basic profiles are **free forever**. Supply first; charge for
reach and tools.

| Product | For | What they get | Price idea |
| --- | --- | --- | --- |
| **Venue Pro** | Pubs, bars, taprooms | Featured photos, events and sport listings with "promoted" styling, tap-list tools (board scan), offers, analytics (views, crawl adds, direction taps by day, full rating breakdown and trends by factor). Never any influence over scores | £15–£30/month per venue; discounts for groups |
| **Local sponsored placement** | Venues | A clearly labelled **Sponsored** slot at the top of an area's results, near-me results and fixture listings for **one postcode district** (e.g. RG1), at most 1–2 per district, and only when the venue matches the user's filters | Fixed monthly price per district (e.g. £20–£80 by demand) or a monthly bid; start with fixed |
| **Brewery tier** | Breweries | Beer catalogue tools, "where to find our beer" stock locator, taproom profile, events, data on where their beers are checked in | £20–£50/month |
| **Event / crawl partnerships** | Breweries, BIDs, tourism boards, festivals | Branded official trails (section 7b, option 3) | Per-campaign fee |

**Targeting by location without tracking people:** show sponsored venues for the **area being
viewed or searched** (contextual), or the user's location only when they've tapped "near
me". Cloudflare also gives an approximate city and postcode district per request
(`request.cf`), which we can use transiently without storing it. That avoids profiling and
cookies, and so avoids extra consent banners. **Don't build ad-style tracking.**

**Rules for anything promoted:** always labelled "Sponsored" (CAP Code and CMA guidance);
alcohol promotions must not encourage excessive or irresponsible drinking (Licensing Act
2003 mandatory conditions; Scotland and Wales have extra pricing and promotion rules); no
appeal to under-18s. Offers like "10% off food for Pint Route users" are lower risk than
alcohol discounts. **Solicitor review before launch.**

**Billing:** Stripe Billing (subscriptions, invoices, VAT via Stripe Tax), self-serve
upgrade/downgrade/cancel, B2B **Business Terms** with fair cancellation terms. Card data stays
with Stripe.

### 7b. Crawl-side ideas (from earlier planning)

#### Principles

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

#### Options, in recommended order

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

#### What to build first (when we get there)

1. ~~Self-serve account deletion and data export~~ (done)
2. Stripe on the web, with a `purchases` table and a "Party Pack" flag per crawl
3. RSVPs and the group list (the most-wanted Party Pack feature, and useful free in a basic form)
4. Venue "deals" (curated by us at first, not self-serve)

Each needs Terms updates (payments, refunds, the 14-day cancellation right for digital content
under the Consumer Contracts Regulations), Privacy updates (Stripe as a processor), and VAT
registration once over the threshold. Get a solicitor to review.

---

## 8. Security, abuse and scraping

### What's already in place

HTTPS everywhere (Cloudflare); PBKDF2 password hashing; HttpOnly/Secure/SameSite cookies; session
and reset tokens stored only as hashes; rate limits on login, Google-backed endpoints and crawl
creation; email verification before sharing; links blocked in names/notes; unguessable crawl
links; secrets in Cloudflare (never in git); restricted Google keys; budget visibility on `/stats`.

### Phase 0 hardening (do before venues and business accounts)

- **Security headers** from the Worker: Content-Security-Policy (only our scripts plus Google
  Maps and CookieYes), HSTS, `X-Content-Type-Options`, `Referrer-Policy`,
  `Permissions-Policy`, `frame-ancestors 'none'` (stops clickjacking).
- **CSRF:** reject state-changing API requests whose `Origin` isn't pintroute.com (on top of
  SameSite cookies).
- **Cloudflare dashboard:** turn on the **WAF managed rules**, **Bot Fight Mode** and
  **Turnstile** (Cloudflare's privacy-friendly CAPTCHA) on sign-up, claim, report and review
  forms. Add edge rate-limiting rules as well as the Worker ones. Turnstile is a new
  processor, so the cookie/Privacy pages need checking.
- **Admin roles in the database** instead of the `ADMIN_EMAILS` secret, with every admin action
  written to an audit log.
- **2-factor sign-in** (passkeys or an authenticator app): optional for everyone, **required
  for business and admin accounts**. Also a "log out of all devices" button and a list of
  active sessions.
- **Automated tests and CI:** there are none yet. Add API tests (accounts, permissions,
  visibility rules) and run type-check, build and tests on every push *before* Cloudflare
  deploys. This is the biggest current risk as the codebase grows.
- **Dependency updates:** Dependabot (or Renovate) and `npm audit` in CI.
- **Error monitoring:** Workers Logs alerts first. If we add Sentry or similar later, it's a
  processor, so scrub personal data from it.
- **Backups:** D1 Time Travel gives 30 days of point-in-time recovery. Also a weekly export to
  R2 and a tested restore.

### Stopping people scraping our data

You can't stop a determined scraper of *public* pages, but you can make it slow, expensive and
not worth it:
- **Only our own data is worth scraping** (features, tap lists, prices, claims). Google data is
  never stored, so there's nothing of Google's to steal.
- **No bulk endpoints:** lists are paginated with small pages and capped page numbers, venue and
  crawl IDs are unguessable slugs (not 1, 2, 3…), and there's no "export everything" API.
- **Per-IP and per-account rate limits** on directory and search endpoints, tighter for
  logged-out users. Unusual patterns (walking every area page) get a Turnstile challenge.
- **Bot management:** Cloudflare's verified-bot list lets real search engines through and
  blocks or challenges the rest. `robots.txt` sets the rules for well-behaved crawlers.
- **The Terms already forbid scraping**, which gives us a legal route against commercial
  copying. A few harmless **"canary" records** (fake features/prices visible only to bulk
  scrapers) help prove copying if it happens.
- Keep the most valuable data (fresh tap lists and prices) **partly behind login** for bulk use:
  logged-out visitors see the venue, while lists across many venues need an account.

### Business-account specifics

Verification documents are deleted as soon as they're checked. Owners can only edit venues
they're verified for (checked server-side on every request). Uploads are size- and
type-checked, re-encoded (e.g. Cloudflare Images), stripped of location metadata and
moderated. Payments go through Stripe, so card data never touches us.

### If something goes wrong

Write a one-page **incident plan**: who to contact, how to rotate keys (Google, Resend,
Stripe, session secret), how to force everyone to log out (clear `sessions`), and the
**ICO's 72-hour breach-reporting rule** for breaches that risk people's rights. Consider
**cyber insurance** once money is involved. Have an independent **penetration test** before
launching payments.

---

## 9. Legal, compliance and running a business

As each phase ships, the `CLAUDE.md` legal-pages rule applies. On top of that:

- **Business Terms (B2B):** separate from the consumer Terms. Claiming rules, accuracy of
  venue content, the licence to display their content and photos, sport subscription
  responsibility, subscription and cancellation terms, liability caps. **Solicitor review.**
- **Privacy:** new data for business users (names, roles, phone and email, verification
  records), check-ins and friends (social data), ratings and photos, crowd reports, and new
  processors (phone verification, AI board reading, Stripe, image moderation, possibly
  Turnstile). Check-in locations and friend activity must be private by default.
- **Ratings:** DMCC Act 2024 fake-review duties apply to star ratings too (section 5), plus a published "How our scores work" page.
- **Advertising and promotions:** CAP Code section 18 (alcohol), always label "Sponsored",
  Licensing Act mandatory conditions, Scotland and Wales rules. Never target or appeal to
  under-18s.
- **Data sources:** keep attribution for the Open Government Licence (FSA data) and Google;
  handle OpenStreetMap's share-alike rule properly if used; get legal advice on football
  fixture data.
- **Online Safety Act 2023:** user-to-user features (reviews, photos, comments) may bring
  Ofcom duties (risk assessments, reporting tools, illegal-content handling). Small services
  have lighter duties, but **do the risk assessment** before launching reviews or photos.
- **Accessibility:** keep the site usable with screen readers and keyboards (Equality Act).
  Venue access features help here too.
- **Company and admin:** consider trading as a **limited company** before taking money from
  venues (limits personal liability). Also **public liability, professional indemnity and
  cyber insurance**, **register the "Pint Route" trademark** (UKIPO, classes 9/35/42/43),
  check the **ICO fee tier** as turnover or staff grow, and **VAT** registration over the
  threshold.

---

## 10. Phone apps (iOS and Android)

_Planned for after the venue platform is working (phase 7)._

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

## 11. Backlog (smaller items)

- [x] **Self-serve account deletion and data export** (done: My account)
- [x] **Change email and password** while logged in (done: My account)
- [x] **Community**: public crawls, usernames, 1–5 star ratings, copy a crawl (done)
- [ ] **Public profile pages** (`/u/<username>` listing someone's public crawls)
- [ ] **Moderation tools**: an admin list of reported/public crawls, rename usernames
- [ ] **Community near me**: sort public crawls by distance from the user
- [ ] **Clean-up job** for long-unused guest crawls (Cron Trigger; the Privacy Policy already
      says we *may* delete them)
- [ ] **Per-crawl preview image:** a generated image with the crawl name and stop count (e.g.
      Workers + `@vercel/og`/Satori), to go with the per-crawl title already in
      `src/worker/sharePreview.ts`
- [x] **"Directions" link per leg** that opens Google Maps walking navigation (done)
- [x] **Skip visited / closed pubs** in the remaining route (done: on by default once there's
      something to skip; the route runs from the last visited pub)
- [x] **Drag-to-reorder** stops (done: ⠿ handle in Edit crawl; ▲/▼ kept for accessibility)
- [x] **Rate limiting** on the Google-backed endpoints and crawl creation (done; see README
      "Accounts"). Also done: account required to create, email verification before sharing,
      links blocked in names/notes
- [ ] **Cloudflare Turnstile** on sign-up, if bot sign-ups appear (needs CookieYes/legal check)
- [x] **Report a crawl** link on shared and public crawls (done: emails legal@pintroute.com)

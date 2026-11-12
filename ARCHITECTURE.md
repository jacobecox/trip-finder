# Trip Finder: architecture

Private web app that ranks a monthly vacation-exchange availability list. Each month a PDF of
open 7-night resort stays arrives. The app ranks them by total trip cost (lodging + flights from
home, or gas if drivable) and activities nearby, with cards, a map and a table, email import and
a monthly top-picks email.

## Stack
- Next.js (App Router) + TypeScript, deployed on Vercel (Git-connected: push to main deploys)
- Neon Postgres (Vercel Marketplace) + Drizzle ORM with migrations
- Vercel Blob for original PDFs, behind a small `BlobStore` interface
- Auth.js v5, Google provider, `ALLOWED_EMAILS` allowlist
- Nominatim / OpenStreetMap (geocoding + activity category search, 1 req/s, no key)
- OpenRouteService (driving directions only; its geocoder returned 403s despite quota)
- Tailwind (dark theme, yellow accent; tokens in `app/globals.css`)
- SerpApi Google Flights for real fares; Cloudflare Email Worker (`email-worker/`) for mail in and out
- Portable: `output: "standalone"` + Dockerfile; no Vercel-only APIs in core logic

## Security
Repo is public. All secrets live in `.env` (gitignored); `.env.example` documents
names only. Real PDFs are never committed: uploads saved locally go to `.local-storage/` (gitignored).

## Access
- Sign-in is limited to `ALLOWED_EMAILS`. `ADMIN_EMAILS` (also allowed) can upload, edit resorts, change
  the shared settings and spend flight searches; every mutating API route checks this (`requireAdmin`).
- Everyone else can browse and keep their own trip-cost and scoring settings (`user_prefs`, storing only
  values that differ from the shared ones), so e.g. one person can see costs for 1 ticket instead of 3.

## Data model
- `listings_upload`: id, uploaded_at, blob_url, filename, row_count, warning_count
- `property`: id, name, city, state, country_code, country, lat, lng, geocode_source,
  drive_hours, drive_miles, is_drivable, per-field override flags, timestamps;
  unique on normalized (name, city, state, country_code)
- `listing`: id, upload_id, inventory_number, property_id, arrival_date, checkout_date,
  unit_type, price_usd, created_at; unique (upload_id, inventory_number).
  Latest upload = current list; older uploads kept for history
- `settings`: single row — origin label + lat/lng (default Colorado Springs), max_drive_hours (8),
  cost/activity weights, per-tag weights, plane tickets (3), MPG, gas $/gal, flight-estimate base + $/mile
- `property_tag`: (property_id, tag) unique; `osm` (auto) and `manual` kept separately,
  effective = manual ?? osm. Property also has tag_status and tags_reviewed.

## Build phases (all done)
1. **PDF upload → parse → listings table**; properties geocoded with drive time from COS.
   Parser is a pure function using pdfjs text items bucketed by header x-positions.
2. **Activity tags** per property (beach, theme parks, zoo, hiking, skiing, scenic, city) and
   scoring: `final = 0.75 × cost_score + 0.25 × activity_score` (weights configurable);
   untagged properties are flagged.
3. **Flight pricing** via SerpApi Google Flights from COS to each property's candidate airports
   (one search covers them all). Cache 24h; run from a button with a monthly search cap.
   DEN is searched in the same request; a "Fly from" toggle shows COS, DEN or the cheaper.
4. **Map view** (MapLibre GL + OpenFreeMap vector tiles, free, no key), pins colored by score, shares filters with table. Done.
5. **Email ingest** (webhook with shared secret) + monthly "top picks" email. Done.
6. **Polish**: trip cards, guide page, admin-only tools, per-person settings, phone layout + home-screen app.

## Phase 2 notes
- Tags come from Nominatim category searches around each property (beach 3 mi, theme parks
  25 mi, ski 20 mi, parks/trailheads 15 mi, zoo/aquarium/water park 10 mi), filtered by OSM
  type so roads/shops named "ski" etc. don't count. ~10 s per property. Rules: `lib/tags/rules.ts`.
  The public Overpass API was too slow/unreliable (25-45 s per query, frequent 502/504).
- Cost (USD): drivable = lodging + round-trip gas; otherwise lodging + tickets × (base + $/mile ×
  straight-line miles), labelled "est." until Phase 3 replaces it with real fares.
- Scores are computed on read by a pure function (`lib/scoring.ts`), not stored, so weight and
  ticket changes apply immediately (the listings page can override tickets client-side).
  cost_score is min-max over the current list (cheapest = 100).
- "Untagged" = tagging not done, or no tags found and not marked reviewed.
- Tags: beach, theme_park, zoo_aquarium, hiking, skiing (nearby searches), scenic (derived from
  beach/hiking/skiing), city (listed city population >= 100k via OSM extratags). "Kid-friendly"
  was dropped as misleading; adults-only/casino suitability isn't detectable from OSM.
- Tag searches use Nominatim's exact "[key=value]" category queries (plain words match names:
  "ski" found roads and shops). Theme parks need a Wikidata link to count; zoos need a zoo-like
  name or Wikidata. Hiking counts only national/state/provincial parks and forests and wilderness
  areas, not historic sites or trailheads. A town named "... Beach"/"Playa ..." counts as beach.

## Phase 3 notes
- Candidate arrival airports per property (`property_airport`): scheduled-service airports from
  OurAirports, drive times by one ORS matrix call. Airports within 2.5 h drive, big ones first,
  max 7 (Google Flights' limit); if none of them is big, add the nearest big one within 4 h.
  Users can exclude or pin airports; those choices survive rebuilds.
- One SerpApi search per (airport list, dates, passengers), cached in `flight_quote`. Round-trip
  prices in the outbound results are totals for all passengers. Usage is counted per month in
  `api_usage` and capped in Settings (free plan: 250).
- Best itinerary = lowest fare + extra drive vs the nearest airport that has flights (both ways:
  hours × $/h + gas) + layover time (outbound layovers × 2 at the same $/h). Each search keeps the
  cheapest itinerary and the cheapest nonstop per departure + arrival airport. Computed on read, so
  changing $/h doesn't need new searches. A failed refresh keeps the old quote.
- Second departure airport (default DEN): `departure_id=COS,DEN` in the same search, so it costs no
  extra searches. Google returns mostly DEN itineraries in that case (DEN is far cheaper), but the
  cheapest COS one came through in testing. DEN adds the drive from home both ways (time + gas) and
  parking for nights + 1 days. Quotes saved before this (origin "COS") still show until re-priced.
- ORS calls go to api.heigit.org; the deprecated api.openrouteservice.org enforced much smaller
  quotas than the key's plan. If ORS refuses, drive times fall back to the public OSRM server.
- SerpApi's free plan renews on the account's sign-up day (the 10th), not the 1st; the app's counter
  is per calendar month.

## Phase 4 notes
- Map: MapLibre loaded client-only (`next/dynamic`, `ssr: false`). One pin per resort; pins are colored
  by rank among those shown (raw scores cluster at 50-90 and one outlier flattens a min-max scale).
  Labels are switched to English names (`name_en`) where OSM has them. CARTO raster tiles were tried
  but now need an API key; the default OSM raster tiles show local-language names.
- "Dates" filter (range; month name picks the whole month): a stay matches when at least one of
  its nights is inside the range, so a stay crossing into May shows for May (checking out May 1 doesn't).
- Passengers: `tickets` seats (first two adults, rest children) + lap infants. The listings-page
  ticket override scales the fare per seat (approximate, labelled "≈").

## Phase 1 notes
- Geocoding runs as a resumable batch endpoint polled by the client (no long-lived functions).
- Manual overrides (lat/lng, drive hours) have per-field flags and survive re-geocoding.
- Changing max drive hours recomputes `is_drivable` in SQL; changing origin re-runs routing.

## Phase 5: email import + top-picks email
- Gmail filter auto-forwards the monthly email to trips@jacobcox.dev. Cloudflare Email Routing hands
  it to the Worker in `email-worker/`, which posts the largest PDF attachment to `/api/ingest/email`
  (Bearer `EMAIL_SECRET`). Mail from senders not in `ALLOWED_SENDERS` is rejected, except Gmail's
  forwarding-confirmation email, which is forwarded so you can confirm. Gmail auto-forwarding keeps
  your Gmail address as the envelope sender, so that address is the allowlist entry.
- The webhook imports like an upload (same `importPdf`; a repeat of the newest PDF's sha256 is
  skipped), answers at once, then processes in `after()` for up to ~270 s: locate/tag -> flights ->
  email. Work left over continues in a fresh run of `/api/cron/process` (self-call, max 8 hops, only
  while progress is made); a daily Vercel Cron (14:00 UTC) is the backstop.
- Flights are priced automatically only when the searches needed fit in this month's remaining
  SerpApi cap; otherwise the email says to press "Price flights" after the plan renews.
- The top-picks email (best trip at each of the 10 best resorts, same scoring as the listings page)
  is sent once per email import: `digest_sent_at` is claimed before sending and cleared if the send
  fails. If free-API limits keep locations pending, it goes out anyway after 36 h with a note.
- Sending goes through the same Worker (`POST /send`): Workers can only send to verified Email
  Routing destinations, so the Worker always sends to `FORWARD_TO`, and the app never holds an address.
- The email is dark like the app and built for mail clients: tables, inline styles, hex colors, a PNG logo
  and an image button. Gmail's iPhone app inverts colors in dark mode even for dark emails, so backgrounds
  are gradients (left alone), outlines are 1px of background instead of borders, and text uses a Gmail-only
  blend-mode trick (`u + .body`) that flips inverted text back to light. Subject: "top 10 picks <date in the
  PDF's name>"; a hidden preview line summarizes the #1 pick.

## Phone
- Layout is checked at 430px (iPhone 16 Pro Max). Inputs are 16px on small screens so iOS doesn't zoom.
- `app/manifest.ts` + `app/apple-icon.png` + `public/icons/` make "Add to Home Screen" open full screen.

# Trip Finder — Architecture & Roadmap

Private web app that ranks monthly vacation-exchange listings for a family
(2 adults, toddler, infant). Each month a PDF of available 7-night resort stays
arrives. The app ranks them by total trip cost (lodging + flights for 3 from COS,
or gas if drivable) and kid-friendly activities, with a map view and email ingest.

## Stack
- Next.js (App Router) + TypeScript, deployed on Vercel (Pro)
- Neon Postgres (Vercel Marketplace) + Drizzle ORM with migrations
- Vercel Blob for original PDFs, behind a small `BlobStore` interface
- Auth.js v5, Google provider, `ALLOWED_EMAILS` allowlist
- Nominatim / OpenStreetMap (geocoding + activity category search, 1 req/s, no key)
- OpenRouteService (driving directions only; its geocoder returned 403s despite quota)
- Tailwind
- Portable: `output: "standalone"` + Dockerfile; no Vercel-only APIs in core logic

## Security
Repo is public. All secrets live in `.env` (gitignored); `.env.example` documents
names only. Real PDFs are gitignored.

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

## Roadmap
1. **PDF upload → parse → listings table**; properties geocoded with drive time from COS.
   Parser is a pure function using pdfjs text items bucketed by header x-positions.
2. **Activity tags** per property (beach, theme parks, hiking, skiing, kid-friendly) and
   scoring: `final = 0.75 × cost_score + 0.25 × activity_score` (weights configurable);
   untagged properties are flagged.
3. **Flight pricing** via SerpApi Google Flights from COS to each property's candidate airports
   (one search covers them all). Cache 24h; run from a button with a monthly search cap.
   DEN is searched in the same request; a "Fly from" toggle shows COS, DEN or the cheaper.
4. **Map view** (MapLibre GL + OpenFreeMap vector tiles, free, no key), pins colored by score, shares filters with table. Done.
5. **Email ingest** (webhook with shared secret) + monthly "top picks" email.

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

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
3. **Flight pricing** via SerpApi Google Flights: always COS, 3 adults; also price DEN only
   if international or COS total > configurable threshold (default $900); show DEN only if
   net savings ≥ $200 after DEN gas + parking. Cache 24h. Batch via Vercel Cron.
4. **Map view** (Leaflet + OpenStreetMap), pins colored by score, shares filters with table.
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

## Phase 1 notes
- Geocoding runs as a resumable batch endpoint polled by the client (no long-lived functions).
- Manual overrides (lat/lng, drive hours) have per-field flags and survive re-geocoding.
- Changing max drive hours recomputes `is_drivable` in SQL; changing origin re-runs routing.

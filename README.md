# Trip Finder

A personal, private web app for ranking monthly vacation-exchange listings for a family
trip. Each month a PDF of available 7-night resort stays arrives; Trip Finder parses it,
geocodes the properties, and works out which are drivable from Colorado Springs.

Later phases add activity tagging and scoring, flight pricing, a map view, and email ingest.
See [ARCHITECTURE.md](ARCHITECTURE.md) for the full roadmap and data model.

## Status
Phase 1 (PDF upload, parsing, listings table, geocoding and drive time) is in progress.

## Stack
Next.js (App Router) + TypeScript, Neon Postgres + Drizzle, Auth.js (Google), Vercel Blob,
OpenRouteService, Tailwind. Deployable on Vercel or as a Docker container.

## Local setup
1. `pnpm install`
2. Copy `.env.example` to `.env` and fill it in:
   - `DATABASE_URL`: a Neon dev branch connection string
   - `AUTH_SECRET`: `npx auth secret` (or `openssl rand -base64 32`)
   - `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`: Google Cloud OAuth client (Web). Authorized redirect URI:
     `http://localhost:3000/api/auth/callback/google` (plus your production URL)
   - `ALLOWED_EMAILS`: comma-separated Google emails allowed to sign in
   - `ORS_API_KEY`: free key from openrouteservice.org (calls go to `api.heigit.org`; the old
     `api.openrouteservice.org` host is deprecated and enforced much lower quotas)
   - `SERPAPI_API_KEY`: serpapi.com (free plan: 250 searches/month) for real flight fares
   - `BLOB_READ_WRITE_TOKEN`: leave empty locally; PDFs are saved to `.local-storage/`
3. `pnpm db:migrate` (applies `drizzle/` migrations)
4. `pnpm dev`

Airport data (`data/airports.json`) is built from OurAirports (public domain); to refresh it see the
comment in `scripts/build-airports.ts`.

Other commands: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm db:generate` (after editing `lib/db/schema.ts`).

## Deploy (Vercel)
1. `vercel link`, then add the Neon integration (Vercel Marketplace) and a Blob store to the project.
2. Set `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `ALLOWED_EMAILS`, `ORS_API_KEY`, `SERPAPI_API_KEY` in Vercel env vars
   (`DATABASE_URL` and `BLOB_READ_WRITE_TOKEN` come from the integrations).
3. `vercel env pull .env.local`, then run `pnpm db:migrate` against the production database.
4. `vercel deploy --prod`
5. Add the production callback URL to the Google OAuth client:
   `https://<your-subdomain>/api/auth/callback/google`

### Custom subdomain on Cloudflare
1. Vercel project > Settings > Domains > add `trips.example.com`.
2. In Cloudflare DNS add a `CNAME` for `trips` pointing to the target Vercel shows (e.g. `cname.vercel-dns.com`),
   with the proxy **off** (grey cloud, "DNS only").
3. Wait for Vercel to verify and issue the certificate.

## Docker
`docker build -t trip-finder .` then `docker run -p 3000:3000 --env-file .env trip-finder`.
Without `BLOB_READ_WRITE_TOKEN`, PDFs are written to `.local-storage/` inside the container.

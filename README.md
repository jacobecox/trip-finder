# Trip Finder

A small private web app that ranks a monthly vacation-exchange availability list. Each month a PDF of
open week-long resort stays arrives by email; Trip Finder imports it, works out what each trip would
really cost from home (the stay plus flights, or gas when it's within driving range), finds what there
is to do nearby, and ranks every stay with a 0–100 score. The top picks go out in an email.

- **Trips**: cards, map and table views with filters (dates, activity, drivable only, departure airport, unit size, country/state).
- **Score**: cost and activities, weighted however you like; each person can save their own settings.
- **Flights**: real round-trip fares from Google Flights (via SerpApi), searched from two home airports at once.
- **Email**: forward the monthly email and the list imports itself, then a top-10 email is sent.
- **Phone**: works as a home-screen app (web manifest + icons).

See [ARCHITECTURE.md](ARCHITECTURE.md) for how it works and why.

## Stack
Next.js (App Router) + TypeScript + Tailwind, Neon Postgres + Drizzle, Auth.js (Google sign-in),
Vercel Blob, a Cloudflare Email Worker, MapLibre + OpenStreetMap. Free data APIs: Nominatim (places),
OpenRouteService / OSRM (drive times), OurAirports (airport list). Runs on Vercel or in Docker.

## Local setup
1. `pnpm install`
2. Copy `.env.example` to `.env` and fill it in (it documents every variable). The essentials:
   - `DATABASE_URL`: a Neon Postgres connection string
   - `AUTH_SECRET` (`npx auth secret`), `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`: a Google OAuth web client with
     redirect URI `http://localhost:3000/api/auth/callback/google` (plus your production URL)
   - `ALLOWED_EMAILS`: Google accounts that may sign in; `ADMIN_EMAILS`: the ones that can upload, edit resorts,
     change shared settings and spend flight searches
   - `ORS_API_KEY` (openrouteservice.org, free) and `SERPAPI_API_KEY` (serpapi.com, free plan: 250 searches/month)
   - Leave `BLOB_READ_WRITE_TOKEN` empty locally: uploaded PDFs are saved to `.local-storage/`
3. `pnpm db:migrate`
4. `pnpm dev`

| Command | |
| --- | --- |
| `pnpm test` | Vitest (uses an in-memory Postgres; PDF tests run when a PDF is in `.local-storage/`) |
| `pnpm typecheck` / `pnpm lint` | |
| `pnpm db:generate` | new migration after editing `lib/db/schema.ts` |

`data/airports.json` is built from OurAirports (public domain); `scripts/build-airports.ts` explains how to refresh it.

## Deploy (Vercel)
1. `vercel link`; add Neon (Vercel Marketplace) and a Blob store, which provide `DATABASE_URL` and `BLOB_READ_WRITE_TOKEN`.
2. Set the rest of `.env.example` in the project's environment variables, then `pnpm db:migrate` against that database.
3. Push to `main` (the project is Git-connected) or `vercel deploy --prod`.
4. Add `https://<your-domain>/api/auth/callback/google` to the Google OAuth client.

`vercel.json` pins the function region and a daily cron that finishes any leftover import work.

**Custom domain on Cloudflare:** add the domain in Vercel (Settings > Domains), then a `CNAME` in Cloudflare DNS
pointing at the target Vercel shows, with the proxy off (DNS only).

## Email import and the top-picks email
`email-worker/` is a Cloudflare Email Worker (deploy with `pnpm --dir email-worker deploy` after `wrangler login`).
1. Set its secrets with `wrangler secret put`: `EMAIL_SECRET` (same as the app's), `ALLOWED_SENDERS` (addresses that may
   send PDFs in) and `FORWARD_TO` (where the top-picks email goes; must be a verified Email Routing destination).
2. Cloudflare > Email Routing: route an address (e.g. `trips@your-domain`) to the worker.
3. Set `EMAIL_WORKER_URL` in the app.
4. In Gmail, add the routed address as a forwarding address (the worker passes Gmail's confirmation email on to
   `FORWARD_TO`), then add a filter that forwards the monthly email (with the PDF) to it.

## Docker
`docker build -t trip-finder .` then `docker run -p 3000:3000 --env-file .env trip-finder`.
Without `BLOB_READ_WRITE_TOKEN`, PDFs are written to `.local-storage/` inside the container.

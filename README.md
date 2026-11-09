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

## Configuration
Copy `.env.example` to `.env` and fill in the values. `.env` is gitignored; never commit secrets.

Setup, migration, and deploy instructions will be added as Phase 1 lands.

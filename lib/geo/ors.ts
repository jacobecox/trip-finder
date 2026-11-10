// api.openrouteservice.org is deprecated: it enforced far smaller quotas than the key's plan
// (200 directions/day, matrix refused after ~50) and didn't report usage to the dashboard.
const BASE = "https://api.heigit.org/openrouteservice";
const M_PER_MILE = 1609.344;

import { type LatLng, QuotaError, sleep, throttle } from "./util";

const DIRECTIONS_MIN_INTERVAL_MS = 1600; // ORS free tier: 40 directions/min

function key() {
  const k = process.env.ORS_API_KEY;
  if (!k) throw new Error("ORS_API_KEY is not set");
  return k;
}

export interface OrsQuota {
  limit: number;
  remaining: number;
  resetAt: string | null; // ISO; quotas renew 24 h after first use, not at midnight
}
const quota = new Map<string, OrsQuota>();
/** Last quota ORS reported per endpoint (this server process only). */
export const orsQuota = (): Record<string, OrsQuota> => Object.fromEntries(quota);

function recordQuota(endpoint: string, res: Response) {
  const limit = Number(res.headers.get("x-ratelimit-limit"));
  const remaining = Number(res.headers.get("x-ratelimit-remaining"));
  if (!res.headers.has("x-ratelimit-limit") || !Number.isFinite(limit) || !Number.isFinite(remaining)) return;
  const reset = Number(res.headers.get("x-ratelimit-reset"));
  quota.set(endpoint, { limit, remaining, resetAt: reset > 0 ? new Date(reset * 1000).toISOString() : null });
  if (remaining > 0 && remaining <= limit * 0.1) console.warn(`[ors] ${endpoint}: ${remaining}/${limit} left today`);
}

async function orsFetch(endpoint: string, url: string, init?: RequestInit, attempt = 0): Promise<Response> {
  const res = await fetch(url, init);
  recordQuota(endpoint, res);
  if (res.status === 403) {
    const prev = quota.get(endpoint);
    quota.set(endpoint, { limit: prev?.limit ?? 0, remaining: 0, resetAt: prev?.resetAt ?? null });
    console.warn(`[ors] ${endpoint}: 403 ${(await res.text()).slice(0, 80).replace(/\s+/g, " ")}`);
    throw new QuotaError(`OpenRouteService ${endpoint}`);
  }
  if ((res.status === 429 || res.status >= 500) && attempt < 3) {
    const retryAfter = Number(res.headers.get("retry-after"));
    await sleep((retryAfter > 0 ? retryAfter * 1000 : 2000 * 2 ** attempt) + Math.random() * 300);
    return orsFetch(endpoint, url, init, attempt + 1);
  }
  return res;
}

/** Returns null when no driving route exists; throws on transient/API failures. */
export async function driveRoute(from: LatLng, to: LatLng): Promise<{ hours: number; miles: number } | null> {
  await throttle("ors-directions", DIRECTIONS_MIN_INTERVAL_MS);
  const res = await orsFetch("directions", `${BASE}/v2/directions/driving-car`, {
    method: "POST",
    headers: { Authorization: key(), "Content-Type": "application/json" },
    body: JSON.stringify({
      coordinates: [
        [from.lng, from.lat],
        [to.lng, to.lat],
      ],
      radiuses: [-1, -1], // snap to the nearest road at any distance
    }),
  });
  if (res.status === 404 || res.status === 400) return null; // unroutable / too far / not connected
  if (!res.ok) throw new Error(`ORS directions ${res.status}`);
  const json = (await res.json()) as { routes?: { summary: { distance: number; duration: number } }[] };
  const s = json.routes?.[0]?.summary;
  if (!s) return null;
  return { hours: s.duration / 3600, miles: s.distance / M_PER_MILE };
}

/** Rough North America bounding box (US, Canada, Mexico, Central America). */
export function inNorthAmerica({ lat, lng }: LatLng) {
  return lat >= 7 && lat <= 84 && lng >= -170 && lng <= -50;
}

const MATRIX_MIN_INTERVAL_MS = 1600; // ORS free tier: 40 matrix requests/min

/** Drive time/distance from one point to many; null entries are unroutable (e.g. across water). */
export async function driveMatrix(from: LatLng, to: LatLng[]): Promise<({ hours: number; miles: number } | null)[]> {
  if (!to.length) return [];
  await throttle("ors-matrix", MATRIX_MIN_INTERVAL_MS);
  const res = await orsFetch("matrix", `${BASE}/v2/matrix/driving-car`, {
    method: "POST",
    headers: { Authorization: key(), "Content-Type": "application/json" },
    body: JSON.stringify({
      locations: [from, ...to].map((p) => [p.lng, p.lat]),
      sources: [0],
      destinations: to.map((_, i) => i + 1),
      metrics: ["duration", "distance"],
      units: "mi",
    }),
  });
  if (!res.ok) throw new Error(`ORS matrix ${res.status}`);
  const json = (await res.json()) as { durations: (number | null)[][]; distances: (number | null)[][] };
  return json.durations[0].map((d, i) => {
    const miles = json.distances[0][i];
    return d == null || miles == null ? null : { hours: d / 3600, miles };
  });
}

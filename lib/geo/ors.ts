const BASE = "https://api.openrouteservice.org";
const M_PER_MILE = 1609.344;

import { type LatLng, QuotaError, sleep, throttle } from "./util";

const DIRECTIONS_MIN_INTERVAL_MS = 1600; // ORS free tier: 40 directions/min

function key() {
  const k = process.env.ORS_API_KEY;
  if (!k) throw new Error("ORS_API_KEY is not set");
  return k;
}

async function orsFetch(url: string, init?: RequestInit, attempt = 0): Promise<Response> {
  const res = await fetch(url, init);
  if (res.status === 403) throw new QuotaError("OpenRouteService");
  if ((res.status === 429 || res.status >= 500) && attempt < 3) {
    const retryAfter = Number(res.headers.get("retry-after"));
    await sleep((retryAfter > 0 ? retryAfter * 1000 : 2000 * 2 ** attempt) + Math.random() * 300);
    return orsFetch(url, init, attempt + 1);
  }
  return res;
}

/** Returns null when no driving route exists; throws on transient/API failures. */
export async function driveRoute(from: LatLng, to: LatLng): Promise<{ hours: number; miles: number } | null> {
  await throttle("ors-directions", DIRECTIONS_MIN_INTERVAL_MS);
  const res = await orsFetch(`${BASE}/v2/directions/driving-car`, {
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

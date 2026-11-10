import { type LatLng, QuotaError, sleep, throttle } from "./util";

// Public OSRM demo server: no key, ~1 request/second fair use. Used when ORS refuses (quota).
const BASE = "https://router.project-osrm.org";
const USER_AGENT = "trip-finder/0.1 (personal project)";
const M_PER_MILE = 1609.344;

/** One route via OSRM; null when unroutable. */
export async function osrmRoute(from: LatLng, to: LatLng) {
  return (await osrmMatrix(from, [to]))[0];
}

/** Drive time/distance from one point to many; null entries are unroutable (e.g. across water). */
export async function osrmMatrix(
  from: LatLng,
  to: LatLng[],
  attempt = 0,
): Promise<({ hours: number; miles: number } | null)[]> {
  if (!to.length) return [];
  await throttle("osrm", 1100);
  const coords = [from, ...to].map((p) => `${p.lng},${p.lat}`).join(";");
  const res = await fetch(`${BASE}/table/v1/driving/${coords}?sources=0&annotations=duration,distance`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if ((res.status === 429 || res.status >= 500) && attempt < 3) {
    await sleep(2000 * 2 ** attempt);
    return osrmMatrix(from, to, attempt + 1);
  }
  if (res.status === 429) throw new QuotaError("OSRM");
  if (!res.ok) throw new Error(`OSRM table ${res.status}`);
  const json = (await res.json()) as { code: string; durations?: (number | null)[][]; distances?: (number | null)[][] };
  if (json.code !== "Ok" || !json.durations || !json.distances) throw new Error(`OSRM table: ${json.code}`);
  return to.map((_, i) => {
    const d = json.durations![0][i + 1];
    const m = json.distances![0][i + 1];
    return d == null || m == null ? null : { hours: d / 3600, miles: m / M_PER_MILE };
  });
}

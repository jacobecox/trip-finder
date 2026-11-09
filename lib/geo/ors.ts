const BASE = "https://api.openrouteservice.org";
const M_PER_MILE = 1609.344;

export interface LatLng {
  lat: number;
  lng: number;
}
export interface GeocodeHit extends LatLng {
  source: "ors-venue" | "ors-city";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function key() {
  const k = process.env.ORS_API_KEY;
  if (!k) throw new Error("ORS_API_KEY is not set");
  return k;
}

async function orsFetch(url: string, init?: RequestInit, attempt = 0): Promise<Response> {
  const res = await fetch(url, init);
  if ((res.status === 429 || res.status >= 500) && attempt < 3) {
    const retryAfter = Number(res.headers.get("retry-after"));
    await sleep((retryAfter > 0 ? retryAfter * 1000 : 2000 * 2 ** attempt) + Math.random() * 300);
    return orsFetch(url, init, attempt + 1);
  }
  return res;
}

interface PeliasFeature {
  geometry: { coordinates: [number, number] };
  properties: { confidence?: number; layer?: string };
}

async function search(text: string, countryCode: string): Promise<PeliasFeature | null> {
  const qs = new URLSearchParams({ api_key: key(), text, size: "1", "boundary.country": countryCode });
  const res = await orsFetch(`${BASE}/geocode/search?${qs}`);
  if (!res.ok) throw new Error(`ORS geocode ${res.status}`);
  const json = (await res.json()) as { features?: PeliasFeature[] };
  return json.features?.[0] ?? null;
}

/** Tries the resort itself first, then falls back to city level. */
export async function geocodeProperty(p: {
  name: string;
  city: string;
  state: string;
  country: string;
  countryCode: string;
}): Promise<GeocodeHit | null> {
  const place = [p.city, p.state, p.country].filter(Boolean).join(", ");
  const venue = await search(`${p.name}, ${place}`, p.countryCode);
  const vp = venue?.properties;
  if (venue && (vp?.confidence ?? 0) >= 0.8 && (vp?.layer === "venue" || vp?.layer === "address")) {
    const [lng, lat] = venue.geometry.coordinates;
    return { lat, lng, source: "ors-venue" };
  }
  const city = await search(place, p.countryCode);
  if (!city) return null;
  const [lng, lat] = city.geometry.coordinates;
  return { lat, lng, source: "ors-city" };
}

export async function geocodeText(text: string): Promise<LatLng | null> {
  const qs = new URLSearchParams({ api_key: key(), text, size: "1" });
  const res = await orsFetch(`${BASE}/geocode/search?${qs}`);
  if (!res.ok) throw new Error(`ORS geocode ${res.status}`);
  const json = (await res.json()) as { features?: PeliasFeature[] };
  const f = json.features?.[0];
  return f ? { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] } : null;
}

/** Returns null when no driving route exists; throws on transient/API failures. */
export async function driveRoute(from: LatLng, to: LatLng): Promise<{ hours: number; miles: number } | null> {
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

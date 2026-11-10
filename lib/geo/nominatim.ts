import type { Place } from "@/lib/tags/rules";
import { type LatLng, QuotaError, distanceKm, sleep, throttle } from "./util";

const BASE = "https://nominatim.openstreetmap.org/search";
// Public Nominatim policy: max 1 request/second and an identifying User-Agent.
const MIN_INTERVAL_MS = 1100;
const USER_AGENT = "trip-finder/0.1 (personal project)";
const VENUE_MAX_KM_FROM_CITY = 40;

export interface GeocodeHit extends LatLng {
  source: "osm-venue" | "osm-city";
}

// ISO alpha-3 (as in the PDF) -> alpha-2 (Nominatim `countrycodes`). Unknown codes skip the filter.
const A2: Record<string, string> = {
  USA: "us", CAN: "ca", MEX: "mx", GBR: "gb", IRL: "ie", FRA: "fr", ESP: "es", ITA: "it", PRT: "pt", DEU: "de",
  AUT: "at", CHE: "ch", NLD: "nl", BEL: "be", GRC: "gr", TUR: "tr", MLT: "mt", HRV: "hr", CZE: "cz", POL: "pl",
  HUN: "hu", NOR: "no", SWE: "se", DNK: "dk", FIN: "fi", ISL: "is", AUS: "au", NZL: "nz", JPN: "jp", CHN: "cn",
  THA: "th", IDN: "id", MYS: "my", SGP: "sg", IND: "in", PHL: "ph", VNM: "vn", ZAF: "za", EGY: "eg", MAR: "ma",
  KEN: "ke", TZA: "tz", BRA: "br", ARG: "ar", CHL: "cl", PER: "pe", COL: "co", CRI: "cr", PAN: "pa", DOM: "do",
  JAM: "jm", BHS: "bs", ABW: "aw", BRB: "bb", CYM: "ky", TCA: "tc", VIR: "vi", PRI: "pr", AND: "ad", MUS: "mu",
  ARE: "ae", ISR: "il", JOR: "jo", CYP: "cy", BGR: "bg", ROU: "ro", SVK: "sk", SVN: "si", EST: "ee", LVA: "lv", LTU: "lt",
};

interface NominatimResult {
  lat: string;
  lon: string;
}

async function search(q: string, countryCode: string, attempt = 0): Promise<LatLng | null> {
  await throttle("nominatim", MIN_INTERVAL_MS);
  const qs = new URLSearchParams({ q, format: "jsonv2", limit: "1" });
  const cc = A2[countryCode.toUpperCase()];
  if (cc) qs.set("countrycodes", cc);
  const res = await fetch(`${BASE}?${qs}`, { headers: { "User-Agent": USER_AGENT, "Accept-Language": "en" } });
  if (res.status === 403) throw new QuotaError("Nominatim");
  if ((res.status === 429 || res.status >= 500) && attempt < 3) {
    await sleep(3000 * 2 ** attempt);
    return search(q, countryCode, attempt + 1);
  }
  if (res.status === 429) throw new QuotaError("Nominatim");
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const [hit] = (await res.json()) as NominatimResult[];
  return hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null;
}

/**
 * City-level point first (always the fallback), then try the resort itself and accept it
 * only if it lands near that city. Guards against same-named places elsewhere.
 */
export async function geocodeProperty(p: {
  name: string;
  city: string;
  state: string;
  country: string;
  countryCode: string;
}): Promise<GeocodeHit | null> {
  const join = (...parts: string[]) => parts.filter(Boolean).join(", ");
  // PDF cities can contain extra detail ("Honolulu, Oahu"); retry with progressively simpler text
  const shortCity = p.city.split(",")[0].trim();
  const place = join(p.city, p.state, p.country);
  const cityQueries = [place, join(shortCity, p.state, p.country), join(p.name, p.state, p.country)];

  let city: LatLng | null = null;
  // last resort ignores the state/province, which the PDF sometimes gets wrong (e.g. Underberg "FS")
  for (const q of [...new Set([...cityQueries.slice(0, 2), join(shortCity, p.country)])]) {
    city = await search(q, p.countryCode);
    if (city) break;
  }
  let venue: LatLng | null = null;
  for (const q of [...new Set([join(p.name, place), join(p.name, shortCity, p.state, p.country), cityQueries[2]])]) {
    venue = await search(q, p.countryCode);
    if (venue && (!city || distanceKm(venue, city) <= VENUE_MAX_KM_FROM_CITY)) break;
    venue = null;
  }
  if (venue) return { ...venue, source: "osm-venue" };
  return city ? { ...city, source: "osm-city" } : null;
}

const SETTLEMENT = new Set(["city", "town", "village", "municipality", "suburb", "borough", "city_district"]);

/** Population of the listed city (OSM extratags), trying the simplified name too. */
export async function cityPopulation(p: { city: string; state: string; country: string; countryCode: string }) {
  const short = p.city.split(",")[0].trim();
  for (const q of [...new Set([[p.city, p.state, p.country], [short, p.state, p.country]].map((x) => x.filter(Boolean).join(", ")))]) {
    await throttle("nominatim", MIN_INTERVAL_MS);
    const qs = new URLSearchParams({ q, format: "jsonv2", limit: "3", extratags: "1" });
    const cc = A2[p.countryCode.toUpperCase()];
    if (cc) qs.set("countrycodes", cc);
    const res = await fetch(`${BASE}?${qs}`, { headers: { "User-Agent": USER_AGENT, "Accept-Language": "en" } });
    if (res.status === 403 || res.status === 429) throw new QuotaError("Nominatim");
    if (!res.ok) throw new Error(`Nominatim ${res.status}`);
    // skip counties etc. ("Napa, CA" first matches Napa County)
    const hit = ((await res.json()) as { addresstype?: string; extratags?: Record<string, string> }[]).find(
      (h) => !h.addresstype || SETTLEMENT.has(h.addresstype),
    );
    if (hit) {
      const pop = Number(hit.extratags?.population?.replace(/[^\d]/g, ""));
      return Number.isFinite(pop) && pop > 0 ? pop : null;
    }
  }
  return null;
}

export async function geocodeText(text: string): Promise<LatLng | null> {
  return search(text, "");
}

interface NominatimPlace {
  name: string;
  category: string;
  type: string;
  lat: string;
  lon: string;
  extratags?: Record<string, string> | null;
}

/** Category/keyword search inside a box around a point (results still need a radius check). */
export async function searchNear(query: string, center: LatLng, radiusMiles: number, attempt = 0): Promise<Place[]> {
  await throttle("nominatim", MIN_INTERVAL_MS);
  const dLat = radiusMiles / 69;
  const dLng = radiusMiles / (69 * Math.max(0.1, Math.cos((center.lat * Math.PI) / 180)));
  const qs = new URLSearchParams({
    q: query,
    viewbox: `${center.lng - dLng},${center.lat + dLat},${center.lng + dLng},${center.lat - dLat}`,
    bounded: "1",
    format: "jsonv2",
    limit: "10",
    extratags: "1",
  });
  const res = await fetch(`${BASE}?${qs}`, { headers: { "User-Agent": USER_AGENT, "Accept-Language": "en" } });
  if (res.status === 403) throw new QuotaError("Nominatim");
  if ((res.status === 429 || res.status >= 500) && attempt < 3) {
    await sleep(3000 * 2 ** attempt);
    return searchNear(query, center, radiusMiles, attempt + 1);
  }
  if (res.status === 429) throw new QuotaError("Nominatim");
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const rows = (await res.json()) as NominatimPlace[];
  return rows.map((r) => ({
    name: r.name,
    category: r.category,
    type: r.type,
    lat: Number(r.lat),
    lng: Number(r.lon),
    notable: Boolean(r.extratags?.wikidata || r.extratags?.wikipedia),
  }));
}

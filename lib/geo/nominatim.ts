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
  const place = [p.city, p.state, p.country].filter(Boolean).join(", ");
  const city = await search(place, p.countryCode);
  const venue = await search(`${p.name}, ${place}`, p.countryCode);
  if (venue && (!city || distanceKm(venue, city) <= VENUE_MAX_KM_FROM_CITY)) return { ...venue, source: "osm-venue" };
  return city ? { ...city, source: "osm-city" } : null;
}

export async function geocodeText(text: string): Promise<LatLng | null> {
  return search(text, "");
}

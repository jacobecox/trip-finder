import data from "@/data/airports.json";
import { distanceKm, type LatLng } from "@/lib/geo/util";

export interface Airport {
  iata: string;
  name: string;
  city: string;
  country: string; // ISO 3166-1 alpha-2
  lat: number;
  lng: number;
  large: boolean;
}

type Row = [string, string, string, string, number, number, number];
export const AIRPORTS: Airport[] = (data as Row[]).map(([iata, name, city, country, lat, lng, large]) => ({
  iata,
  name,
  city,
  country,
  lat,
  lng,
  large: large === 1,
}));
const BY_IATA = new Map(AIRPORTS.map((a) => [a.iata, a]));
export const airportByIata = (iata: string) => BY_IATA.get(iata.toUpperCase());

/** Airports worth asking ORS about: nearest first, within a generous straight-line radius. */
export function nearbyAirports(p: LatLng, { maxKm = 400, limit = 15 } = {}) {
  return AIRPORTS.map((a) => ({ a, km: distanceKm(p, a) }))
    .filter((x) => x.km <= maxKm)
    .sort((x, y) => x.km - y.km)
    .slice(0, limit)
    .map((x) => x.a);
}

export interface Reachable {
  iata: string;
  large: boolean;
  hours: number;
  miles: number;
}

export interface CandidateRules {
  maxDriveHours: number; // any airport this close is a candidate
  hubMaxDriveHours: number; // if no big airport is within maxDriveHours, add the nearest one within this
  maxAirports: number;
}

/**
 * Pure: which reachable airports to search. Big airports first (they're usually cheaper),
 * then by drive time; always at least the nearest reachable airport.
 */
export function selectCandidates(reachable: Reachable[], r: CandidateRules): Reachable[] {
  const byDrive = [...reachable].sort((a, b) => a.hours - b.hours);
  const within = byDrive.filter((a) => a.hours <= r.maxDriveHours);
  const picked = [...within.filter((a) => a.large), ...within.filter((a) => !a.large)].slice(0, r.maxAirports);
  if (!picked.some((a) => a.large)) {
    const hub = byDrive.find((a) => a.large && a.hours <= r.hubMaxDriveHours);
    if (hub) picked.splice(Math.max(0, r.maxAirports - 1), 1, hub);
  }
  if (!picked.length && byDrive.length) picked.push(byDrive[0]);
  return [...new Set(picked)].sort((a, b) => a.hours - b.hours);
}

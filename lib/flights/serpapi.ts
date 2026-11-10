import type { FareOption } from "@/lib/db/schema";
import { QuotaError } from "@/lib/geo/util";

export interface Passengers {
  adults: number;
  children: number;
  lapInfants: number;
}
export const passengersKey = (p: Passengers) => `${p.adults}/${p.children}/${p.lapInfants}`;
/** `tickets` seats (first two are adults) plus lap infants. */
export const passengersFor = (tickets: number, lapInfants: number): Passengers => {
  const adults = Math.max(1, Math.min(2, tickets));
  return { adults, children: Math.max(0, tickets - adults), lapInfants: Math.max(0, Math.min(lapInfants, adults)) };
};

export interface FareSearch {
  origin: string;
  airports: string[];
  outboundDate: string;
  returnDate: string;
  passengers: Passengers;
}

export interface FareResult {
  status: "ok" | "none";
  options: FareOption[]; // per origin + arrival airport: cheapest, plus cheapest nonstop if that has stops; cheapest first
  searchUrl: string | null;
}

interface SerpFlight {
  price?: number;
  total_duration?: number;
  flights?: { airline?: string; departure_airport?: { id?: string }; arrival_airport?: { id?: string } }[];
  layovers?: { duration?: number; id?: string; overnight?: boolean }[];
}
interface SerpResponse {
  error?: string;
  search_metadata?: { google_flights_url?: string };
  best_flights?: SerpFlight[];
  other_flights?: SerpFlight[];
}

const better = (a: FareOption, b: FareOption | undefined) =>
  !b || a.priceUsd < b.priceUsd || (a.priceUsd === b.priceUsd && (a.stops < b.stops || (a.stops === b.stops && a.durationMin < b.durationMin)));

/**
 * Pure: per departure + arrival airport, the cheapest round trip and (if that one has stops) the
 * cheapest nonstop. Prices are for all passengers.
 */
export function parseFares(json: SerpResponse, wanted: string[]): FareResult {
  const best = new Map<string, FareOption>();
  const nonstop = new Map<string, FareOption>();
  for (const f of [...(json.best_flights ?? []), ...(json.other_flights ?? [])]) {
    const legs = f.flights ?? [];
    const iata = legs.at(-1)?.arrival_airport?.id;
    const origin = legs[0]?.departure_airport?.id;
    if (!iata || !origin || f.price == null || !wanted.includes(iata)) continue;
    const opt: FareOption = {
      iata,
      origin,
      priceUsd: f.price,
      airline: [...new Set(legs.map((l) => l.airline).filter(Boolean))].join(" / "),
      stops: Math.max(0, legs.length - 1),
      durationMin: f.total_duration ?? 0,
      layovers: (f.layovers ?? []).map((l) => ({
        iata: l.id ?? "?",
        minutes: l.duration ?? 0,
        ...(l.overnight ? { overnight: true } : {}),
      })),
    };
    const k = `${origin}>${iata}`;
    if (better(opt, best.get(k))) best.set(k, opt);
    if (opt.stops === 0 && better(opt, nonstop.get(k))) nonstop.set(k, opt);
  }
  const options = [...best.values()];
  for (const [k, n] of nonstop) if (best.get(k)!.stops > 0) options.push(n);
  options.sort((a, b) => a.priceUsd - b.priceUsd);
  return { status: options.length ? "ok" : "none", options, searchUrl: json.search_metadata?.google_flights_url ?? null };
}

/** One SerpApi Google Flights search (counts against the monthly quota). */
export async function searchFares(q: FareSearch): Promise<FareResult> {
  const key = process.env.SERPAPI_API_KEY;
  if (!key) throw new Error("SERPAPI_API_KEY is not set");
  const qs = new URLSearchParams({
    engine: "google_flights",
    type: "1", // round trip; outbound prices are the round-trip total
    departure_id: q.origin,
    arrival_id: q.airports.join(","),
    outbound_date: q.outboundDate,
    return_date: q.returnDate,
    adults: String(q.passengers.adults),
    children: String(q.passengers.children),
    infants_on_lap: String(q.passengers.lapInfants),
    currency: "USD",
    hl: "en",
    gl: "us",
    api_key: key,
  });
  const res = await fetch(`https://serpapi.com/search.json?${qs}`);
  const json = (await res.json().catch(() => ({}))) as SerpResponse;
  if (res.status === 429) throw new QuotaError("SerpApi");
  if (res.status === 401) throw new Error("SerpApi rejected the API key");
  if (json.error) {
    // "hasn't returned any results" means no flights for this route/dates, not a failure
    if (/no results|hasn't returned any results/i.test(json.error)) return { status: "none", options: [], searchUrl: null };
    if (/run out of searches|plan limit/i.test(json.error)) throw new QuotaError("SerpApi");
    throw new Error(`SerpApi: ${json.error}`);
  }
  if (!res.ok) throw new Error(`SerpApi ${res.status}`);
  return parseFares(json, q.airports);
}

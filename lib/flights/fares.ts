import { inArray } from "drizzle-orm";
import { flightQuote, getDb, propertyAirport } from "@/lib/db";
import type { FareOption } from "@/lib/db/schema";
import { chooseFare, type CandidateAirport, type ChosenFare } from "./choose";
import { quoteKey, searchAirports, searchOrigins } from "./keys";
import { passengersFor, passengersKey } from "./serpapi";

export interface OriginFare extends ChosenFare {
  origin: string; // departure airport
  originExtraUsd: number; // getting to a non-home airport: drive both ways (time + gas) + parking
}
export interface ListingFare extends OriginFare {
  seats: number; // tickets the fare was priced for (lap infants ride free-ish and aren't counted)
  fetchedAt: string;
  searchUrl: string | null;
  /** best choice per departure airport that was searched (the top level is the overall best) */
  byOrigin: Record<string, OriginFare>;
}
/** "none" = searched, no flights found; null = not searched yet */
export type FareInfo = ListingFare | { status: "none"; fetchedAt: string } | null;

interface FareSettings {
  tickets: number;
  lapInfants: number;
  originAirport: string;
  altOriginAirport?: string;
  altOriginDriveHours?: number;
  altOriginDriveMiles?: number;
  altOriginParkingUsdPerDay?: number;
  maxAirports: number;
  extraDriveUsdPerHour: number;
  mpg: number;
  gasPriceUsd: number;
}

export async function airportsByProperty(ids: number[]) {
  const map = new Map<number, (typeof propertyAirport.$inferSelect)[]>();
  if (!ids.length) return map;
  const rows = await getDb().select().from(propertyAirport).where(inArray(propertyAirport.propertyId, ids));
  for (const r of rows) map.set(r.propertyId, [...(map.get(r.propertyId) ?? []), r]);
  for (const list of map.values()) list.sort((a, b) => (a.driveHours ?? 99) - (b.driveHours ?? 99));
  return map;
}

const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

/** Cost of using the alternative departure airport: drive there and back, plus parking (nights + 1 days). */
export function altOriginExtraUsd(s: FareSettings, arrivalDate: string, checkoutDate: string) {
  const hours = s.altOriginDriveHours ?? 0;
  const miles = s.altOriginDriveMiles ?? 0;
  const gas = s.mpg > 0 ? ((2 * miles) / s.mpg) * s.gasPriceUsd : 0;
  return 2 * hours * s.extraDriveUsdPerHour + gas + (days(arrivalDate, checkoutDate) + 1) * (s.altOriginParkingUsdPerDay ?? 0);
}

/** Best airport per departure airport, and the overall best after the cost of reaching a non-home airport. */
export function chooseByOrigin(
  options: FareOption[],
  airports: CandidateAirport[],
  s: FareSettings,
  searchOrigin: string,
  dates: { arrivalDate: string; checkoutDate: string },
) {
  const fallback = searchOrigin.split(",")[0]; // quotes saved before multi-origin searches have no per-option origin
  const byOrigin: Record<string, OriginFare> = {};
  for (const origin of new Set(options.map((o) => o.origin ?? fallback))) {
    const c = chooseFare(options.filter((o) => (o.origin ?? fallback) === origin), airports, s);
    if (!c) continue;
    const originExtraUsd = origin === s.originAirport ? 0 : altOriginExtraUsd(s, dates.arrivalDate, dates.checkoutDate);
    byOrigin[origin] = { ...c, origin, originExtraUsd };
  }
  const cost = (f: OriginFare) => f.fareUsd + f.extraDriveUsd + f.layoverUsd + f.originExtraUsd;
  const best = Object.values(byOrigin).sort((a, b) => cost(a) - cost(b))[0] ?? null;
  return { best, byOrigin };
}

/** Latest cached quote for each listing's search, turned into the best airport choice. */
/** Paid seats in a "adults/children/lapInfants" key (lap infants don't get a seat). */
export const seatsIn = (passengers: string) => {
  const [adults, children] = passengers.split("/").map(Number);
  return Math.max(1, (adults || 0) + (children || 0));
};

export async function faresFor<T extends { propertyId: number; arrivalDate: string; checkoutDate: string }>(
  rows: T[],
  s: FareSettings,
): Promise<Map<T, FareInfo>> {
  const out = new Map<T, FareInfo>();
  const airports = await airportsByProperty([...new Set(rows.map((r) => r.propertyId))]);
  const dates = [...new Set(rows.map((r) => r.arrivalDate))];
  const quotes = dates.length
    ? await getDb().select().from(flightQuote).where(inArray(flightQuote.outboundDate, dates))
    : [];
  // Keyed without passengers: a fare searched for another seat count still beats a distance guess
  // (scoring scales it per seat), so changing "Plane tickets" never hides the real prices.
  const passengers = passengersKey(passengersFor(s.tickets, s.lapInfants));
  const byKey = new Map<string, (typeof quotes)[number]>();
  for (const q of quotes) {
    if (q.status === "failed") continue;
    const k = quoteKey({ ...q, passengers: "" });
    if (!byKey.has(k) || q.passengers === passengers) byKey.set(k, q);
  }
  for (const r of rows) {
    const list = airports.get(r.propertyId) ?? [];
    const base = {
      airports: searchAirports(list, s.maxAirports).join(","),
      outboundDate: r.arrivalDate,
      returnDate: r.checkoutDate,
      passengers: "",
    };
    // prefer the current (e.g. COS,DEN) search; fall back to an older home-airport-only quote
    const q = byKey.get(quoteKey({ ...base, origin: searchOrigins(s) })) ?? byKey.get(quoteKey({ ...base, origin: s.originAirport }));
    if (!q) {
      out.set(r, null);
      continue;
    }
    const { best, byOrigin } = chooseByOrigin(q.options, list, s, q.origin, r);
    out.set(
      r,
      best
        ? { ...best, byOrigin, seats: seatsIn(q.passengers), fetchedAt: q.fetchedAt.toISOString(), searchUrl: q.searchUrl }
        : { status: "none", fetchedAt: q.fetchedAt.toISOString() },
    );
  }
  return out;
}

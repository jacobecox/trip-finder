import { inArray } from "drizzle-orm";
import { flightQuote, getDb, propertyAirport } from "@/lib/db";
import { chooseFare, type ChosenFare } from "./choose";
import { quoteKey, searchAirports } from "./keys";
import { passengersFor, passengersKey } from "./serpapi";

export interface ListingFare extends ChosenFare {
  seats: number; // tickets the fare was priced for (lap infants ride free-ish and aren't counted)
  fetchedAt: string;
  searchUrl: string | null;
}
/** "none" = searched, no flights found; null = not searched yet */
export type FareInfo = ListingFare | { status: "none"; fetchedAt: string } | null;

interface FareSettings {
  tickets: number;
  lapInfants: number;
  originAirport: string;
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

/** Latest cached quote for each listing's search, turned into the best airport choice. */
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
  const byKey = new Map(quotes.filter((q) => q.status !== "failed").map((q) => [quoteKey(q), q]));
  const passengers = passengersKey(passengersFor(s.tickets, s.lapInfants));
  for (const r of rows) {
    const list = airports.get(r.propertyId) ?? [];
    const key = quoteKey({
      origin: s.originAirport,
      airports: searchAirports(list, s.maxAirports).join(","),
      outboundDate: r.arrivalDate,
      returnDate: r.checkoutDate,
      passengers,
    });
    const q = byKey.get(key);
    if (!q) {
      out.set(r, null);
      continue;
    }
    const chosen = chooseFare(q.options, list, s);
    out.set(
      r,
      chosen
        ? { ...chosen, seats: s.tickets, fetchedAt: q.fetchedAt.toISOString(), searchUrl: q.searchUrl }
        : { status: "none", fetchedAt: q.fetchedAt.toISOString() },
    );
  }
  return out;
}

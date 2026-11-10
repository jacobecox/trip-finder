import type { propertyAirport } from "@/lib/db/schema";

type AirportRow = typeof propertyAirport.$inferSelect;

/** Airports to search for a property: pinned first, then auto picks; never excluded. Sorted for a stable cache key. */
export function searchAirports(rows: Pick<AirportRow, "iata" | "auto" | "pinned" | "excluded" | "driveHours">[], max: number) {
  const usable = rows.filter((r) => !r.excluded && (r.auto || r.pinned));
  const ordered = [...usable.filter((r) => r.pinned), ...usable.filter((r) => !r.pinned)];
  return ordered
    .slice(0, max)
    .map((r) => r.iata)
    .sort();
}

export const quoteKey = (q: { origin: string; airports: string; outboundDate: string; returnDate: string; passengers: string }) =>
  [q.origin, q.airports, q.outboundDate, q.returnDate, q.passengers].join("|");

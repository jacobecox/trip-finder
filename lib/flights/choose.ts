import type { FareOption } from "@/lib/db/schema";

export interface CandidateAirport {
  iata: string;
  driveHours: number | null; // airport -> lodging, one way
  driveMiles: number | null;
}

export interface ChooseSettings {
  extraDriveUsdPerHour: number; // value of travel time: extra driving and layovers
  mpg: number;
  gasPriceUsd: number;
}

export interface ChosenFare {
  iata: string;
  fareUsd: number; // round trip, all passengers
  extraDriveHours: number; // one way, vs the nearest candidate
  extraDriveUsd: number; // both ways: time value + gas
  nearestIata: string;
  airline: string;
  stops: number;
  durationMin: number; // outbound
  layovers: { iata: string; minutes: number; overnight?: boolean }[] | null; // null = not recorded (older quote)
  layoverUsd: number; // layover time, both ways (return assumed like outbound), at the travel-time rate
  /** cheapest nonstop at any candidate airport, when the pick has stops */
  nonstop: { iata: string; fareUsd: number; airline: string } | null;
}

const layoverHours = (o: FareOption) => (o.layovers ?? []).reduce((h, l) => h + l.minutes, 0) / 60;

/**
 * Pure: picks the itinerary with the lowest fare + extra-drive + layover-time cost. Extra drive is measured
 * against the nearest airport that actually has a fare (small fields often have no airline service)
 * and counted twice (arrive and depart).
 */
export function chooseFare(options: FareOption[], airports: CandidateAirport[], s: ChooseSettings): ChosenFare | null {
  const priced = new Set(options.map((o) => o.iata));
  const known = airports.filter((a) => a.driveHours != null && priced.has(a.iata));
  const nearest = [...known].sort((a, b) => a.driveHours! - b.driveHours!)[0];
  let best: ChosenFare | null = null;
  for (const o of options) {
    const a = airports.find((x) => x.iata === o.iata);
    if (!a) continue;
    const extraHours = nearest && a.driveHours != null ? Math.max(0, a.driveHours - nearest.driveHours!) : 0;
    const extraMiles = nearest && a.driveMiles != null ? Math.max(0, a.driveMiles - (nearest.driveMiles ?? 0)) : 0;
    const gas = s.mpg > 0 ? ((2 * extraMiles) / s.mpg) * s.gasPriceUsd : 0;
    const extraDriveUsd = 2 * extraHours * s.extraDriveUsdPerHour + gas;
    const c: ChosenFare = {
      iata: o.iata,
      fareUsd: o.priceUsd,
      extraDriveHours: extraHours,
      extraDriveUsd,
      nearestIata: nearest?.iata ?? o.iata,
      airline: o.airline,
      stops: o.stops,
      durationMin: o.durationMin,
      layovers: o.layovers ?? null,
      layoverUsd: 2 * layoverHours(o) * s.extraDriveUsdPerHour,
      nonstop: null,
    };
    const cost = (x: ChosenFare) => x.fareUsd + x.extraDriveUsd + x.layoverUsd;
    if (!best || cost(c) < cost(best)) best = c;
  }
  if (best && best.stops > 0) {
    const n = options
      .filter((o) => o.stops === 0 && airports.some((a) => a.iata === o.iata))
      .sort((a, b) => a.priceUsd - b.priceUsd)[0];
    if (n) best.nonstop = { iata: n.iata, fareUsd: n.priceUsd, airline: n.airline };
  }
  return best;
}

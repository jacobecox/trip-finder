import type { FareOption } from "@/lib/db/schema";

export interface CandidateAirport {
  iata: string;
  driveHours: number | null; // airport -> lodging, one way
  driveMiles: number | null;
}

export interface ChooseSettings {
  extraDriveUsdPerHour: number;
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
}

/**
 * Pure: picks the arrival airport with the lowest fare + extra-drive cost. Extra drive is measured
 * against the nearest candidate and counted twice (arrive and depart).
 */
export function chooseFare(options: FareOption[], airports: CandidateAirport[], s: ChooseSettings): ChosenFare | null {
  const known = airports.filter((a) => a.driveHours != null);
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
    };
    if (!best || c.fareUsd + c.extraDriveUsd < best.fareUsd + best.extraDriveUsd) best = c;
  }
  return best;
}

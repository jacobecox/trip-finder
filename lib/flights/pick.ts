import type { FareInfo, OriginFare } from "./fares";

/** Total cost of a choice for comparison (fare + extra drive + layover time + getting to that airport). */
export const originCost = (f: OriginFare) => f.fareUsd + f.extraDriveUsd + f.layoverUsd + f.originExtraUsd;

/**
 * Client-safe: a listing's fare as seen from one departure airport ("best" = overall best).
 * Null when that airport wasn't priced for this listing yet (falls back to the estimate).
 */
export function fareFrom(f: FareInfo, from: string): FareInfo {
  if (from === "best" || !f || "status" in f) return f;
  const c = f.byOrigin?.[from];
  return c ? { ...f, ...c } : null;
}

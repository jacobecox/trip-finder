import { TAGS, type Tag, type TagWeights } from "@/lib/tags/constants";
import { distanceKm, type LatLng } from "@/lib/geo/util";

const KM_PER_MILE = 1.609344;

export interface ScoreSettings {
  costWeight: number;
  activityWeight: number;
  tagWeights: TagWeights;
  tickets: number;
  mpg: number;
  gasPriceUsd: number;
  flightBaseUsd: number;
  flightPerMileUsd: number;
}

export interface ScoreInput {
  priceUsd: number; // lodging, full 7-night stay
  isDrivable: boolean;
  driveMiles: number | null; // one way, by road
  lat: number | null;
  lng: number | null;
  tags: Tag[];
  /** real fare for the best arrival airport (from cached SerpApi results) */
  fare?: { fareUsd: number; extraDriveUsd: number; layoverUsd?: number; seats: number } | { status: "none" } | null;
}

export interface Scored {
  distanceMiles: number | null; // straight line from origin
  travelMode: "drive" | "fly" | null;
  travelUsd: number | null;
  fareSource: "quote" | "estimate" | null; // real fare vs distance-based estimate
  totalUsd: number | null;
  costScore: number | null; // 0-100, cheapest on the list = 100
  activityScore: number; // 0-100
  score: number | null; // 0-100 weighted blend
}

/**
 * Round-trip travel cost in USD: gas when drivable; otherwise the real fare (+ extra drive from a
 * farther airport + layover time, both valued at the travel-time rate), scaled if the ticket count differs from what was priced; else an estimate.
 */
export function travelCost(
  r: Pick<ScoreInput, "isDrivable" | "driveMiles" | "fare">,
  distanceMiles: number | null,
  s: ScoreSettings,
): Pick<Scored, "travelMode" | "travelUsd" | "fareSource"> {
  if (r.isDrivable && r.driveMiles != null && s.mpg > 0)
    return { travelMode: "drive", travelUsd: ((2 * r.driveMiles) / s.mpg) * s.gasPriceUsd, fareSource: null };
  if (r.fare && "fareUsd" in r.fare)
    return {
      travelMode: "fly",
      travelUsd: (r.fare.fareUsd * s.tickets) / Math.max(1, r.fare.seats) + r.fare.extraDriveUsd + (r.fare.layoverUsd ?? 0),
      fareSource: "quote",
    };
  if (distanceMiles != null)
    return {
      travelMode: "fly",
      travelUsd: s.tickets * (s.flightBaseUsd + s.flightPerMileUsd * distanceMiles),
      fareSource: "estimate",
    };
  return { travelMode: null, travelUsd: null, fareSource: null };
}

export function activityScore(tags: Tag[], weights: TagWeights) {
  const total = TAGS.reduce((sum, t) => sum + Math.max(0, weights[t] ?? 0), 0);
  if (total === 0) return 0;
  const have = new Set(tags);
  return (100 * TAGS.reduce((sum, t) => sum + (have.has(t) ? Math.max(0, weights[t] ?? 0) : 0), 0)) / total;
}

/** Scores a whole list; cost score is relative to the cheapest and priciest trips in it. */
export function scoreListings<T extends ScoreInput>(rows: T[], origin: LatLng, s: ScoreSettings): (T & Scored)[] {
  const base = rows.map((r) => {
    const distanceMiles = r.lat != null && r.lng != null ? distanceKm(origin, { lat: r.lat, lng: r.lng }) / KM_PER_MILE : null;
    const travel = travelCost(r, distanceMiles, s);
    return {
      ...r,
      distanceMiles,
      ...travel,
      totalUsd: travel.travelUsd == null ? null : r.priceUsd + travel.travelUsd,
      activityScore: activityScore(r.tags, s.tagWeights),
    };
  });
  const totals = base.map((r) => r.totalUsd).filter((v): v is number => v != null);
  const min = Math.min(...totals);
  const max = Math.max(...totals);
  const wSum = Math.max(0, s.costWeight) + Math.max(0, s.activityWeight);
  return base.map((r) => {
    const costScore = r.totalUsd == null ? null : max === min ? 100 : (100 * (max - r.totalUsd)) / (max - min);
    const score =
      costScore == null || wSum === 0
        ? null
        : (Math.max(0, s.costWeight) * costScore + Math.max(0, s.activityWeight) * r.activityScore) / wSum;
    return { ...r, costScore, score };
  });
}

import { describe, expect, it } from "vitest";
import { DEFAULT_TAG_WEIGHTS } from "@/lib/tags/constants";
import { activityScore, scoreListings, travelCost, type ScoreSettings } from "./scoring";

const S: ScoreSettings = {
  costWeight: 0.75,
  activityWeight: 0.25,
  tagWeights: DEFAULT_TAG_WEIGHTS,
  tickets: 3,
  mpg: 25,
  gasPriceUsd: 3.5,
  flightBaseUsd: 120,
  flightPerMileUsd: 0.1,
};
const origin = { lat: 38.8339, lng: -104.8214 };

describe("travelCost", () => {
  it("drivable: round-trip gas in USD", () => {
    // 2 * 250 mi / 25 mpg * $3.50 = $70
    expect(travelCost({ isDrivable: true, driveMiles: 250 }, 200, S)).toEqual({ travelMode: "drive", travelUsd: 70 });
  });
  it("fly: tickets × (base + per-mile × straight-line miles)", () => {
    // 3 × (120 + 0.1 × 1500) = 810
    expect(travelCost({ isDrivable: false, driveMiles: 1700 }, 1500, S).travelUsd).toBeCloseTo(810);
    expect(travelCost({ isDrivable: false, driveMiles: null }, 1500, { ...S, tickets: 5 }).travelUsd).toBeCloseTo(1350);
  });
  it("unknown location: no cost", () => {
    expect(travelCost({ isDrivable: false, driveMiles: null }, null, S)).toEqual({ travelMode: null, travelUsd: null });
  });
});

describe("activityScore", () => {
  it("is the weighted share of tags present", () => {
    // default weights total 9 (city is 0); zoo 2 + beach 2 = 4
    expect(activityScore(["zoo_aquarium", "beach"], DEFAULT_TAG_WEIGHTS)).toBeCloseTo((100 * 4) / 9);
    expect(activityScore(["city"], DEFAULT_TAG_WEIGHTS)).toBe(0);
    expect(activityScore([], DEFAULT_TAG_WEIGHTS)).toBe(0);
    expect(activityScore(["beach"], Object.fromEntries(Object.keys(DEFAULT_TAG_WEIGHTS).map((k) => [k, 0])) as typeof DEFAULT_TAG_WEIGHTS)).toBe(0);
  });
});

describe("scoreListings", () => {
  const near = { priceUsd: 100, isDrivable: true, driveMiles: 250, lat: 39.9, lng: -105.8, tags: [] as never[] };
  const far = { priceUsd: 300, isDrivable: false, driveMiles: null, lat: 28.33, lng: -81.5, tags: ["beach", "theme_park", "zoo_aquarium"] as const };
  const lost = { priceUsd: 50, isDrivable: false, driveMiles: null, lat: null, lng: null, tags: [] as never[] };

  it("cheapest gets cost score 100, priciest 0, and unknown cost is unscored", () => {
    const [a, b, c] = scoreListings([near, { ...far, tags: [...far.tags] }, lost], origin, S);
    expect(a).toMatchObject({ travelMode: "drive", totalUsd: 170, costScore: 100 });
    expect(b.travelMode).toBe("fly");
    expect(b.costScore).toBe(0);
    expect(b.distanceMiles).toBeGreaterThan(1400);
    expect(c).toMatchObject({ totalUsd: null, costScore: null, score: null });
    // final = 0.75 × cost + 0.25 × activity
    expect(a.score).toBeCloseTo(75);
    expect(b.score).toBeCloseTo(0.25 * ((100 * 6) / 9));
  });

  it("respects custom weights and single-row lists", () => {
    const [only] = scoreListings([near], origin, { ...S, costWeight: 1, activityWeight: 1 });
    expect(only.costScore).toBe(100);
    expect(only.score).toBeCloseTo(50);
  });
});

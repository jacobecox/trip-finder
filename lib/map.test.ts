import { describe, expect, it } from "vitest";
import { escapeHtml, pinsFor, rankColors, scoreScale } from "./map";

const row = (id: number, propertyId: number, score: number | null, lat: number | null = 30) => ({
  id,
  propertyId,
  property: `P${propertyId}`,
  city: "Town",
  state: "FL",
  country: "United States",
  lat,
  lng: -80,
  score,
});

describe("pinsFor", () => {
  it("one pin per located property, listings best-first, best pins drawn last", () => {
    const pins = pinsFor([row(1, 1, 40), row(2, 2, 90), row(3, 1, 70), row(4, 3, 99, null), row(5, 2, null)]);
    expect(pins.map((p) => [p.propertyId, p.bestScore, p.listings.map((l) => l.id)])).toEqual([
      [1, 70, [3, 1]],
      [2, 90, [2, 5]],
    ]);
    expect(pins[0].location).toBe("Town, FL, United States");
  });
});

describe("rankColors / escapeHtml", () => {
  it("colors by rank so one outlier doesn't flatten the scale; gray when unscored", () => {
    const c = rankColors([{ bestScore: 88 }, { bestScore: 2 }, { bestScore: null }, { bestScore: 85 }]);
    expect(c).toEqual(["hsl(120 75% 40%)", "hsl(0 75% 40%)", "#9ca3af", "hsl(60 75% 40%)"]);
  });
  it("shades scores between ranked levels in between, ties share a color, out-of-range clamps", () => {
    const scale = scoreScale([90, 80, 80, 60, null]);
    expect(scale(90)).toBe("hsl(120 75% 40%)");
    expect(scale(80)).toBe("hsl(60 75% 40%)");
    expect(scale(70)).toBe("hsl(30 75% 40%)");
    expect(scale(40)).toBe("hsl(0 75% 40%)");
    expect(scale(99)).toBe("hsl(120 75% 40%)");
    expect(scale(null)).toBe("#9ca3af");
    expect(scoreScale([])(50)).toBe("#9ca3af");
  });
  it("escapes resort names in popups", () => {
    expect(escapeHtml(`Bob's <b>"Inn"</b> & Spa`)).toBe("Bob&#39;s &lt;b&gt;&quot;Inn&quot;&lt;/b&gt; &amp; Spa");
  });
});

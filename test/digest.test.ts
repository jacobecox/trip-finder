import { describe, expect, it } from "vitest";
import { renderDigest, type Pick } from "@/lib/digest";

const pick = (over: Partial<Pick> = {}): Pick => ({
  property: "Sand <Pebbles>",
  location: "Solana Beach, CA, United States",
  arrivalDate: "2026-12-05",
  checkoutDate: "2026-12-12",
  unitType: "Studio",
  score: 91.4,
  color: "#22c55e",
  totalUsd: 670,
  lodgingUsd: 80,
  travelUsd: 590,
  travelMode: "fly",
  estimate: false,
  travel: "✈ COS → SAN · United · 1 stop · 5h 35m",
  flightsUrl: "https://www.google.com/travel/flights?q=a&b",
  altNote: null,
  moreDates: 2,
  tags: ["🏖️ Beach", "🎢 Theme parks", "🦁 Zoo & aquarium", "🥾 Hiking", "🏞️ Scenic"],
  ...over,
});

const base = {
  appUrl: "https://trips.example.test",
  filename: "Dec.pdf",
  listingCount: 205,
  resortCount: 103,
  firstDate: "2026-11-20",
  lastDate: "2027-06-30",
  geocodeRemaining: 0,
  fareRemaining: 0,
  autoPrice: "done",
  now: new Date("2026-11-12T12:00:00"),
};

describe("renderDigest", () => {
  it("renders app-style cards: score, costs, escaped names, links, capped chips", () => {
    const { subject, html, text } = renderDigest({ ...base, picks: [pick(), pick({ property: "Snow Lake", travelMode: "drive", travel: "🚗 6h drive · 400 mi", flightsUrl: null, tags: [] })] });
    expect(subject).toBe("Trip Finder: top 2 picks from Dec.pdf");
    expect(html).toContain("Sand &lt;Pebbles&gt;");
    expect(html).not.toContain("Sand <Pebbles>");
    expect(html).toContain(">91<");
    expect(html).toContain("#22c55e");
    expect(html).toContain("https://www.google.com/travel/flights?q=a&amp;b");
    expect(html).toContain("+1 more"); // 5 tags, 4 shown
    expect(html).toContain(">Gas<");
    expect(html).toContain("205 week-long stays at 103 resorts · Nov 20 – Jun 30, 2027");
    expect(html).toContain("in 23 days");
    expect(html).toContain('href="https://trips.example.test"');
    expect(text).toContain("stay $80 + flights $590 = $670");
  });

  it("marks estimates and shows pending notes quietly", () => {
    const { html, text } = renderDigest({
      ...base,
      autoPrice: "skipped-not-enough-searches",
      fareRemaining: 140,
      picks: [pick({ estimate: true, flightsUrl: null, travel: "✈ Flight cost is an estimate until real fares are looked up" })],
    });
    expect(html).toContain("estimate</span>");
    expect(html).toContain("ⓘ Flights aren&#39;t priced yet");
    expect(html).not.toContain("Google Flights ↗");
    expect(text).toContain("(estimate)");
  });

  it("handles an import with nothing scored yet", () => {
    const { subject, html } = renderDigest({ ...base, picks: [] });
    expect(subject).toBe("Trip Finder: Dec.pdf imported");
    expect(html).toContain("No scored trips yet");
  });
});

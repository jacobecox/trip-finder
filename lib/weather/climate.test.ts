import { describe, expect, it } from "vitest";
import { climateYears, skyOf, summarize, windowIn } from "./climate";

describe("climate windows", () => {
  it("uses the last 10 complete years", () => {
    expect(climateYears(new Date("2026-11-12"))).toEqual([2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]);
  });
  it("covers the nights of the stay, across New Year and on Feb 29", () => {
    expect(windowIn(2020, "12-05", 7)).toEqual({ start: "2020-12-05", end: "2020-12-11" });
    expect(windowIn(2020, "12-29", 7)).toEqual({ start: "2020-12-29", end: "2021-01-04" });
    expect(windowIn(2021, "02-29", 7)).toEqual({ start: "2021-02-28", end: "2021-03-06" });
  });
});

describe("summarize", () => {
  it("averages every day and counts rainy and snowy days", () => {
    const year = { high: [80, 70], low: [60, 50], precipMm: [0, 5], snowCm: [0, 0], cloud: [10, 50] };
    const c = summarize([year, { ...year, snowCm: [2, 0], high: [null, 70] }], [2024, 2025]);
    expect(c).toEqual({ highF: 73.3, lowF: 53.3, rainFrac: 0.67, snowFrac: 0, cloudPct: 37, days: 3, years: "2024–2025" });
  });
  it("is null without data", () => {
    expect(summarize([{ high: [null], low: [null], precipMm: [null], snowCm: [null], cloud: [null] }], [2025])).toBeNull();
  });
});

describe("skyOf", () => {
  it("snow and rain win, then cloud cover", () => {
    expect(skyOf({ snowFrac: 0.3, rainFrac: 0.5, cloudPct: 90 })).toBe("snowy");
    expect(skyOf({ snowFrac: 0.16, rainFrac: 0.41, cloudPct: 61 })).toBe("snowy"); // Tahoe, January
    expect(skyOf({ snowFrac: 0, rainFrac: 0.45, cloudPct: 20 })).toBe("rainy");
    expect(skyOf({ snowFrac: 0, rainFrac: 0.4, cloudPct: 61 })).toBe("partly");
    expect(skyOf({ snowFrac: 0, rainFrac: 0.1, cloudPct: 40 })).toBe("sunny");
    expect(skyOf({ snowFrac: 0, rainFrac: 0.1, cloudPct: 50 })).toBe("partly");
    expect(skyOf({ snowFrac: 0, rainFrac: 0.1, cloudPct: 80 })).toBe("cloudy");
  });
});

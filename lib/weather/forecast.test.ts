import { describe, expect, it } from "vitest";
import { forecastFor, inForecastRange } from "./forecast";

const daily = {
  time: ["2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"],
  temperature_2m_max: [50, 40, 30, 20],
  temperature_2m_min: [30, 20, 10, 0],
  precipitation_sum: [0, 5, 0, 8],
  snowfall_sum: [0, 0, 0, 6],
  cloud_cover_mean: [10, 90, 20, 100],
};

describe("forecast", () => {
  it("only covers stays that start within 16 days and haven't ended", () => {
    expect(inForecastRange({ arrivalDate: "2026-11-27", checkoutDate: "2026-12-04" }, "2026-11-12")).toBe(true);
    expect(inForecastRange({ arrivalDate: "2026-11-28", checkoutDate: "2026-12-05" }, "2026-11-12")).toBe(false);
    expect(inForecastRange({ arrivalDate: "2026-11-01", checkoutDate: "2026-11-12" }, "2026-11-12")).toBe(false);
  });

  it("summarizes only the stay's nights that the forecast reaches", () => {
    const f = forecastFor(daily, "2026-11-13", "2026-11-20")!;
    expect(f.days).toBe(3); // 13th–15th; the rest is past the forecast
    expect(f.highF).toBe(30);
    expect(f.rainFrac).toBe(0.67);
    expect(f.snowFrac).toBe(0.33);
    expect(f.years).toBe("forecast");
  });

  it("excludes the checkout day and returns null outside the range", () => {
    expect(forecastFor(daily, "2026-11-12", "2026-11-14")!.days).toBe(2);
    expect(forecastFor(daily, "2026-12-01", "2026-12-08")).toBeNull();
  });
});

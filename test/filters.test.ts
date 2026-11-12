import { describe, expect, it } from "vitest";
import { fromQuery, toQuery, type Filters } from "@/app/(app)/filter-url";
import { seatsIn } from "@/lib/flights/fares";

const filters: Filters = {
  tickets: "3",
  flyFrom: "best",
  dates: { from: "", to: "" },
  tag: "",
  unit: "",
  country: "",
  state: "",
  drivableOnly: false,
};
const defaults = { filters, sort: { key: "score" as const, dir: -1 as const } };

describe("filters in the address", () => {
  it("leaves defaults out", () => {
    expect(toQuery(filters, defaults.sort, defaults)).toBe("");
  });
  it("round-trips a filtered, sorted view", () => {
    const f: Filters = { ...filters, tag: "beach", dates: { from: "2026-12-01", to: "2026-12-31" }, drivableOnly: true, state: "CA" };
    const sort = { key: "totalUsd" as const, dir: 1 as const };
    const qs = toQuery(f, sort, defaults);
    const back = fromQuery(Object.fromEntries(new URLSearchParams(qs)), defaults);
    expect(back).toEqual({ filters: f, sort });
  });
  it("ignores junk", () => {
    const back = fromQuery({ tag: "nope", from: "tomorrow", tickets: "99", sort: "bogus" }, defaults);
    expect(back).toEqual(defaults);
  });
});

describe("seatsIn", () => {
  it("counts adults and children, not lap infants", () => {
    expect(seatsIn("2/1/1")).toBe(3);
    expect(seatsIn("1/0/1")).toBe(1);
  });
});

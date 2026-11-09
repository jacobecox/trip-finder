import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseArrival, parseListings } from "./parse";
import { parsePdf } from "./extract";

const dir = path.join(__dirname, "../../fixtures");
const pdf = existsSync(dir) ? readdirSync(dir).find((f) => f.endsWith(".pdf")) : undefined;

describe.skipIf(!pdf)("fixture PDF", () => {
  it("parses all rows with no warnings", async () => {
    const { listings, warnings } = await parsePdf(readFileSync(path.join(dir, pdf!)));
    expect(warnings).toEqual([]);
    expect(listings.length).toBeGreaterThan(100);
    expect(listings[0]).toEqual({
      inventoryNumber: "191975",
      arrivalDate: "2026-11-13",
      checkoutDate: "2026-11-20",
      property: "Indian Peaks",
      city: "Fraser",
      state: "CO",
      countryCode: "USA",
      country: "United States",
      unitType: "2 Bedroom",
      priceUsd: 105,
    });
    expect(listings.at(-1)).toMatchObject({
      inventoryNumber: "201701",
      arrivalDate: "2027-02-27",
      property: "Star Island Resort And Club",
      city: "Kissimmee",
      state: "FL",
      unitType: "1 Bedroom",
      priceUsd: 365,
    });
  });
});

describe("parseListings validation", () => {
  const hdr = [20.4, 70.9, 123, 161.7, 366.8, 479.6, 527.7, 575.8, 666.6, 729.5].map((x, i) => ({ str: `H${i}`, x, y: 430 }));
  const row = (y: number, inv: string, date: string, price: string, unit = "Studio") =>
    [inv, date, "5", "Some Resort", "Town", "CO", "USA", "United States", unit, price].map((s, i) => ({
      str: s,
      x: hdr[i].x + (i === 9 ? -4 : 0),
      y,
    }));

  it("flags invalid rows without failing", () => {
    const { listings, warnings } = parseListings([
      [...hdr, ...row(417, "123456", "13-Nov-26", "$105"), ...row(405, "12345", "31-Feb-26", "$0", "Castle")],
    ]);
    expect(listings).toHaveLength(1);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toMatch(/inventory[\s\S]*date[\s\S]*price[\s\S]*unit/);
  });

  it("computes checkout = arrival + 7 days across month/year boundaries", () => {
    expect(parseArrival("28-Dec-26")).toEqual({ arrival: "2026-12-28", checkout: "2027-01-04" });
  });
});

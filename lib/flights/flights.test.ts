import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/serpapi-bigbear.json";
import cosDen from "./__fixtures__/serpapi-bigbear-cos-den.json";
import { airportByIata, nearbyAirports, selectCandidates, type Reachable } from "./airports";
import { chooseFare } from "./choose";
import { searchAirports, searchOrigins } from "./keys";
import { parseFares, passengersFor } from "./serpapi";

const rules = { maxDriveHours: 2.5, hubMaxDriveHours: 4, maxAirports: 7 };
const r = (iata: string, hours: number, large = true): Reachable => ({ iata, large, hours, miles: hours * 50 });

describe("airport data", () => {
  it("has the airports we care about", () => {
    expect(airportByIata("cos")?.city).toBe("Colorado Springs");
    expect(nearbyAirports({ lat: 34.24, lng: -116.91 }).map((a) => a.iata)).toEqual(
      expect.arrayContaining(["ONT", "LAX", "BUR", "SNA", "PSP"]),
    );
  });
});

describe("selectCandidates", () => {
  it("Big Bear: big airports first so LAX survives the cap", () => {
    // ORS drive times from the real probe
    const reachable = [
      r("SBD", 1.1), r("PSP", 1.9), r("ONT", 1.6), r("SNA", 2.0), r("LGB", 2.3),
      r("CLD", 2.7, false), r("BUR", 2.2), r("HHR", 2.3, false), r("LAX", 2.4), r("SAN", 3.0),
    ];
    const picked = selectCandidates(reachable, rules).map((a) => a.iata);
    expect(picked).toEqual(["SBD", "ONT", "PSP", "SNA", "BUR", "LGB", "LAX"]); // by drive time; HHR, CLD, SAN out
  });

  it("Angel Fire: adds the nearest big hub when only small airports are close", () => {
    const reachable = [r("TSM", 1.0, false), r("SAF", 2.5, false), r("ALS", 2.9, false), r("ABQ", 3.4), r("DEN", 4.5)];
    expect(selectCandidates(reachable, rules).map((a) => a.iata)).toEqual(["TSM", "SAF", "ABQ"]);
  });

  it("remote places still get their nearest reachable airport", () => {
    expect(selectCandidates([r("XYZ", 6, false)], rules).map((a) => a.iata)).toEqual(["XYZ"]);
    expect(selectCandidates([], rules)).toEqual([]);
  });
});

describe("searchAirports", () => {
  it("pinned first, excluded never, sorted for a stable key", () => {
    const row = (iata: string, o: Partial<{ auto: boolean; pinned: boolean; excluded: boolean }> = {}) => ({
      iata,
      driveHours: 1,
      auto: o.auto ?? true,
      pinned: o.pinned ?? false,
      excluded: o.excluded ?? false,
    });
    const rows = [row("ONT"), row("SBD", { excluded: true }), row("LAX"), row("BUR", { auto: false, pinned: true }), row("SNA")];
    expect(searchAirports(rows, 7)).toEqual(["BUR", "LAX", "ONT", "SNA"]);
    expect(searchAirports(rows, 2)).toEqual(["BUR", "ONT"]); // pinned kept even at the cap
  });
});

describe("parseFares (recorded SerpApi response)", () => {
  it("keeps the cheapest itinerary per arrival airport", () => {
    const res = parseFares(fixture, ["SBD", "ONT", "PSP", "SNA", "LGB", "BUR", "LAX"]);
    expect(res.status).toBe("ok");
    expect(res.searchUrl).toContain("google.com/travel/flights");
    expect(res.options.map((o) => [o.iata, o.priceUsd])).toEqual([
      ["LGB", 1220],
      ["LAX", 1232],
      ["PSP", 1280],
      ["BUR", 1292],
      ["SNA", 1328],
      ["ONT", 1352],
    ]);
    // three $1220 itineraries to LGB: the shortest one wins the tie
    expect(res.options[0]).toMatchObject({
      origin: "COS",
      airline: "Southwest",
      stops: 1,
      durationMin: 255,
      layovers: [{ iata: "PHX", minutes: 55 }],
    });
  });

  it("splits by departure airport and keeps the cheapest nonstop next to a cheaper one-stop", () => {
    const res = parseFares(cosDen, ["LAX", "LGB", "ONT"]);
    expect(res.options.map((o) => [o.origin, o.iata, o.priceUsd, o.stops])).toEqual([
      ["DEN", "LAX", 324, 0],
      ["DEN", "ONT", 474, 0],
      ["DEN", "LGB", 861, 0],
      ["COS", "LGB", 1220, 1],
    ]);
    const extra = parseFares(
      {
        best_flights: [
          { price: 900, total_duration: 300, flights: [{ departure_airport: { id: "COS" }, arrival_airport: { id: "DEN" } }, { departure_airport: { id: "DEN" }, arrival_airport: { id: "LAX" } }], layovers: [{ id: "DEN", duration: 70 }] },
          { price: 1100, total_duration: 150, flights: [{ departure_airport: { id: "COS" }, arrival_airport: { id: "LAX" } }] },
        ],
      },
      ["LAX"],
    );
    expect(extra.options.map((o) => [o.priceUsd, o.stops])).toEqual([[900, 1], [1100, 0]]);
  });

  it("ignores airports we didn't ask for and reports no flights", () => {
    expect(parseFares(fixture, ["ONT"]).options.map((o) => o.iata)).toEqual(["ONT"]);
    expect(parseFares({}, ["ONT"])).toEqual({ status: "none", options: [], searchUrl: null });
  });
});

describe("chooseFare", () => {
  const airports = [
    { iata: "ONT", driveHours: 1.6, driveMiles: 70 },
    { iata: "LGB", driveHours: 2.3, driveMiles: 105 },
    { iata: "LAX", driveHours: 2.4, driveMiles: 110 },
  ];
  const s = { extraDriveUsdPerHour: 25, mpg: 25, gasPriceUsd: 3.5 };
  const opt = (iata: string, priceUsd: number) => ({ iata, priceUsd, airline: "X", stops: 1, durationMin: 200 });

  it("a farther airport wins when it saves more than the extra drive costs", () => {
    // LGB: +0.7 h each way -> 2 × 0.7 × $25 = $35, + 2 × 35 mi / 25 mpg × $3.50 = $9.80
    const c = chooseFare([opt("ONT", 1352), opt("LGB", 1220)], airports, s)!;
    expect(c).toMatchObject({ iata: "LGB", fareUsd: 1220, nearestIata: "ONT" });
    expect(c.extraDriveHours).toBeCloseTo(0.7);
    expect(c.extraDriveUsd).toBeCloseTo(35 + 9.8);
  });

  it("extra drive is measured from the nearest airport that has flights", () => {
    const withTiny = [{ iata: "SBD", driveHours: 1.1, driveMiles: 40 }, ...airports];
    const c = chooseFare([opt("ONT", 1352), opt("LGB", 1220)], withTiny, s)!;
    expect(c).toMatchObject({ iata: "LGB", nearestIata: "ONT" });
    expect(c.extraDriveHours).toBeCloseTo(0.7);
  });

  it("layover time counts against a fare; the cheapest nonstop is reported", () => {
    const oneStop = { ...opt("ONT", 1250), layovers: [{ iata: "PHX", minutes: 90 }] };
    const nonstop = { ...opt("ONT", 1300), stops: 0 };
    const at50 = { ...s, extraDriveUsdPerHour: 50 };
    // 90 min each way at $50/h = $150 > $50 saved
    expect(chooseFare([oneStop, nonstop], airports, at50)).toMatchObject({ fareUsd: 1300, stops: 0, layoverUsd: 0, nonstop: null });
    const c = chooseFare([oneStop, { ...nonstop, priceUsd: 1500 }], airports, at50)!;
    expect(c).toMatchObject({ fareUsd: 1250, layoverUsd: 150, nonstop: { iata: "ONT", fareUsd: 1500 } });
    // older quotes have no layover detail: no penalty, shown as unknown
    expect(chooseFare([opt("ONT", 1250)], airports, s)).toMatchObject({ layovers: null, layoverUsd: 0 });
  });

  it("small savings don't justify the drive", () => {
    expect(chooseFare([opt("ONT", 1250), opt("LAX", 1220)], airports, s)!.iata).toBe("ONT");
  });

  it("no matching options -> null", () => {
    expect(chooseFare([], airports, s)).toBeNull();
  });
});

describe("searchOrigins", () => {
  it("home airport plus the second one, if set and different", () => {
    expect(searchOrigins({ originAirport: "COS", altOriginAirport: "DEN" })).toBe("COS,DEN");
    expect(searchOrigins({ originAirport: "COS", altOriginAirport: "" })).toBe("COS");
    expect(searchOrigins({ originAirport: "COS", altOriginAirport: "COS" })).toBe("COS");
  });
});

describe("passengersFor", () => {
  it("first two seats are adults; lap infants need an adult each", () => {
    expect(passengersFor(3, 1)).toEqual({ adults: 2, children: 1, lapInfants: 1 });
    expect(passengersFor(1, 3)).toEqual({ adults: 1, children: 0, lapInfants: 1 });
    expect(passengersFor(4, 0)).toEqual({ adults: 2, children: 2, lapInfants: 0 });
  });
});

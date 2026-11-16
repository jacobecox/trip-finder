import { describe, expect, it } from "vitest";
import { indexOf, matches, type Searchable } from "./search";

const stay = (property: string, city: string, state: string, country = "United States", over: Partial<Searchable> = {}): Searchable => ({
  property, city, state, country, unitType: "1 Bedroom", tags: [], isDrivable: false, climate: null, forecast: null, ...over,
});

const ALL = [
  stay("Lagonita Lodge", "Big Bear Lake", "CA", undefined, { tags: ["skiing", "hiking"], isDrivable: true }),
  stay("Snow Lake Lodge", "Big Bear Lake", "CA"),
  stay("Lake Condominiums At Big Sky", "Big Sky", "MT", undefined, { tags: ["skiing"] }),
  stay("Stardust - Tahoe", "S. Lake Tahoe", "CA"),
  stay("The Ridge Tahoe", "Stateline", "NV"),
  stay("Magic Tree Resort", "Kissimmee", "FL", undefined, { tags: ["theme_park"] }),
  stay("Sand Pebbles", "Solana Beach", "CA", undefined, { tags: ["beach"] }),
  stay("Club Chalet", "Gatlinburg", "TN"),
  stay("The Bliss Riviera Maya", "Playa Del Carmen", "ROO", "Mexico", { tags: ["beach"] }),
  stay("Pono Kai", "Kapaa, Kauai", "HI"),
  stay("Angel Fire Cabin Share Resort", "Angel Fire", "NM"),
  stay("Falcon Point Resort", "Avon", "CO", undefined, {
    isDrivable: true,
    climate: { highF: 34, lowF: 10, rainFrac: 0.3, snowFrac: 0.4, cloudPct: 60, days: 70, years: "x" },
  }),
];
const ix = ALL.map((s) => ({ s, ix: indexOf(s) }));
const find = (q: string) => ix.filter((x) => matches(x.ix, q)).map((x) => x.s.property);

describe("trip search", () => {
  it("finds a place by its city, as a phrase or words", () => {
    expect(find("Big Bear")).toEqual(["Lagonita Lodge", "Snow Lake Lodge"]);
    expect(find("big bear lake")).toEqual(["Lagonita Lodge", "Snow Lake Lodge"]);
    expect(find("bigbear")).toEqual([]); // no spaces is too far off; that's fine
    expect(find("  BIG  bear! ")).toEqual(["Lagonita Lodge", "Snow Lake Lodge"]);
  });
  it("needs every word to match", () => {
    expect(find("big")).toEqual(["Lagonita Lodge", "Snow Lake Lodge", "Lake Condominiums At Big Sky"]);
    expect(find("big sky")).toEqual(["Lake Condominiums At Big Sky"]);
  });
  it("knows area nicknames and abbreviations", () => {
    expect(find("lake tahoe")).toEqual(["Stardust - Tahoe", "The Ridge Tahoe"]);
    expect(find("south lake tahoe")).toEqual(["Stardust - Tahoe"]);
    expect(find("orlando")).toEqual(["Magic Tree Resort"]);
    expect(find("disney")).toEqual(["Magic Tree Resort"]);
    expect(find("smoky mountains")).toEqual(["Club Chalet"]);
    expect(find("cancun")).toEqual(["The Bliss Riviera Maya"]);
    expect(find("vail")).toEqual(["Falcon Point Resort"]);
  });
  it("matches states by code or name, and regions", () => {
    expect(find("ca")).toEqual(["Lagonita Lodge", "Snow Lake Lodge", "Stardust - Tahoe", "Sand Pebbles"]);
    expect(find("Florida")).toEqual(["Magic Tree Resort"]);
    expect(find("hawaii")).toEqual(["Pono Kai"]);
    expect(find("Mexico")).toEqual(["The Bliss Riviera Maya"]);
    expect(find("new mexico")).toEqual(["Angel Fire Cabin Share Resort"]);
    expect(find("nm")).toEqual(["Angel Fire Cabin Share Resort"]);
    expect(find("international")).toEqual(["The Bliss Riviera Maya"]);
    expect(find("southwest")).toEqual(["The Ridge Tahoe", "Angel Fire Cabin Share Resort"]);
  });
  it("understands activity words", () => {
    expect(find("snowboarding")).toEqual(["Lagonita Lodge", "Lake Condominiums At Big Sky"]);
    expect(find("ocean")).toEqual(["Sand Pebbles", "The Bliss Riviera Maya"]);
    expect(find("beaches in mexico")).toEqual(["The Bliss Riviera Maya"]);
    expect(find("theme parks")).toEqual(["Magic Tree Resort"]);
  });
  it("understands drive and weather words", () => {
    expect(find("road trip")).toEqual(["Lagonita Lodge", "Falcon Point Resort"]);
    expect(find("snowy colorado")).toEqual(["Falcon Point Resort"]);
    expect(find("cold")).toEqual(["Falcon Point Resort"]);
  });
  it("forgives small typos and partial words", () => {
    expect(find("gatlinberg")).toEqual(["Club Chalet"]);
    expect(find("kissimee")).toEqual(["Magic Tree Resort"]);
    expect(find("kiss")).toEqual(["Magic Tree Resort"]);
    expect(find("lagonita")).toEqual(["Lagonita Lodge"]);
  });
  it("an empty search matches everything", () => {
    expect(find("").length).toBe(ALL.length);
    expect(find("the resort near").length).toBe(ALL.length);
  });
});

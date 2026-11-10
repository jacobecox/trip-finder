import { describe, expect, it, vi } from "vitest";
import { RULES, type Place } from "./rules";
import { applyDerived, matches, tagLocation } from "./tagger";

const center = { lat: 28.33, lng: -81.5 };
const at = (name: string, category: string, type: string, milesNorth = 1, notable = false): Place => ({
  name,
  category,
  type,
  lat: center.lat + milesNorth / 69,
  lng: center.lng,
  notable,
});
const rule = (tag: string) => RULES.find((r) => r.tag === tag)!;

describe("matches", () => {
  it("keeps accepted types inside the radius, de-duplicated by name", () => {
    const r = rule("theme_park"); // 25 mi
    const out = matches(r, center, [
      at("EPCOT", "tourism", "theme_park", 10, true),
      at("epcot ", "tourism", "theme_park", 10, true),
      at("Far Park", "tourism", "theme_park", 40, true),
      at("Theme Park Road", "highway", "residential", 1),
    ]);
    expect(out.map((p) => p.name)).toEqual(["EPCOT"]);
  });

  it("theme parks need a Wikidata link (skips luaus, trampoline parks)", () => {
    const out = matches(rule("theme_park"), center, [
      at("Germaine's Luau", "tourism", "theme_park"),
      at("Urban Air Adventure Park", "tourism", "theme_park"),
      at("Dollywood", "tourism", "theme_park", 1, true),
    ]);
    expect(out.map((p) => p.name)).toEqual(["Dollywood"]);
  });

  it("ski areas: downhill winter_sports only", () => {
    const out = matches(rule("skiing"), center, [
      at("Ski Road", "highway", "residential"),
      at("Ossipee Mountain Ski Area (Closed)", "landuse", "winter_sports"),
      at("Camel's Hump Nordic Ski Area", "landuse", "winter_sports"),
      at("Big Bear Snow Play", "landuse", "winter_sports"),
      at("Big Sky Resort", "landuse", "winter_sports"),
    ]);
    expect(out.map((p) => p.name)).toEqual(["Big Sky Resort"]);
  });

  it("hiking parks must look like a real park/forest", () => {
    const r = RULES.find((x) => x.tag === "hiking" && x.label.includes("park"))!;
    const out = matches(r, center, [
      at("Arapaho National Forest", "leisure", "nature_reserve"),
      at("Smith Neighborhood Park", "leisure", "park"),
      at("Lake Louisa State Park", "leisure", "nature_reserve"),
      at("Jamestown Settlement", "boundary", "protected_area"),
      at("Pearl Harbor National Memorial", "boundary", "national_park"),
      at("Doheny State Beach", "boundary", "protected_area"),
      at("Fort Pulaski National Monument", "boundary", "national_park"),
    ]);
    expect(out.map((p) => p.name)).toEqual(["Arapaho National Forest", "Lake Louisa State Park"]);
  });
});

describe("tightened rules", () => {
  it("beach needs a beach-like name (skips water-park 'beaches')", () => {
    const out = matches(rule("beach"), center, [
      at("Getaway Glen", "natural", "beach"),
      at("Hideaway Bay", "natural", "beach"),
      at("Cocoa Beach", "natural", "beach"),
      at("Playa del Coco", "natural", "beach"),
    ]);
    expect(out.map((p) => p.name)).toEqual(["Cocoa Beach", "Playa del Coco"]);
  });

  it("zoo / aquarium skips splash pads, pools, and ponds or gardens tagged as zoos", () => {
    const r = RULES.find((x) => x.tag === "zoo_aquarium")!;
    const out = matches(r, center, [
      at("Splash Pad", "leisure", "water_park"),
      at("Mesa Aquatic Complex", "leisure", "water_park"),
      at("Schoolyard Sprayground", "leisure", "water_park"),
      at("Golfland Sunsplash", "leisure", "water_park"),
      at("Honolulu Zoo", "tourism", "zoo"),
      at("Lake Ariza", "tourism", "zoo"),
      at("Grange Garden", "tourism", "zoo"),
      at("Kangaroo Creek Farm", "tourism", "zoo", 1, true),
    ]);
    expect(out.map((p) => p.name)).toEqual(["Golfland Sunsplash", "Honolulu Zoo", "Kangaroo Creek Farm"]);
  });
});

describe("tagLocation", () => {
  it("applies tags with evidence, stops early, and requires min counts", async () => {
    const search = vi.fn(async (q: string) => {
      if (q === "[natural=beach]") return [at("Cocoa Beach", "natural", "beach", 2)];
      if (q === "[tourism=zoo]") return [at("Cool Zoo", "tourism", "zoo", 5)];
      if (q === "state park") return [at("Smith Neighborhood Park", "leisure", "park")]; // not park-like
      return [];
    });
    const tags = await tagLocation(center, search);
    expect(tags.beach).toEqual({ present: true, evidence: "beach within 3 mi: Cocoa Beach" });
    expect(tags.zoo_aquarium.present).toBe(true);
    expect(tags.hiking.present).toBe(false);
    expect(tags.skiing.present).toBe(false);
    // zoo matched first, so aquarium and water park were never searched
    expect(search.mock.calls.map((c) => c[0])).not.toContain("[tourism=aquarium]");
    expect(search.mock.calls.map((c) => c[0])).toContain("state park"); // hiking tried every query
  });
});

describe("applyDerived", () => {
  const none = () =>
    Object.fromEntries(
      ["beach", "theme_park", "zoo_aquarium", "hiking", "skiing", "scenic", "city"].map((t) => [t, { present: false, evidence: null }]),
    ) as Awaited<ReturnType<typeof tagLocation>>;

  it("scenic comes from beach / hiking / skiing; theme parks alone don't count", () => {
    const r = none();
    r.theme_park = { present: true, evidence: "x" };
    expect(applyDerived(r, { name: "Kissimmee", population: 60894 }).scenic.present).toBe(false);
    r.hiking = { present: true, evidence: "x" };
    r.beach = { present: true, evidence: "x" };
    expect(applyDerived(r, { name: "Kissimmee", population: 60894 }).scenic).toEqual({ present: true, evidence: "from beach, hiking" });
  });

  it("beach falls back to a beach-named town, and that feeds scenic", () => {
    const r = applyDerived(none(), { name: "Cocoa Beach", population: 11000 });
    expect(r.beach).toEqual({ present: true, evidence: "town name: Cocoa Beach" });
    expect(r.scenic.present).toBe(true);
    expect(applyDerived(none(), { name: "Beachwood", population: 1 }).beach.present).toBe(false);
  });

  it("city means the listed city has 100k+ people", () => {
    expect(applyDerived(none(), { name: "Las Vegas", population: 653533 }).city).toEqual({
      present: true,
      evidence: "Las Vegas: population 653,533",
    });
    expect(applyDerived(none(), { name: "Kissimmee", population: 60894 }).city.present).toBe(false);
    expect(applyDerived(none(), { name: "Nowhere", population: null }).city).toEqual({ present: false, evidence: null });
  });
});

import { describe, expect, it, vi } from "vitest";
import { RULES, type Place } from "./rules";
import { applyDerived, matches, tagLocation } from "./tagger";

const center = { lat: 28.33, lng: -81.5 };
const at = (name: string, category: string, type: string, milesNorth = 1): Place => ({
  name,
  category,
  type,
  lat: center.lat + milesNorth / 69,
  lng: center.lng,
});
const rule = (tag: string) => RULES.find((r) => r.tag === tag)!;

describe("matches", () => {
  it("keeps accepted types inside the radius, de-duplicated by name", () => {
    const r = rule("theme_park"); // 25 mi
    const out = matches(r, center, [
      at("EPCOT", "tourism", "theme_park", 10),
      at("epcot ", "tourism", "theme_park", 10),
      at("Far Park", "tourism", "theme_park", 40),
      at("Theme Park Road", "highway", "residential", 1),
    ]);
    expect(out.map((p) => p.name)).toEqual(["EPCOT"]);
  });

  it("ski rule ignores roads and shops named 'ski'", () => {
    const r = rule("skiing");
    const out = matches(r, center, [
      at("Ski Road", "highway", "residential"),
      at("Ski & Surf", "shop", "sports"),
      at("Eldora Mountain Resort Ski", "leisure", "sports_centre"),
      at("Loveland", "landuse", "winter_sports"),
    ]);
    expect(out.map((p) => p.name)).toEqual(["Eldora Mountain Resort Ski", "Loveland"]);
  });

  it("hiking parks must look like a real park/forest", () => {
    const r = RULES.find((x) => x.tag === "hiking" && x.label.includes("park"))!;
    const out = matches(r, center, [
      at("Arapaho National Forest", "leisure", "nature_reserve"),
      at("Smith Neighborhood Park", "leisure", "park"),
      at("Lake Louisa State Park", "leisure", "nature_reserve"),
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

  it("kid-friendly skips splash pads, pools and aquatic centres", () => {
    const r = RULES.find((x) => x.tag === "zoo_aquarium")!;
    const out = matches(r, center, [
      at("Splash Pad", "leisure", "water_park"),
      at("Mesa Aquatic Complex", "leisure", "water_park"),
      at("Schoolyard Sprayground", "leisure", "water_park"),
      at("Golfland Sunsplash", "leisure", "water_park"),
      at("Honolulu Zoo", "tourism", "zoo"),
    ]);
    expect(out.map((p) => p.name)).toEqual(["Golfland Sunsplash", "Honolulu Zoo"]);
  });
});

describe("tagLocation", () => {
  it("applies tags with evidence, stops early, and requires min counts", async () => {
    const search = vi.fn(async (q: string) => {
      if (q === "beach") return [at("Cocoa Beach", "natural", "beach", 2)];
      if (q === "zoo") return [at("Cool Zoo", "tourism", "zoo", 5)];
      if (q === "trailhead") return [at("North Trailhead", "highway", "trailhead")]; // only 1, needs 2
      return [];
    });
    const tags = await tagLocation(center, search);
    expect(tags.beach).toEqual({ present: true, evidence: "beach within 3 mi: Cocoa Beach" });
    expect(tags.zoo_aquarium.present).toBe(true);
    expect(tags.hiking.present).toBe(false);
    expect(tags.skiing.present).toBe(false);
    // kid-friendly matched on "zoo", so "aquarium" and "water park" were never searched
    expect(search.mock.calls.map((c) => c[0])).not.toContain("aquarium");
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

  it("city means the listed city has 100k+ people", () => {
    expect(applyDerived(none(), { name: "Las Vegas", population: 653533 }).city).toEqual({
      present: true,
      evidence: "Las Vegas: population 653,533",
    });
    expect(applyDerived(none(), { name: "Kissimmee", population: 60894 }).city.present).toBe(false);
    expect(applyDerived(none(), { name: "Nowhere", population: null }).city).toEqual({ present: false, evidence: null });
  });
});

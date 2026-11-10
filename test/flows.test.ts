import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { listing, listingsUpload, property, propertyTag, type Db } from "@/lib/db";
import { ingestUpload } from "@/lib/ingest";
import { runGeocodeBatch } from "@/lib/geo/geocode-job";
import { getCurrentListings, getPropertiesWithCounts, getSettings } from "@/lib/queries";
import type { ParsedListing } from "@/lib/parser/types";
import { QuotaError } from "@/lib/geo/util";
import { useTestDb } from "./db";

vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ email: "me@example.com" }) }));
vi.mock("@/lib/storage", () => ({ getBlobStore: () => ({ put: async () => "mem://pdf" }) }));
vi.mock("@/lib/geo/nominatim", () => ({
  geocodeProperty: vi.fn(),
  geocodeText: vi.fn(),
  searchNear: vi.fn(),
  cityPopulation: vi.fn(async () => null),
}));
vi.mock("@/lib/geo/ors", async (orig) => ({ ...(await orig<object>()), driveRoute: vi.fn() }));

const nominatim = await import("@/lib/geo/nominatim");
const ors = await import("@/lib/geo/ors");
const geocodeProperty = vi.mocked(nominatim.geocodeProperty);
const geocodeText = vi.mocked(nominatim.geocodeText);
const searchNear = vi.mocked(nominatim.searchNear);
const driveRoute = vi.mocked(ors.driveRoute);

const { PATCH } = await import("@/app/api/properties/[id]/route");
const { PUT } = await import("@/app/api/settings/route");
const { POST: upload } = await import("@/app/api/upload/route");

function mk(inv: string, prop: string, city = "Fraser", state = "CO", price = 100): ParsedListing {
  return {
    inventoryNumber: inv,
    arrivalDate: "2026-12-01",
    checkoutDate: "2026-12-08",
    property: prop,
    city,
    state,
    countryCode: "USA",
    country: "United States",
    unitType: "2 Bedroom",
    priceUsd: price,
  };
}
const json = (body: unknown) => ({
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const patchProp = (id: number, body: unknown) =>
  PATCH(new Request("http://x", { ...json(body), method: "PATCH" }), { params: Promise.resolve({ id: String(id) }) });

let db: Db;
let close: () => Promise<void>;
beforeEach(async () => {
  ({ db, close } = await useTestDb());
  geocodeProperty.mockReset().mockResolvedValue({ lat: 39.9, lng: -105.8, source: "osm-venue" });
  driveRoute.mockReset().mockResolvedValue({ hours: 3, miles: 150 });
  geocodeText.mockReset();
  // every location has a beach and nothing else
  searchNear.mockReset().mockImplementation(async (q, c) =>
    q === "[natural=beach]" ? [{ name: "Test Beach", category: "natural", type: "beach", lat: c.lat, lng: c.lng }] : [],
  );
});
afterEach(() => close());

const props = () => db.select().from(property).orderBy(property.id);
const byName = async (name: string) => (await db.select().from(property).where(eq(property.name, name)))[0];

describe("second upload", () => {
  it("becomes the current list, reuses properties, and only queues new ones", async () => {
    await ingestUpload({ filename: "nov.pdf", blobUrl: "a", warnings: [], listings: [mk("100001", "Indian Peaks"), mk("100002", "Tahiti", "Las Vegas", "NV")] });
    await runGeocodeBatch();
    // manual override on an existing property
    const peaks = await byName("Indian Peaks");
    await patchProp(peaks.id, { lat: 1, lng: 2, driveHours: 9.5 });
    geocodeProperty.mockClear();
    driveRoute.mockClear();

    await ingestUpload({
      filename: "dec.pdf",
      blobUrl: "b",
      warnings: [],
      // same inventory number in a new upload is fine; one new property; name differs only by case/spacing
      listings: [mk("100001", "indian  peaks", "fraser"), mk("200001", "New Resort", "Moab", "UT")],
    });

    expect(await props()).toHaveLength(3);
    const { upload, rows } = await getCurrentListings();
    expect(upload?.filename).toBe("dec.pdf");
    expect(rows.map((r) => r.inventoryNumber).sort()).toEqual(["100001", "200001"]);
    expect((await byName("New Resort")).geocodeStatus).toBe("pending");

    const res = await runGeocodeBatch();
    // the new property, plus a re-tag of Indian Peaks because its location was edited
    expect(res).toMatchObject({ processed: 2, remaining: 0 });
    expect(geocodeProperty).toHaveBeenCalledTimes(1);
    const after = await byName("Indian Peaks");
    expect(after).toMatchObject({ lat: 1, lng: 2, driveHours: 9.5, latLngOverridden: true, driveOverridden: true });
    // history kept
    expect(await db.select().from(listingsUpload)).toHaveLength(2);
    expect(await db.select().from(listing)).toHaveLength(4);
  });
});

describe("geocode job", () => {
  it("marks drivable by max hours, unroutable as not drivable, and failures as failed", async () => {
    await ingestUpload({
      filename: "x.pdf",
      blobUrl: "a",
      warnings: [],
      listings: [mk("1", "Near"), mk("2", "Far", "Orlando", "FL"), mk("3", "Island", "Honolulu", "HI"), mk("4", "Nowhere", "Zzz", "ZZ")],
    });
    geocodeProperty.mockImplementation(async (p) =>
      p.name === "Nowhere" ? null : p.name === "Island" ? { lat: 21.3, lng: -157.8, source: "osm-venue" } : { lat: 30, lng: -90, source: "osm-city" },
    );
    driveRoute.mockImplementation(async (_o, to) => (to.lat === 21.3 ? null : { hours: 25, miles: 1800 }));
    driveRoute.mockResolvedValueOnce({ hours: 4, miles: 250 }); // "Near" is processed first

    expect(await runGeocodeBatch()).toMatchObject({ processed: 4, failed: 1, remaining: 0 });
    expect(await byName("Near")).toMatchObject({ isDrivable: true, driveHours: 4 });
    expect(await byName("Far")).toMatchObject({ isDrivable: false, driveHours: 25 });
    expect(await byName("Island")).toMatchObject({ isDrivable: false, driveHours: null, geocodeStatus: "ok" });
    expect(await byName("Nowhere")).toMatchObject({ geocodeStatus: "failed" });
  });

  it("skips routing outside North America", async () => {
    await ingestUpload({ filename: "x.pdf", blobUrl: "a", warnings: [], listings: [mk("1", "Alps", "Kaprun", "")] });
    geocodeProperty.mockResolvedValue({ lat: 47.3, lng: 12.7, source: "osm-city" });
    await runGeocodeBatch();
    expect(driveRoute).not.toHaveBeenCalled();
    expect(await byName("Alps")).toMatchObject({ isDrivable: false, geocodeStatus: "ok" });
  });

  it("stops on a rate/quota error and leaves the property pending", async () => {
    await ingestUpload({ filename: "x.pdf", blobUrl: "a", warnings: [], listings: [mk("1", "A"), mk("2", "B")] });
    geocodeProperty.mockRejectedValue(new QuotaError("Nominatim"));
    expect(await runGeocodeBatch()).toMatchObject({ quotaExceeded: true, processed: 0, remaining: 2 });
    expect((await props()).every((p) => p.geocodeStatus === "pending")).toBe(true);
  });
});

describe("property overrides", () => {
  beforeEach(async () => {
    await ingestUpload({ filename: "x.pdf", blobUrl: "a", warnings: [], listings: [mk("1", "Indian Peaks")] });
    await runGeocodeBatch();
  });

  it("manual lat/lng is kept when re-geocoding; routing still runs", async () => {
    const p = await byName("Indian Peaks");
    expect((await patchProp(p.id, { lat: 40, lng: -106 })).status).toBe(200);
    await db.update(property).set({ geocodeStatus: "pending" }); // simulate a re-run
    geocodeProperty.mockClear();
    driveRoute.mockResolvedValue({ hours: 2, miles: 100 });
    await runGeocodeBatch();
    expect(geocodeProperty).not.toHaveBeenCalled();
    expect(driveRoute).toHaveBeenLastCalledWith(expect.anything(), { lat: 40, lng: -106 });
    expect(await byName("Indian Peaks")).toMatchObject({ lat: 40, lng: -106, geocodeSource: "manual", driveHours: 2 });
  });

  it("manual drive hours set drivable and survive re-routing", async () => {
    const p = await byName("Indian Peaks");
    await patchProp(p.id, { driveHours: 20 });
    expect(await byName("Indian Peaks")).toMatchObject({ driveHours: 20, isDrivable: false, driveOverridden: true });
    await db.update(property).set({ geocodeStatus: "pending" });
    driveRoute.mockClear();
    await runGeocodeBatch();
    expect(driveRoute).not.toHaveBeenCalled();
    expect((await byName("Indian Peaks")).driveHours).toBe(20);
  });

  it("reset clears overrides and re-queues", async () => {
    const p = await byName("Indian Peaks");
    await patchProp(p.id, { lat: 1, lng: 1, driveHours: 1 });
    await patchProp(p.id, { resetOverrides: true });
    expect(await byName("Indian Peaks")).toMatchObject({
      latLngOverridden: false,
      driveOverridden: false,
      lat: null,
      geocodeStatus: "pending",
    });
  });

  it("rejects invalid input", async () => {
    const p = await byName("Indian Peaks");
    expect((await patchProp(p.id, { lat: 200 })).status).toBe(400);
  });
});

describe("settings", () => {
  beforeEach(async () => {
    await ingestUpload({ filename: "x.pdf", blobUrl: "a", warnings: [], listings: [mk("1", "Five"), mk("2", "Seven"), mk("3", "Manual")] });
    driveRoute.mockResolvedValueOnce({ hours: 5, miles: 300 }).mockResolvedValueOnce({ hours: 7, miles: 450 });
    await runGeocodeBatch();
    await patchProp((await byName("Manual")).id, { driveHours: 6 });
  });
  const put = async (body: object) => PUT(new Request("http://x", json({ ...(await getSettings()), ...body })));

  it("changing max drive hours recomputes drivable without re-routing", async () => {
    driveRoute.mockClear();
    expect((await put({ maxDriveHours: 6 })).status).toBe(200);
    expect(await byName("Five")).toMatchObject({ isDrivable: true });
    expect(await byName("Seven")).toMatchObject({ isDrivable: false });
    expect(await byName("Manual")).toMatchObject({ isDrivable: true });
    expect(driveRoute).not.toHaveBeenCalled();
    expect((await props()).every((p) => p.geocodeStatus === "ok")).toBe(true);
  });

  it("changing the origin re-queues routing for non-overridden properties only", async () => {
    geocodeText.mockResolvedValue({ lat: 39.74, lng: -104.99 });
    const res = await put({ originLabel: "Denver, CO" });
    expect(await res.json()).toMatchObject({ requeued: 2 });
    expect(await getSettings()).toMatchObject({ originLabel: "Denver, CO", originLat: 39.74 });
    expect((await byName("Manual")).geocodeStatus).toBe("ok");

    driveRoute.mockClear().mockResolvedValue({ hours: 1, miles: 60 });
    geocodeProperty.mockClear();
    await runGeocodeBatch();
    expect(geocodeProperty).not.toHaveBeenCalled(); // coordinates reused, only routing re-runs
    expect(driveRoute).toHaveBeenCalledTimes(2);
    expect(driveRoute.mock.calls[0][0]).toEqual({ lat: 39.74, lng: -104.99 });
    expect(await byName("Seven")).toMatchObject({ driveHours: 1, isDrivable: true });
  });

  it("explicit coordinates skip the lookup", async () => {
    await put({ originLabel: "Home", originLat: 38.9, originLng: -104.7 });
    expect(geocodeText).not.toHaveBeenCalled();
    expect(await getSettings()).toMatchObject({ originLabel: "Home", originLat: 38.9 });
  });

  it("returns 422 when the origin can't be found", async () => {
    geocodeText.mockResolvedValue(null);
    expect((await put({ originLabel: "Nowhereville" })).status).toBe(422);
  });
});

const dir = path.join(__dirname, "../fixtures");
const pdf = existsSync(dir) ? readdirSync(dir).find((f) => f.endsWith(".pdf")) : undefined;

describe.skipIf(!pdf)("upload route with the fixture PDF", () => {
  it("parses, stores, and re-upload does not duplicate properties", async () => {
    const send = () => {
      const fd = new FormData();
      fd.append("file", new File([readFileSync(path.join(dir, pdf!))], "nov.pdf", { type: "application/pdf" }));
      return upload(new Request("http://x", { method: "POST", body: fd }));
    };
    const first = await (await send()).json();
    expect(first.warnings).toEqual([]);
    expect(first.pending).toBeGreaterThan(50);
    const n = (await props()).length;
    const second = await (await send()).json();
    expect(second.rowCount).toBe(first.rowCount);
    expect(await props()).toHaveLength(n);
    expect((await getCurrentListings()).upload?.id).toBe(second.uploadId);
  });
});

describe("activity tags", () => {
  const tagsOf = async (name: string) => (await getPropertiesWithCounts()).find((p) => p.name === name)!;

  beforeEach(async () => {
    await ingestUpload({ filename: "x.pdf", blobUrl: "a", warnings: [], listings: [mk("1", "Resort"), mk("2", "Empty", "Moab", "UT")] });
  });

  it("auto-tags after geocoding and flags places with no tags", async () => {
    searchNear.mockImplementation(async (q, c) =>
      q === "[natural=beach]" && c.lat === 39.9 ? [{ name: "Test Beach", category: "natural", type: "beach", lat: c.lat, lng: c.lng }] : [],
    );
    geocodeProperty.mockImplementation(async (p) => ({ lat: p.name === "Resort" ? 39.9 : 38.5, lng: -105.8, source: "osm-city" }));
    expect(await runGeocodeBatch()).toMatchObject({ processed: 2, remaining: 0 });
    expect(await tagsOf("Resort")).toMatchObject({ tagStatus: "ok", tags: ["beach", "scenic"], untagged: false });
    expect(await tagsOf("Empty")).toMatchObject({ tagStatus: "ok", tags: [], untagged: true });
    const { rows } = await getCurrentListings();
    expect(rows.find((r) => r.property === "Resort")).toMatchObject({ tags: ["beach", "scenic"], untagged: false });
  });

  it("untagged until tagging runs; 'reviewed' clears the flag for places with no activities", async () => {
    expect((await tagsOf("Empty")).untagged).toBe(true);
    searchNear.mockResolvedValue([]);
    await runGeocodeBatch();
    const p = await tagsOf("Empty");
    expect(p.untagged).toBe(true);
    await patchProp(p.id, { tagsReviewed: true });
    expect((await tagsOf("Empty")).untagged).toBe(false);
  });

  it("manual tags win over auto tags and survive re-tagging; reset clears them", async () => {
    await runGeocodeBatch();
    const p = await tagsOf("Resort");
    await patchProp(p.id, { tags: { beach: false, scenic: false, skiing: true } });
    expect((await tagsOf("Resort")).tags).toEqual(["skiing"]);

    await db.update(property).set({ tagStatus: "pending" });
    await runGeocodeBatch();
    expect((await tagsOf("Resort")).tags).toEqual(["skiing"]);
    const beachRow = (await db.select().from(propertyTag).where(eq(propertyTag.propertyId, p.id))).find((r) => r.tag === "beach");
    expect(beachRow).toMatchObject({ osm: true, manual: false, osmEvidence: expect.stringContaining("Test Beach") });

    await patchProp(p.id, { resetTags: true });
    expect((await tagsOf("Resort")).tags).toEqual(["beach", "scenic"]);
  });

  it("moving a property (manual lat/lng) re-runs tagging at the new spot", async () => {
    await runGeocodeBatch();
    const p = await tagsOf("Resort");
    await patchProp(p.id, { lat: 10, lng: -80 });
    expect((await tagsOf("Resort")).tagStatus).toBe("pending");
    searchNear.mockClear();
    await runGeocodeBatch();
    expect(searchNear).toHaveBeenCalledWith("[natural=beach]", { lat: 10, lng: -80 }, 3);
  });

  it("a tagging failure is recorded without failing the location", async () => {
    searchNear.mockRejectedValue(new Error("Nominatim 500"));
    expect(await runGeocodeBatch()).toMatchObject({ failed: 2, remaining: 0 });
    expect(await tagsOf("Resort")).toMatchObject({ geocodeStatus: "ok", tagStatus: "failed", tagError: "Nominatim 500" });
  });

  it("settings store scoring weights and cost inputs", async () => {
    const cur = await getSettings();
    const res = await PUT(
      new Request("http://x", json({ ...cur, tickets: 5, costWeight: 0.5, tagWeights: { ...cur.tagWeights, skiing: 0 } })),
    );
    expect(res.status).toBe(200);
    expect(await getSettings()).toMatchObject({ tickets: 5, costWeight: 0.5, tagWeights: { skiing: 0, zoo_aquarium: 2 } });
    expect((await PUT(new Request("http://x", json({ ...cur, tickets: 0 })))).status).toBe(400);
  });
});

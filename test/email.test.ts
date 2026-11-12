import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { apiUsage, listingsUpload, property, settings, type Db } from "@/lib/db";
import type { ParsedListing } from "@/lib/parser/types";
import { QuotaError } from "@/lib/geo/util";
import { useTestDb } from "./db";

const afterCallbacks: (() => Promise<unknown>)[] = [];
vi.mock("next/server", async (orig) => ({
  ...(await orig<object>()),
  after: (fn: () => Promise<unknown>) => afterCallbacks.push(fn),
}));
vi.mock("@/lib/storage", () => ({ getBlobStore: () => ({ put: async () => "mem://pdf" }) }));
vi.mock("@/lib/parser/extract", () => ({ parsePdf: vi.fn() }));
vi.mock("@/lib/email/send", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/geo/nominatim", () => ({
  geocodeProperty: vi.fn(),
  geocodeText: vi.fn(),
  searchNear: vi.fn(async () => []),
  cityPopulation: vi.fn(async () => null),
}));
vi.mock("@/lib/geo/ors", async (orig) => ({ ...(await orig<object>()), driveRoute: vi.fn(), driveMatrix: vi.fn() }));
vi.mock("@/lib/geo/osrm", () => ({ osrmMatrix: vi.fn(), osrmRoute: vi.fn() }));
vi.mock("@/lib/flights/serpapi", async (orig) => ({ ...(await orig<object>()), searchFares: vi.fn() }));

const parsePdf = vi.mocked((await import("@/lib/parser/extract")).parsePdf);
const sendEmail = vi.mocked((await import("@/lib/email/send")).sendEmail);
const geocodeProperty = vi.mocked((await import("@/lib/geo/nominatim")).geocodeProperty);
const ors = await import("@/lib/geo/ors");
const driveRoute = vi.mocked(ors.driveRoute);
const driveMatrix = vi.mocked(ors.driveMatrix);
const searchFares = vi.mocked((await import("@/lib/flights/serpapi")).searchFares);
const { POST: ingestEmail } = await import("@/app/api/ingest/email/route");
const { GET: cron } = await import("@/app/api/cron/process/route");
const { processPending, DIGEST_GIVE_UP_MS } = await import("@/lib/pipeline");
const { importPdf } = await import("@/lib/ingest");
const { getSettings } = await import("@/lib/queries");

const SECRET = "test-email-secret";
const mk = (inv: string, prop: string, city: string, state: string, price = 1000): ParsedListing => ({
  inventoryNumber: inv,
  arrivalDate: "2030-03-02",
  checkoutDate: "2030-03-09",
  property: prop,
  city,
  state,
  countryCode: "USA",
  country: "United States",
  unitType: "1 Bedroom",
  priceUsd: price,
});
const LISTINGS = [mk("1", "Near", "Fraser", "CO", 900), mk("2", "Resort", "Orlando", "FL", 700)];
const post = (body: Uint8Array, auth = `Bearer ${SECRET}`) =>
  ingestEmail(
    new Request("http://x/api/ingest/email", {
      method: "POST",
      headers: { Authorization: auth, "X-Filename": encodeURIComponent("Dec Availability.pdf") },
      body: body as BodyInit,
    }),
  );
const pdf = (s = "pdf-1") => new TextEncoder().encode(s);

let db: Db;
let close: () => Promise<void>;
beforeEach(async () => {
  ({ db, close } = await useTestDb());
  process.env.EMAIL_SECRET = SECRET;
  process.env.CRON_SECRET = "test-cron-secret";
  process.env.APP_URL = "https://trips.example";
  afterCallbacks.length = 0;
  parsePdf.mockReset().mockResolvedValue({ listings: LISTINGS, warnings: [] });
  sendEmail.mockReset().mockResolvedValue(undefined);
  geocodeProperty
    .mockReset()
    .mockImplementation(async (p) => (p.name === "Near" ? { lat: 39.9, lng: -105.8, source: "osm-city" } : { lat: 28.4, lng: -81.4, source: "osm-city" }));
  driveRoute.mockReset().mockImplementation(async (_o, to) => (to.lat > 39 ? { hours: 2, miles: 90 } : { hours: 27, miles: 1800 }));
  driveMatrix.mockReset().mockImplementation(async (_from, to) => to.map((_, i) => ({ hours: (i + 1) / 2, miles: (i + 1) * 30 })));
  searchFares.mockReset().mockImplementation(async (q) => ({
    status: "ok",
    searchUrl: "https://g/flights",
    options: [{ origin: "COS", iata: q.airports[0], priceUsd: 600, airline: "United", stops: 0, durationMin: 200 }],
  }));
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}")); // self-continuation
});
afterEach(async () => {
  vi.restoreAllMocks();
  await close();
});
const uploads = () => db.select().from(listingsUpload).orderBy(listingsUpload.id);

describe("email ingest webhook", () => {
  it("rejects a wrong or missing secret", async () => {
    expect((await post(pdf(), "Bearer nope")).status).toBe(401);
    expect((await post(pdf(), "")).status).toBe(401);
    delete process.env.EMAIL_SECRET; // unset secret never matches
    expect((await post(pdf(), "Bearer ")).status).toBe(401);
    expect(await uploads()).toHaveLength(0);
  });

  it("imports the PDF as an email upload, then processes, prices and emails the top picks once", async () => {
    const res = await post(pdf());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok", rowCount: 2 });
    const [u] = await uploads();
    expect(u).toMatchObject({ source: "email", filename: "Dec Availability.pdf", digestSentAt: null });
    expect(u.contentHash).toMatch(/^[0-9a-f]{64}$/);

    // the response went out before processing; run the background work
    expect(afterCallbacks).toHaveLength(1);
    await afterCallbacks[0]();
    expect((await db.select().from(property)).every((p) => p.geocodeStatus === "ok")).toBe(true);
    expect(searchFares).toHaveBeenCalledTimes(1); // 1 search fits in the monthly cap -> auto-priced
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const mail = sendEmail.mock.calls[0][0];
    expect(mail.subject).toMatch(/^Trip Finder: top 2 picks \d{1,2}\/\d{1,2}\/\d{4}$/); // no date in the name: import day
    expect(mail.text).toContain("Resort (Orlando, FL, United States)");
    expect(mail.text).toContain("United");
    expect(mail.html).toContain("https://trips.example");
    expect((await uploads())[0].digestSentAt).not.toBeNull();

    // later runs (cron) don't send it again
    expect(await processPending(60_000)).toMatchObject({ digest: "already-sent", moreWork: false });
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("skips a re-sent copy of the same PDF", async () => {
    await post(pdf());
    const again = await post(pdf());
    expect(await again.json()).toMatchObject({ status: "duplicate" });
    expect(await uploads()).toHaveLength(1);
    await post(pdf("a different month"));
    expect(await uploads()).toHaveLength(2);
  });

  it("answers 422 when the PDF has no listings", async () => {
    parsePdf.mockResolvedValue({ listings: [], warnings: [] });
    expect((await post(pdf())).status).toBe(422);
    expect(await uploads()).toHaveLength(0);
  });
});

describe("background pipeline", () => {
  it("doesn't spend searches when this month's plan can't cover them all, and says so in the email", async () => {
    await importPdf({ filename: "dec.pdf", bytes: pdf(), source: "email" });
    await getSettings(); // creates the settings row
    await db.update(settings).set({ serpapiMonthlyCap: 10 });
    await db.insert(apiUsage).values({ service: "serpapi", month: new Date().toISOString().slice(0, 7), count: 10 });
    const r = await processPending(60_000);
    expect(r).toMatchObject({ autoPrice: "skipped-not-enough-searches", fareRemaining: 1, digest: "sent", moreWork: false });
    expect(searchFares).not.toHaveBeenCalled();
    expect(sendEmail.mock.calls[0][0].text).toContain("Flights aren't priced yet");
  });

  it("waits for locations before emailing, and gives up waiting after a day and a half", async () => {
    await importPdf({ filename: "dec.pdf", bytes: pdf(), source: "email" });
    driveRoute.mockRejectedValue(new QuotaError("openrouteservice")); // ORS out for the day
    vi.mocked((await import("@/lib/geo/osrm")).osrmRoute).mockRejectedValue(new QuotaError("osrm"));
    const r = await processPending(60_000);
    expect(r).toMatchObject({ digest: "waiting", moreWork: true });
    expect(sendEmail).not.toHaveBeenCalled();

    await db.update(listingsUpload).set({ uploadedAt: new Date(Date.now() - DIGEST_GIVE_UP_MS - 1000) });
    expect(await processPending(60_000)).toMatchObject({ digest: "sent" });
    expect(sendEmail.mock.calls[0][0].text).toMatch(/still being located/);
  });

  it("never emails for uploads made on the upload page", async () => {
    await importPdf({ filename: "dec.pdf", bytes: pdf(), source: "upload" });
    expect(await processPending(60_000)).toMatchObject({ digest: "not-email", geocodeRemaining: 0 });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("a failed send is retried by the next run", async () => {
    await importPdf({ filename: "dec.pdf", bytes: pdf(), source: "email" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    sendEmail.mockRejectedValueOnce(new Error("worker down"));
    expect(await processPending(60_000)).toMatchObject({ digest: "failed" });
    expect((await uploads())[0].digestSentAt).toBeNull();
    expect(await processPending(60_000)).toMatchObject({ digest: "sent" });
  });
});

describe("cron route", () => {
  it("requires the cron secret", async () => {
    const res = await cron(new Request("http://x/api/cron/process", { headers: { Authorization: "Bearer wrong" } }));
    expect(res.status).toBe(401);
  });

  it("resumes processing", async () => {
    await importPdf({ filename: "dec.pdf", bytes: pdf(), source: "email" });
    const res = await cron(new Request("http://x/api/cron/process", { headers: { Authorization: "Bearer test-cron-secret" } }));
    expect(await res.json()).toMatchObject({ geocodeRemaining: 0, fareRemaining: 0, digest: "sent" });
    expect((await db.select().from(property).where(eq(property.name, "Resort")))[0].airportStatus).toBe("ok");
  });
});

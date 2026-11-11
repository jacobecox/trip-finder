import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { settings, userPrefs, type Db } from "@/lib/db";
import { useTestDb } from "./db";

const who = { email: "family@example.com", admin: false };
vi.mock("@/lib/auth", () => ({
  requireUser: async () => ({ email: who.email }),
  isAdminEmail: (e?: string | null) => who.admin && e === who.email,
}));

const { PUT, DELETE } = await import("@/app/api/prefs/route");
const { getEffectiveSettings, applyPrefs } = await import("@/lib/prefs");
const { getSettings } = await import("@/lib/queries");

const body = (over: object = {}) => ({
  tickets: 3,
  costWeight: 0.75,
  activityWeight: 0.25,
  tagWeights: { beach: 2, theme_park: 2, zoo_aquarium: 2, hiking: 1, skiing: 1, scenic: 1, city: 0 },
  mpg: 25,
  gasPriceUsd: 3.5,
  flightBaseUsd: 120,
  flightPerMileUsd: 0.1,
  ...over,
});
const put = (b: object) => PUT(new Request("http://x/api/prefs", { method: "PUT", body: JSON.stringify(b) }));

let db: Db;
let close: () => Promise<void>;
beforeEach(async () => {
  ({ db, close } = await useTestDb());
  who.email = "family@example.com";
  who.admin = false;
  await getSettings();
});
afterEach(() => close());

describe("personal settings", () => {
  it("a family member's 1 ticket changes only their view, and only the changed values are stored", async () => {
    const res = await put(body({ tickets: 1, tagWeights: { ...body().tagWeights, skiing: 5 } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ tickets: 1, mpg: 25 });
    const [row] = await db.select().from(userPrefs);
    expect(row).toMatchObject({ email: "family@example.com", prefs: { tickets: 1, tagWeights: { skiing: 5 } } });

    expect((await getEffectiveSettings("family@example.com")).settings).toMatchObject({ tickets: 1 });
    expect((await getEffectiveSettings("someone@example.com")).settings.tickets).toBe(3);
    expect((await getSettings()).tickets).toBe(3);
  });

  it("values they didn't change follow later shared changes", async () => {
    await put(body({ tickets: 1 }));
    await db.update(settings).set({ gasPriceUsd: 4.2 });
    expect((await getEffectiveSettings("family@example.com")).settings).toMatchObject({ tickets: 1, gasPriceUsd: 4.2 });
  });

  it("reset goes back to the shared defaults", async () => {
    await put(body({ tickets: 1 }));
    expect((await DELETE()).status).toBe(200);
    expect(await db.select().from(userPrefs)).toHaveLength(0);
    expect((await getEffectiveSettings("family@example.com")).personalized).toBe(false);
  });

  it("rejects bad input, and the admin edits the shared settings instead", async () => {
    expect((await put(body({ tickets: 0 }))).status).toBe(400);
    who.email = "admin@example.com";
    who.admin = true;
    expect((await put(body({ tickets: 1 }))).status).toBe(400);
  });

  it("applyPrefs merges tag weights and ignores missing keys", async () => {
    const s = await getSettings();
    const out = applyPrefs(s, { tagWeights: { city: 3 } });
    expect(out.tagWeights).toMatchObject({ city: 3, beach: s.tagWeights.beach });
    expect(out.tickets).toBe(s.tickets);
  });
});

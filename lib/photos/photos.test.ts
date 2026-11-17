import { describe, expect, it } from "vitest";
import { photoOf } from "./ref";

describe("photoOf", () => {
  const base = {
    propertyId: 7,
    photoStatus: "google",
    photoIndex: 2,
    photoUrl: "https://blob/x.jpg",
    photoCredit: "Pono Kai Resort",
    photoCreditUrl: "https://maps.google.com/contrib/1",
  };
  it("serves kept Google photos through our route, with the index so a new pick isn't cached", () => {
    const v = photoOf(base)!.src;
    expect(v).toMatch(/^\/api\/photo\/7\?v=\w+$/);
    expect(photoOf({ ...base, photoUrl: "https://blob/y.jpg" })!.src).not.toBe(v); // a new pick gets a new address
    expect(photoOf(base)).toEqual({ kind: "google", src: v, credit: "Pono Kai Resort", creditUrl: "https://maps.google.com/contrib/1" });
  });
  it("shows nothing when hidden, none or missing; keeps showing while waiting for a re-pick", () => {
    expect(photoOf({ ...base, photoStatus: "hidden" })).toBeNull();
    expect(photoOf({ ...base, photoStatus: "none", photoUrl: null })).toBeNull();
    expect(photoOf({ ...base, photoUrl: null })).toBeNull();
    expect(photoOf({ ...base, photoStatus: "pending" })?.kind).toBe("google");
  });
});

describe("choosePhoto", () => {
  it("takes the first photo when there's no Claude key, and nothing when there are no photos", async () => {
    const { choosePhoto } = await import("./pick");
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    expect(await choosePhoto("X", [{ type: "image/jpeg", bytes: new Uint8Array() }])).toEqual({ index: 0, rating: "ok", showsProperty: true });
    expect(await choosePhoto("X", [])).toBeNull();
    if (saved) process.env.ANTHROPIC_API_KEY = saved;
  });
});

describe("mediaType", () => {
  it("reads the format from the bytes, not the label", async () => {
    const { mediaType } = await import("./pick");
    expect(mediaType({ type: "image/jpeg", bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) })).toBe("image/png");
    expect(mediaType({ type: "image/png", bytes: new Uint8Array([0xff, 0xd8, 0xff]) })).toBe("image/jpeg");
  });
});

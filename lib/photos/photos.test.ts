import { describe, expect, it } from "vitest";
import { photoOf } from "./ref";
import { sized } from "./wiki";

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
    expect(photoOf(base)).toEqual({ kind: "google", src: "/api/photo/7?v=2", credit: "Pono Kai Resort", creditUrl: "https://maps.google.com/contrib/1" });
  });
  it("links Wikipedia photos directly, and shows nothing when hidden or missing", () => {
    expect(photoOf({ ...base, photoStatus: "wiki", photoUrl: "https://upload.wikimedia.org/a.jpg", photoCreditUrl: "https://en.wikipedia.org/wiki/A" })).toEqual({
      kind: "wiki",
      src: "https://upload.wikimedia.org/a.jpg",
      credit: "Wikipedia",
      creditUrl: "https://en.wikipedia.org/wiki/A",
    });
    expect(photoOf({ ...base, photoStatus: "hidden" })).toBeNull();
    expect(photoOf({ ...base, photoStatus: "pending", photoUrl: null })).toBeNull();
    expect(photoOf({ ...base, photoUrl: null })).toBeNull();
  });
});

describe("Wikipedia image size", () => {
  const thumb = "https://upload.wikimedia.org/wikipedia/commons/thumb/3/33/BBV_Summer_2019_-33.jpg/330px-BBV_Summer_2019_-33.jpg?utm_source=x";
  it("asks for the 960px version", () => {
    expect(sized(thumb, { source: "https://upload.wikimedia.org/o.jpg", width: 4000 })).toBe(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/3/33/BBV_Summer_2019_-33.jpg/960px-BBV_Summer_2019_-33.jpg",
    );
  });
  it("uses a small original as is", () => {
    expect(sized(thumb, { source: "https://upload.wikimedia.org/o.jpg?x=1", width: 640 })).toBe("https://upload.wikimedia.org/o.jpg");
  });
  it("skips maps and flags", () => {
    expect(sized("https://upload.wikimedia.org/thumb/Map_of_Florida_highlighting_Lee_County.svg/330px-x.png")).toBeNull();
    expect(sized("https://upload.wikimedia.org/thumb/Flag_of_Austria.png/330px-Flag_of_Austria.png")).toBeNull();
  });
});

describe("choosePhoto", () => {
  it("takes the first photo when there's no Claude key, and nothing when there are no photos", async () => {
    const { choosePhoto } = await import("./pick");
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    expect(await choosePhoto("X", [{ type: "image/jpeg", bytes: new Uint8Array() }])).toEqual({ index: 0, showsProperty: true });
    expect(await choosePhoto("X", [])).toBeNull();
    if (saved) process.env.ANTHROPIC_API_KEY = saved;
  });
});

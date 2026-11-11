import { describe, expect, it } from "vitest";
import { decide, parseList, safeEqual } from "./logic";

const me = "me@gmail.com";
const allowed = parseList(` ${me.toUpperCase()} , `);
const pdf = (size: number, filename = "avail.pdf") => ({ filename, mimeType: "application/pdf", size });

describe("decide", () => {
  it("imports the largest PDF from an allowed sender (Gmail auto-forward keeps you as the envelope sender)", () => {
    expect(
      decide({ envelopeFrom: me, headerFrom: "inventory@exchange.example", attachments: [pdf(10, "flyer.pdf"), { filename: "logo.png", mimeType: "image/png", size: 99 }, pdf(500)] }, allowed),
    ).toEqual({ action: "ingest", index: 2 });
  });
  it("accepts a PDF by file name when the MIME type is generic", () => {
    expect(decide({ envelopeFrom: me, attachments: [{ filename: "X.PDF", mimeType: "application/octet-stream", size: 5 }] }, allowed)).toEqual({ action: "ingest", index: 0 });
  });
  it("notifies when an allowed email has no PDF", () => {
    expect(decide({ envelopeFrom: me, attachments: [] }, allowed)).toMatchObject({ action: "notify" });
  });
  it("forwards Gmail's forwarding confirmation, rejects strangers", () => {
    expect(decide({ envelopeFrom: "forwarding-noreply@google.com", attachments: [] }, allowed)).toEqual({ action: "forward" });
    expect(decide({ envelopeFrom: "spam@x.example", attachments: [pdf(5)] }, allowed)).toMatchObject({ action: "reject" });
    expect(decide({ envelopeFrom: "spam@x.example", attachments: [pdf(5)] }, [])).toMatchObject({ action: "reject" });
  });
});

describe("safeEqual", () => {
  it("compares exactly and never matches an empty secret", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abd", "abc")).toBe(false);
    expect(safeEqual("ab", "abc")).toBe(false);
    expect(safeEqual("", "")).toBe(false);
  });
});

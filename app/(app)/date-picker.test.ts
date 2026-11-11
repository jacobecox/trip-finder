import { describe, expect, it } from "vitest";
import { overlaps, stayDayCounts } from "./date-picker";

const stay = { arrivalDate: "2027-04-28", checkoutDate: "2027-05-05" };
const may = { from: "2027-05-01", to: "2027-05-31" };

describe("overlaps", () => {
  it("matches stays with any day inside the range", () => {
    expect(overlaps(stay, may)).toBe(true); // starts in April, ends in May
    expect(overlaps({ arrivalDate: "2027-05-29", checkoutDate: "2027-06-05" }, may)).toBe(true);
    expect(overlaps({ arrivalDate: "2027-04-20", checkoutDate: "2027-04-27" }, may)).toBe(false);
    expect(overlaps({ arrivalDate: "2027-04-24", checkoutDate: "2027-05-01" }, may)).toBe(false); // only checks out May 1
    expect(overlaps({ arrivalDate: "2027-06-01", checkoutDate: "2027-06-08" }, may)).toBe(false);
  });
  it("empty range matches everything", () => {
    expect(overlaps(stay, { from: "", to: "" })).toBe(true);
  });
});

describe("stayDayCounts", () => {
  it("counts nights (check-in up to the day before check-out), across months", () => {
    const c = stayDayCounts([stay, { arrivalDate: "2027-05-05", checkoutDate: "2027-05-06" }]);
    expect(c.get("2027-04-28")).toBe(1);
    expect(c.get("2027-05-04")).toBe(1);
    expect(c.get("2027-05-05")).toBe(1); // checkout of the first, night of the second
    expect(c.get("2027-05-06")).toBeUndefined();
    expect(c.size).toBe(8);
  });
});

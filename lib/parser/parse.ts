import type { ParsedListing, ParseResult, ParseWarning, TextItem, UnitType } from "./types";
import { UNIT_TYPES } from "./types";

const COLS = [
  "inventoryNumber",
  "arrival",
  "daysBefore",
  "property",
  "city",
  "state",
  "countryCode",
  "country",
  "unitType",
  "price",
] as const;
type Col = (typeof COLS)[number];

const Y_TOL = 2;
const X_TOL = 6; // cells may start slightly left of their header (e.g. "$" in Price)
const STAY_NIGHTS = 7;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function groupRows(items: TextItem[]): TextItem[][] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: TextItem[][] = [];
  for (const it of sorted) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(last[0].y - it.y) <= Y_TOL) last.push(it);
    else rows.push([it]);
  }
  return rows.map((r) => r.sort((a, b) => a.x - b.x));
}

/** Header column left edges: distinct x of header items (everything above the first data row). */
function headerStarts(rows: TextItem[][]): { starts: number[]; firstDataIdx: number } | null {
  const firstDataIdx = rows.findIndex((r) => /^\d{6}$/.test(r.find((i) => i.str.trim())?.str.trim() ?? ""));
  if (firstDataIdx < 0) return null;
  const xs: number[] = [];
  for (const row of rows.slice(0, firstDataIdx))
    for (const it of row)
      // skip the disclaimer line, which sits above the column headers
      if (it.str.trim() && it.str.length <= 25 && !it.str.startsWith("*") && !xs.some((x) => Math.abs(x - it.x) < 1)) xs.push(it.x);
  xs.sort((a, b) => a - b);
  return xs.length === COLS.length ? { starts: xs, firstDataIdx } : null;
}

function bucket(row: TextItem[], starts: number[]): Record<Col, string> {
  const cells = Object.fromEntries(COLS.map((c) => [c, ""])) as Record<Col, string>;
  for (const it of row) {
    let idx = 0;
    for (let i = 0; i < starts.length; i++) if (it.x >= starts[i] - X_TOL) idx = i;
    cells[COLS[idx]] += it.str;
  }
  for (const c of COLS) cells[c] = cells[c].replace(/\s+/g, " ").trim();
  return cells;
}

export function parseArrival(s: string): { arrival: string; checkout: string } | null {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{2})$/.exec(s);
  if (!m) return null;
  const mon = MONTHS.indexOf(m[2].toLowerCase());
  if (mon < 0) return null;
  const year = 2000 + Number(m[3]);
  const day = Number(m[1]);
  const d = new Date(Date.UTC(year, mon, day));
  if (d.getUTCMonth() !== mon || d.getUTCDate() !== day) return null;
  const out = new Date(d.getTime() + STAY_NIGHTS * 86_400_000);
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  return { arrival: iso(d), checkout: iso(out) };
}

/** Pure: takes text items per page (PDF coordinates, y up) and returns listings + warnings. */
export function parseListings(pages: TextItem[][]): ParseResult {
  const listings: ParsedListing[] = [];
  const warnings: ParseWarning[] = [];
  const seen = new Set<string>();

  pages.forEach((items, pi) => {
    const page = pi + 1;
    const rows = groupRows(items.filter((i) => i.str.length > 0));
    const hdr = headerStarts(rows);
    if (!hdr) {
      if (rows.some((r) => r.some((i) => i.str.trim())))
        warnings.push({ page, row: 0, message: "No table header/data rows found on page" });
      return;
    }
    let n = 0;
    for (const row of rows.slice(hdr.firstDataIdx)) {
      const text = row.map((i) => i.str).join("").trim();
      if (!text || /^Prepared By/i.test(text)) continue;
      const c = bucket(row, hdr.starts);
      // skip non-table lines (e.g. footer/disclaimer): no inventory number and no date/price
      if (!/^\d+$/.test(c.inventoryNumber) && !c.arrival && !c.price) continue;
      n++;
      const problems: string[] = [];
      if (!/^\d{6}$/.test(c.inventoryNumber)) problems.push(`invalid inventory number "${c.inventoryNumber}"`);
      else if (seen.has(c.inventoryNumber)) problems.push("duplicate inventory number");
      const dates = parseArrival(c.arrival);
      if (!dates) problems.push(`invalid arrival date "${c.arrival}"`);
      const pm = /^\$?\s*([\d,]+(?:\.\d+)?)$/.exec(c.price);
      const price = pm ? Number(pm[1].replace(/,/g, "")) : NaN;
      if (!(price > 0)) problems.push(`invalid price "${c.price}"`);
      if (!(UNIT_TYPES as readonly string[]).includes(c.unitType)) problems.push(`unknown unit type "${c.unitType}"`);
      // state may be blank outside US/CA (e.g. UK)
      for (const k of ["property", "city", "countryCode", "country"] as const)
        if (!c[k]) problems.push(`missing ${k}`);
      if (problems.length || !dates) {
        warnings.push({ page, row: n, inventoryNumber: c.inventoryNumber || undefined, message: problems.join("; ") });
        continue;
      }
      seen.add(c.inventoryNumber);
      listings.push({
        inventoryNumber: c.inventoryNumber,
        arrivalDate: dates.arrival,
        checkoutDate: dates.checkout,
        property: c.property,
        city: c.city,
        state: c.state,
        countryCode: c.countryCode,
        country: c.country,
        unitType: c.unitType as UnitType,
        priceUsd: price,
      });
    }
  });
  return { listings, warnings };
}

import { TAGS, type Tag } from "@/lib/tags/constants";
import type { DateRange } from "./date-picker";
import type { Sort, SortKey } from "./trip-table";

/**
 * Filters and sort live in the address (?tag=beach&from=2026-12-01&sort=totalUsd), so going back
 * from a trip page restores them and a filtered view can be shared. Defaults are left out.
 */
export interface Filters {
  tickets: string;
  flyFrom: string;
  dates: DateRange;
  tag: Tag | "";
  unit: string;
  country: string;
  state: string;
  drivableOnly: boolean;
  newOnly: boolean;
  dropsOnly: boolean;
}

const SORT_KEYS: SortKey[] = [
  "score",
  "totalUsd",
  "arrivalDate",
  "property",
  "location",
  "unitType",
  "priceUsd",
  "travelUsd",
  "driveHours",
  "distanceMiles",
];
/** sessionStorage key holding the list's last address, for the trip page's "All trips" link. */
export const LIST_KEY = "trip-finder:list";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function toQuery(f: Filters, sort: Sort, defaults: { filters: Filters; sort: Sort }) {
  const d = defaults.filters;
  const q = new URLSearchParams();
  if (f.tag) q.set("tag", f.tag);
  if (f.dates.from) q.set("from", f.dates.from);
  if (f.dates.to) q.set("to", f.dates.to);
  if (f.drivableOnly) q.set("drive", "1");
  if (f.newOnly) q.set("new", "1");
  if (f.dropsOnly) q.set("drop", "1");
  if (f.flyFrom !== d.flyFrom) q.set("fly", f.flyFrom);
  if (f.tickets !== d.tickets) q.set("tickets", f.tickets);
  if (f.unit) q.set("unit", f.unit);
  if (f.country) q.set("country", f.country);
  if (f.state) q.set("state", f.state);
  if (sort.key !== defaults.sort.key || sort.dir !== defaults.sort.dir)
    q.set("sort", `${sort.key}${sort.dir === 1 ? "" : "-desc"}`);
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function fromQuery(
  q: Record<string, string | string[] | undefined>,
  defaults: { filters: Filters; sort: Sort },
): { filters: Filters; sort: Sort } {
  const get = (k: string) => {
    const v = q[k];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  const tag = get("tag");
  const date = (k: string) => (ISO.test(get(k)) ? get(k) : "");
  const [key, desc] = get("sort").split("-");
  const tickets = Number(get("tickets"));
  return {
    filters: {
      ...defaults.filters,
      tag: (TAGS as readonly string[]).includes(tag) ? (tag as Tag) : "",
      dates: { from: date("from"), to: date("to") },
      drivableOnly: get("drive") === "1",
      newOnly: get("new") === "1",
      dropsOnly: get("drop") === "1",
      flyFrom: get("fly") || defaults.filters.flyFrom,
      tickets: Number.isInteger(tickets) && tickets >= 1 && tickets <= 20 ? String(tickets) : defaults.filters.tickets,
      unit: get("unit"),
      country: get("country"),
      state: get("state"),
    },
    sort: SORT_KEYS.includes(key as SortKey) ? { key: key as SortKey, dir: desc === "desc" ? -1 : 1 } : defaults.sort,
  };
}

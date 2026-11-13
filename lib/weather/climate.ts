import type { ClimateStats } from "@/lib/db/schema";

/**
 * Typical weather for a stay: its calendar dates in each of the last YEARS years, from the
 * Open-Meteo historical archive (free, no key). Only the stay's own days are requested, because
 * the free plan weighs calls by days of data: ~1 call per location per year for a week-long stay,
 * where a full 10-year history would be ~260 per resort.
 */
export const YEARS = 10;
const BASE = "https://archive-api.open-meteo.com/v1/archive";
const USER_AGENT = "trip-finder/0.1 (personal project)";
const DAILY = "temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum,cloud_cover_mean";
export const MAX_LOCATIONS = 25; // per request

export class RateLimitError extends Error {}

/** Last YEARS complete years, e.g. [2016 … 2025] in 2026. */
export function climateYears(now = new Date()) {
  const last = now.getUTCFullYear() - 1;
  return Array.from({ length: YEARS }, (_, i) => last - YEARS + 1 + i);
}

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** The stay's nights moved to `year` (Feb 29 becomes Feb 28; a stay over New Year runs into the next year). */
export function windowIn(year: number, startMd: string, nights: number) {
  const md = startMd === "02-29" ? "02-28" : startMd;
  const start = Date.parse(`${year}-${md}T00:00:00Z`);
  return { start: iso(start), end: iso(start + (Math.max(1, nights) - 1) * DAY) };
}

export interface Place {
  lat: number;
  lng: number;
}

export interface DailyRows {
  high: (number | null)[];
  low: (number | null)[];
  precipMm: (number | null)[];
  snowCm: (number | null)[];
  cloud: (number | null)[];
}

/** One request: these places over one date range. Returns rows in the same order as `places`. */
export async function fetchDaily(places: Place[], range: { start: string; end: string }): Promise<DailyRows[]> {
  const qs = new URLSearchParams({
    latitude: places.map((p) => p.lat.toFixed(3)).join(","),
    longitude: places.map((p) => p.lng.toFixed(3)).join(","),
    start_date: range.start,
    end_date: range.end,
    daily: DAILY,
    temperature_unit: "fahrenheit",
    timezone: "auto",
  });
  const res = await fetch(`${BASE}?${qs}`, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(30_000) });
  if (res.status === 429) throw new RateLimitError("Open-Meteo rate limit");
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  const list = (Array.isArray(body) ? body : [body]) as { daily: Record<string, (number | null)[]> }[];
  return list.map(({ daily: d }) => ({
    high: d.temperature_2m_max,
    low: d.temperature_2m_min,
    precipMm: d.precipitation_sum,
    snowCm: d.snowfall_sum,
    cloud: d.cloud_cover_mean,
  }));
}

/** Averages every day of every year into one summary; null when there's no data at all. */
export function summarize(rows: DailyRows[], years: number[]): ClimateStats | null {
  let n = 0;
  const sum = { high: 0, low: 0, rain: 0, snow: 0, cloud: 0 };
  for (const r of rows)
    for (let i = 0; i < r.high.length; i++) {
      const [hi, lo, p, s, c] = [r.high[i], r.low[i], r.precipMm[i], r.snowCm[i], r.cloud[i]];
      if (hi == null || lo == null) continue;
      n++;
      sum.high += hi;
      sum.low += lo;
      sum.rain += (p ?? 0) >= 1 ? 1 : 0;
      sum.snow += (s ?? 0) >= 1 ? 1 : 0;
      sum.cloud += c ?? 0;
    }
  if (!n) return null;
  const r1 = (x: number) => Math.round(x * 10) / 10;
  return {
    highF: r1(sum.high / n),
    lowF: r1(sum.low / n),
    rainFrac: Math.round((sum.rain / n) * 100) / 100,
    snowFrac: Math.round((sum.snow / n) * 100) / 100,
    cloudPct: Math.round(sum.cloud / n),
    days: n,
    years: `${years[0]}–${years[years.length - 1]}`,
  };
}

export type Sky = "snowy" | "rainy" | "sunny" | "partly" | "cloudy";
export const SKY: Record<Sky, { emoji: string; label: string }> = {
  snowy: { emoji: "❄️", label: "Snowy" },
  rainy: { emoji: "🌧", label: "Rainy" },
  sunny: { emoji: "☀️", label: "Sunny" },
  partly: { emoji: "⛅", label: "Partly cloudy" },
  cloudy: { emoji: "☁️", label: "Cloudy" },
};

/**
 * What the sky is usually like: snow or rain on enough days wins, otherwise cloud cover decides.
 * Tuned on the 11/10 list: precipitation includes snow, so snow is checked first and needs fewer
 * days (Tahoe in January); ERA5 cloud cover counts thin high cloud, so "sunny" allows up to 45%.
 */
export function skyOf(c: Pick<ClimateStats, "snowFrac" | "rainFrac" | "cloudPct">): Sky {
  if (c.snowFrac >= 0.15) return "snowy";
  if (rainOnly(c) >= 0.45) return "rainy";
  if (c.cloudPct < 45) return "sunny";
  if (c.cloudPct < 65) return "partly";
  return "cloudy";
}

/** Share of days with rain, not snow (the precipitation total counts snow too). */
export const rainOnly = (c: Pick<ClimateStats, "rainFrac" | "snowFrac">) => Math.max(0, c.rainFrac - c.snowFrac);

/** "about 2 of 7 days" */
export const daysOf = (frac: number, nights: number) => Math.round(frac * nights);

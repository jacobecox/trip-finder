import type { ClimateStats } from "@/lib/db/schema";
import { MAX_LOCATIONS, summarize, type DailyRows } from "./climate";

/**
 * Real forecasts for stays that start within the forecast range (Open-Meteo, 16 days, free, no key).
 * Fetched when the page renders and cached for a few hours (forecasts update a few times a day),
 * so nothing is stored. One request covers up to 25 resorts.
 */
export const FORECAST_DAYS = 16;
const BASE = "https://api.open-meteo.com/v1/forecast";
const USER_AGENT = "trip-finder/0.1 (personal project)";
const DAILY = "temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum,cloud_cover_mean";
const REVALIDATE_S = 3 * 3600;

/** Forecast for a stay: same shape as typical weather; `days` is how many of its days the forecast reaches. */
export type Forecast = ClimateStats;

export interface ForecastStay {
  id: number;
  lat: number | null;
  lng: number | null;
  arrivalDate: string;
  checkoutDate: string;
}

const DAY = 86_400_000;
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/** Stays whose first night is inside the forecast range (and that haven't ended). */
export function inForecastRange(s: Pick<ForecastStay, "arrivalDate" | "checkoutDate">, today: string) {
  return s.arrivalDate <= addDays(today, FORECAST_DAYS - 1) && s.checkoutDate > today;
}

type Series = "temperature_2m_max" | "temperature_2m_min" | "precipitation_sum" | "snowfall_sum" | "cloud_cover_mean";
export type Daily = { time: string[] } & Partial<Record<Series, (number | null)[]>>;

async function fetchForecast(places: { lat: number; lng: number }[]): Promise<Daily[]> {
  const qs = new URLSearchParams({
    latitude: places.map((p) => p.lat.toFixed(3)).join(","),
    longitude: places.map((p) => p.lng.toFixed(3)).join(","),
    daily: DAILY,
    temperature_unit: "fahrenheit",
    timezone: "auto",
    forecast_days: String(FORECAST_DAYS),
  });
  const res = await fetch(`${BASE}?${qs}`, {
    headers: { "User-Agent": USER_AGENT },
    // the page waits on this, so give up quickly and show typical weather instead
    signal: AbortSignal.timeout(4_000),
    next: { revalidate: REVALIDATE_S },
  });
  if (!res.ok) throw new Error(`Open-Meteo forecast ${res.status}`);
  const body = await res.json();
  return (Array.isArray(body) ? body : [body]).map((b: { daily: Daily }) => b.daily);
}

/** The stay's nights that the forecast covers, summarized. Null when it covers none. */
export function forecastFor(d: Daily, arrival: string, checkout: string): Forecast | null {
  const idx = d.time.flatMap((t, i) => (t >= arrival && t < checkout ? [i] : []));
  if (!idx.length) return null;
  const pick = (k: Series) => idx.map((i) => d[k]?.[i] ?? null);
  const rows: DailyRows = {
    high: pick("temperature_2m_max"),
    low: pick("temperature_2m_min"),
    precipMm: pick("precipitation_sum"),
    snowCm: pick("snowfall_sum"),
    cloud: pick("cloud_cover_mean"),
  };
  const s = summarize([rows], [0]);
  return s && { ...s, years: "forecast" };
}

/**
 * Forecasts for every stay in range, by listing id. Never throws: if the forecast service is down
 * the page just shows typical weather.
 */
export async function forecastsFor(stays: ForecastStay[], today = new Date().toISOString().slice(0, 10)) {
  const out = new Map<number, Forecast>();
  const soon = stays.filter((s) => s.lat != null && s.lng != null && inForecastRange(s, today));
  const places = [...new Map(soon.map((s) => [`${s.lat!.toFixed(3)},${s.lng!.toFixed(3)}`, { lat: s.lat!, lng: s.lng! }])).entries()];
  const byPlace = new Map<string, Daily>();
  await Promise.all(
    Array.from({ length: Math.ceil(places.length / MAX_LOCATIONS) }, async (_, c) => {
      const chunk = places.slice(c * MAX_LOCATIONS, (c + 1) * MAX_LOCATIONS);
      try {
        const got = await fetchForecast(chunk.map(([, p]) => p));
        got.forEach((d, i) => byPlace.set(chunk[i][0], d));
      } catch (e) {
        console.warn("forecast unavailable:", e instanceof Error ? e.message : e);
      }
    }),
  );
  for (const s of soon) {
    const d = byPlace.get(`${s.lat!.toFixed(3)},${s.lng!.toFixed(3)}`);
    const f = d && forecastFor(d, s.arrivalDate, s.checkoutDate);
    if (f) out.set(s.id, f);
  }
  return out;
}

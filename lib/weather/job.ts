import { and, eq, isNotNull } from "drizzle-orm";
import { getDb, listing, property, stayClimate } from "@/lib/db";
import { nightsBetween } from "@/lib/format";
import { getLatestUpload } from "@/lib/queries";
import { climateYears, fetchDaily, MAX_LOCATIONS, RateLimitError, summarize, windowIn, type DailyRows } from "./climate";

interface Need {
  propertyId: number;
  lat: number;
  lng: number;
  startMd: string;
  nights: number;
}

/** Stays on the current list (at located resorts) with no typical weather yet. */
export async function climateNeeded(): Promise<Need[]> {
  const upload = await getLatestUpload();
  if (!upload) return [];
  const db = getDb();
  const [rows, have] = await Promise.all([
    db
      .select({
        propertyId: listing.propertyId,
        arrivalDate: listing.arrivalDate,
        checkoutDate: listing.checkoutDate,
        lat: property.lat,
        lng: property.lng,
      })
      .from(listing)
      .innerJoin(property, eq(property.id, listing.propertyId))
      .where(and(eq(listing.uploadId, upload.id), isNotNull(property.lat), isNotNull(property.lng))),
    db.select({ propertyId: stayClimate.propertyId, startMd: stayClimate.startMd, nights: stayClimate.nights }).from(stayClimate),
  ]);
  const key = (n: { propertyId: number; startMd: string; nights: number }) => `${n.propertyId}|${n.startMd}|${n.nights}`;
  const done = new Set(have.map(key));
  const out = new Map<string, Need>();
  for (const r of rows) {
    const n = { propertyId: r.propertyId, lat: r.lat!, lng: r.lng!, startMd: r.arrivalDate.slice(5), nights: nightsBetween(r.arrivalDate, r.checkoutDate) };
    if (!done.has(key(n))) out.set(key(n), n);
  }
  return [...out.values()];
}

/**
 * Looks up typical weather until the time budget runs out. Stays with the same dates are fetched
 * together (several resorts per request, one request per past year). Resumable.
 */
export async function runClimateBatch(budgetMs = 40_000) {
  const start = Date.now();
  const years = climateYears();
  const needed = await climateNeeded();
  const groups = new Map<string, Need[]>();
  for (const n of needed) {
    const k = `${n.startMd}|${n.nights}`;
    groups.set(k, [...(groups.get(k) ?? []), n]);
  }
  let saved = 0;
  let rateLimited = false;
  let failed = 0;
  outer: for (const group of groups.values())
    for (let i = 0; i < group.length; i += MAX_LOCATIONS) {
      if (Date.now() - start >= budgetMs) break outer;
      const chunk = group.slice(i, i + MAX_LOCATIONS);
      const rows: DailyRows[][] = chunk.map(() => []);
      try {
        for (const y of years) {
          const got = await fetchDaily(chunk, windowIn(y, chunk[0].startMd, chunk[0].nights));
          got.forEach((r, j) => rows[j].push(r));
        }
      } catch (e) {
        if (e instanceof RateLimitError) {
          rateLimited = true;
          break outer;
        }
        failed += chunk.length; // retried on the next run
        continue;
      }
      const values = chunk.flatMap((n, j) => {
        const stats = summarize(rows[j], years);
        return stats ? [{ propertyId: n.propertyId, startMd: n.startMd, nights: n.nights, stats }] : [];
      });
      if (values.length) await getDb().insert(stayClimate).values(values).onConflictDoNothing();
      saved += values.length;
    }
  return { saved, failed, rateLimited, remaining: needed.length - saved };
}

/** Typical weather for each stay, keyed like climateNeeded. */
export async function climateMap() {
  const rows = await getDb().select().from(stayClimate);
  return new Map(rows.map((r) => [`${r.propertyId}|${r.startMd}|${r.nights}`, r.stats]));
}

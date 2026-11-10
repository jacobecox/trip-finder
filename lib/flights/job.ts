import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { apiUsage, flightQuote, getDb, listing, property, propertyAirport } from "@/lib/db";
import { getLatestUpload, getSettings } from "@/lib/queries";
import { QuotaError } from "@/lib/geo/util";
import { quoteKey, searchAirports } from "./keys";
import { passengersFor, passengersKey, searchFares, type FareSearch } from "./serpapi";

type Settings = Awaited<ReturnType<typeof getSettings>>;

const SERVICE = "serpapi";
const month = (d = new Date()) => d.toISOString().slice(0, 7);

export async function getUsage() {
  const [r] = await getDb()
    .select({ count: apiUsage.count })
    .from(apiUsage)
    .where(and(eq(apiUsage.service, SERVICE), eq(apiUsage.month, month())));
  return r?.count ?? 0;
}

async function addUsage() {
  await getDb()
    .insert(apiUsage)
    .values({ service: SERVICE, month: month(), count: 1 })
    .onConflictDoUpdate({ target: [apiUsage.service, apiUsage.month], set: { count: sql`${apiUsage.count} + 1` } });
}

/** Every distinct fare search the current (future, fly-to) listings need, soonest first. */
export async function neededSearches(s: Settings): Promise<FareSearch[]> {
  const upload = await getLatestUpload();
  if (!upload) return [];
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db
    .select({ propertyId: listing.propertyId, arrivalDate: listing.arrivalDate, checkoutDate: listing.checkoutDate })
    .from(listing)
    .innerJoin(property, eq(property.id, listing.propertyId))
    .where(
      and(
        eq(listing.uploadId, upload.id),
        eq(property.isDrivable, false),
        eq(property.airportStatus, "ok"),
        gte(listing.arrivalDate, today),
      ),
    );
  if (!rows.length) return [];
  const airports = await db
    .select()
    .from(propertyAirport)
    .where(inArray(propertyAirport.propertyId, [...new Set(rows.map((r) => r.propertyId))]));
  const passengers = passengersFor(s.tickets, s.lapInfants);
  const out = new Map<string, FareSearch>();
  for (const r of rows) {
    const list = searchAirports(airports.filter((a) => a.propertyId === r.propertyId), s.maxAirports);
    if (!list.length) continue;
    const q = { origin: s.originAirport, airports: list, outboundDate: r.arrivalDate, returnDate: r.checkoutDate, passengers };
    out.set(quoteKey({ ...q, airports: list.join(","), passengers: passengersKey(passengers) }), q);
  }
  return [...out.values()].sort((a, b) => a.outboundDate.localeCompare(b.outboundDate));
}

/** Searches with no usable cached quote (missing, failed, or older than the cache window). */
export async function staleSearches(s: Settings) {
  const needed = await neededSearches(s);
  if (!needed.length) return [];
  const cutoff = new Date(Date.now() - s.fareCacheHours * 3600_000);
  const quotes = await getDb()
    .select({
      origin: flightQuote.origin,
      airports: flightQuote.airports,
      outboundDate: flightQuote.outboundDate,
      returnDate: flightQuote.returnDate,
      passengers: flightQuote.passengers,
      status: flightQuote.status,
      fetchedAt: flightQuote.fetchedAt,
    })
    .from(flightQuote)
    .where(inArray(flightQuote.outboundDate, [...new Set(needed.map((n) => n.outboundDate))]));
  const fresh = new Set(quotes.filter((q) => q.status !== "failed" && q.fetchedAt >= cutoff).map(quoteKey));
  return needed.filter(
    (n) => !fresh.has(quoteKey({ ...n, airports: n.airports.join(","), passengers: passengersKey(n.passengers) })),
  );
}

export async function fareStatus() {
  const s = await getSettings();
  return { remaining: (await staleSearches(s)).length, usage: await getUsage(), cap: s.serpapiMonthlyCap };
}

/** Runs fare searches until the time budget or monthly cap runs out. Resumable: poll until remaining is 0. */
export async function runFareBatch(budgetMs = 40_000) {
  const s = await getSettings();
  const db = getDb();
  const start = Date.now();
  let searched = 0;
  let failed = 0;
  let capReached = false;
  let quotaExceeded = false;
  let usage = await getUsage();

  for (const q of await staleSearches(s)) {
    if (Date.now() - start >= budgetMs) break;
    if (usage >= s.serpapiMonthlyCap) {
      capReached = true;
      break;
    }
    const key = {
      origin: q.origin,
      airports: q.airports.join(","),
      outboundDate: q.outboundDate,
      returnDate: q.returnDate,
      passengers: passengersKey(q.passengers),
    };
    let row: typeof flightQuote.$inferInsert;
    try {
      const r = await searchFares(q);
      row = { ...key, status: r.status, options: r.options, searchUrl: r.searchUrl, error: null, fetchedAt: new Date() };
      await addUsage();
      usage++;
    } catch (e) {
      if (e instanceof QuotaError) {
        quotaExceeded = true;
        break;
      }
      failed++;
      row = { ...key, status: "failed", options: [], error: e instanceof Error ? e.message : String(e), fetchedAt: new Date() };
    }
    // a failed retry must not wipe out an older good quote
    const keep = row.status === "failed" ? sql`${flightQuote.status} <> 'failed'` : sql`false`;
    await db
      .insert(flightQuote)
      .values(row)
      .onConflictDoUpdate({
        target: [flightQuote.origin, flightQuote.airports, flightQuote.outboundDate, flightQuote.returnDate, flightQuote.passengers],
        set: {
          status: sql`case when ${keep} then ${flightQuote.status} else excluded.status end`,
          options: sql`case when ${keep} then ${flightQuote.options} else excluded.options end`,
          searchUrl: sql`case when ${keep} then ${flightQuote.searchUrl} else excluded.search_url end`,
          error: sql`excluded.error`,
          fetchedAt: sql`case when ${keep} then ${flightQuote.fetchedAt} else excluded.fetched_at end`,
        },
      });
    searched++;
  }
  return {
    searched,
    failed,
    capReached,
    quotaExceeded,
    remaining: (await staleSearches(s)).length,
    usage,
    cap: s.serpapiMonthlyCap,
  };
}

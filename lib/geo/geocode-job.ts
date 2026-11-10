import { and, asc, eq, isNotNull, or, sql } from "drizzle-orm";
import { getDb, property, propertyAirport, propertyTag, TAGS } from "@/lib/db";
import { airportByIata, nearbyAirports, selectCandidates, type CandidateRules } from "@/lib/flights/airports";
import { getSettings } from "@/lib/queries";
import { applyDerived, tagLocation } from "@/lib/tags/tagger";
import { cityPopulation, geocodeProperty, searchNear } from "./nominatim";
import { driveMatrix, driveRoute, inNorthAmerica } from "./ors";
import { osrmMatrix } from "./osrm";
import { QuotaError } from "./util";

export function computeDrivable(hours: number | null | undefined, max: number) {
  return hours != null && hours <= max;
}

/** Needs geocoding/routing, or is located but not yet auto-tagged / given candidate airports. */
const needsWork = or(
  eq(property.geocodeStatus, "pending"),
  and(
    eq(property.geocodeStatus, "ok"),
    isNotNull(property.lat),
    or(eq(property.tagStatus, "pending"), eq(property.airportStatus, "pending")),
  ),
);

export async function countPending() {
  const [r] = await getDb().select({ n: sql<number>`count(*)::int` }).from(property).where(needsWork);
  return r.n;
}

async function saveTags(p: typeof property.$inferSelect, lat: number, lng: number) {
  const propertyId = p.id;
  const found = await tagLocation({ lat, lng }, searchNear);
  const tags = applyDerived(found, { name: p.city, population: await cityPopulation(p) });
  const rows = TAGS.map((tag) => ({ propertyId, tag, osm: tags[tag].present, osmEvidence: tags[tag].evidence }));
  // manual choices live in their own column and are never touched here
  await getDb()
    .insert(propertyTag)
    .values(rows)
    .onConflictDoUpdate({
      target: [propertyTag.propertyId, propertyTag.tag],
      set: { osm: sql`excluded.osm`, osmEvidence: sql`excluded.osm_evidence` },
    });
}

/**
 * Rebuilds the auto candidate airports for a property. Pinned/excluded rows are manual and kept;
 * a pinned airport gets its drive time filled in when it's reachable.
 */
export async function saveAirports(propertyId: number, at: { lat: number; lng: number }, rules: CandidateRules) {
  const db = getDb();
  const manual = await db.select().from(propertyAirport).where(eq(propertyAirport.propertyId, propertyId));
  const pinned = manual.filter((r) => r.pinned).map((r) => r.iata);
  const near = nearbyAirports(at);
  const ask = [...near.map((a) => a.iata), ...pinned.filter((i) => !near.some((a) => a.iata === i))];
  const points = ask.map((i) => airportByIata(i)!).filter(Boolean);
  // ORS's matrix quota has run out well below its advertised limit; OSRM gives near-identical times
  const drives = await driveMatrix(at, points).catch((e) => {
    if (e instanceof QuotaError) return osrmMatrix(at, points);
    throw e;
  });
  const reachable = points.flatMap((a, i) => (drives[i] ? [{ iata: a.iata, large: a.large, ...drives[i]! }] : []));
  // excluded airports don't take one of the slots
  const excluded = new Set(manual.filter((r) => r.excluded).map((r) => r.iata));
  const picked = new Set(selectCandidates(reachable.filter((a) => !excluded.has(a.iata)), rules).map((a) => a.iata));
  const keep = new Set([...picked, ...manual.filter((r) => r.pinned || r.excluded).map((r) => r.iata)]);

  await db.delete(propertyAirport).where(eq(propertyAirport.propertyId, propertyId));
  const rows = [...keep].map((iata) => {
    const d = reachable.find((a) => a.iata === iata);
    const m = manual.find((r) => r.iata === iata);
    return {
      propertyId,
      iata,
      driveHours: d?.hours ?? m?.driveHours ?? null,
      driveMiles: d?.miles ?? m?.driveMiles ?? null,
      auto: picked.has(iata),
      pinned: m?.pinned ?? false,
      excluded: m?.excluded ?? false,
    };
  });
  if (rows.length) await db.insert(propertyAirport).values(rows);
  return rows;
}

/**
 * Processes properties needing work until the time budget runs out: geocode, route, then
 * auto-tag. Resumable: callers poll until `remaining` is 0. Manual overrides are never touched.
 */
export async function runGeocodeBatch(budgetMs = 40_000) {
  const db = getDb();
  const settings = await getSettings();
  const origin = { lat: settings.originLat, lng: settings.originLng };
  const start = Date.now();
  let processed = 0;
  let failed = 0;
  let quotaExceeded = false;

  while (Date.now() - start < budgetMs) {
    const [p] = await db.select().from(property).where(needsWork).orderBy(asc(property.id)).limit(1);
    if (!p) break;
    let lat = p.lat;
    let lng = p.lng;

    try {
      if (p.geocodeStatus === "pending") {
        const patch: Partial<typeof property.$inferInsert> = { geocodeError: null };
        if (!p.latLngOverridden && (lat == null || lng == null)) {
          const hit = await geocodeProperty(p);
          if (!hit) throw new Error("Location not found. Set lat/lng manually.");
          lat = hit.lat;
          lng = hit.lng;
          Object.assign(patch, { lat, lng, geocodeSource: hit.source });
        }
        if (!p.driveOverridden) {
          let hours: number | null = null;
          let miles: number | null = null;
          if (lat != null && lng != null && inNorthAmerica({ lat, lng })) {
            const route = await driveRoute(origin, { lat, lng });
            if (route) ({ hours, miles } = route);
          }
          Object.assign(patch, {
            driveHours: hours,
            driveMiles: miles,
            isDrivable: computeDrivable(hours, settings.maxDriveHours),
          });
        }
        await db
          .update(property)
          .set({ ...patch, geocodeStatus: "ok", updatedAt: new Date() })
          .where(eq(property.id, p.id));
      }
    } catch (e) {
      if (e instanceof QuotaError) {
        quotaExceeded = true; // leave this property pending and stop the batch
        break;
      }
      failed++;
      processed++;
      await db
        .update(property)
        .set({ geocodeStatus: "failed", geocodeError: e instanceof Error ? e.message : String(e), updatedAt: new Date() })
        .where(eq(property.id, p.id));
      continue;
    }

    if (p.tagStatus === "pending" && lat != null && lng != null) {
      try {
        await saveTags(p, lat, lng);
        await db.update(property).set({ tagStatus: "ok", tagError: null }).where(eq(property.id, p.id));
      } catch (e) {
        if (e instanceof QuotaError) {
          quotaExceeded = true;
          break;
        }
        failed++;
        await db
          .update(property)
          .set({ tagStatus: "failed", tagError: e instanceof Error ? e.message : String(e) })
          .where(eq(property.id, p.id));
      }
    }

    if (p.airportStatus === "pending" && lat != null && lng != null) {
      try {
        await saveAirports(p.id, { lat, lng }, {
          maxDriveHours: settings.airportMaxDriveHours,
          hubMaxDriveHours: settings.hubMaxDriveHours,
          maxAirports: settings.maxAirports,
        });
        await db.update(property).set({ airportStatus: "ok", airportError: null }).where(eq(property.id, p.id));
      } catch (e) {
        if (e instanceof QuotaError) {
          quotaExceeded = true;
          break;
        }
        failed++;
        await db
          .update(property)
          .set({ airportStatus: "failed", airportError: e instanceof Error ? e.message : String(e) })
          .where(eq(property.id, p.id));
      }
    }
    processed++;
  }
  return { processed, failed, quotaExceeded, remaining: await countPending() };
}

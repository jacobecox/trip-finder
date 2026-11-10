import { and, asc, eq, isNotNull, or, sql } from "drizzle-orm";
import { getDb, property, propertyTag, TAGS } from "@/lib/db";
import { getSettings } from "@/lib/queries";
import { applyDerived, tagLocation } from "@/lib/tags/tagger";
import { cityPopulation, geocodeProperty, searchNear } from "./nominatim";
import { driveRoute, inNorthAmerica } from "./ors";
import { QuotaError } from "./util";

export function computeDrivable(hours: number | null | undefined, max: number) {
  return hours != null && hours <= max;
}

/** Needs geocoding/routing, or is located but not yet auto-tagged. */
const needsWork = or(
  eq(property.geocodeStatus, "pending"),
  and(eq(property.geocodeStatus, "ok"), eq(property.tagStatus, "pending"), isNotNull(property.lat)),
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
    processed++;
  }
  return { processed, failed, quotaExceeded, remaining: await countPending() };
}

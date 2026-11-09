import { and, asc, eq, sql } from "drizzle-orm";
import { getDb, property } from "@/lib/db";
import { getSettings } from "@/lib/queries";
import { geocodeProperty } from "./nominatim";
import { driveRoute, inNorthAmerica } from "./ors";
import { QuotaError } from "./util";

export function computeDrivable(hours: number | null | undefined, max: number) {
  return hours != null && hours <= max;
}

export async function countPending() {
  const [r] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(property)
    .where(eq(property.geocodeStatus, "pending"));
  return r.n;
}

/**
 * Processes pending properties until the time budget runs out. Resumable: callers
 * poll until `remaining` is 0. Manual overrides are never touched.
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
    const [p] = await db
      .select()
      .from(property)
      .where(eq(property.geocodeStatus, "pending"))
      .orderBy(asc(property.id))
      .limit(1);
    if (!p) break;

    try {
      const patch: Partial<typeof property.$inferInsert> = { geocodeError: null };
      let lat = p.lat;
      let lng = p.lng;

      if (!p.latLngOverridden && (lat == null || lng == null)) {
        const hit = await geocodeProperty(p);
        if (!hit) throw new Error("Location not found. Set lat/lng manually.");
        lat = hit.lat;
        lng = hit.lng;
        patch.lat = lat;
        patch.lng = lng;
        patch.geocodeSource = hit.source;
      }

      if (!p.driveOverridden) {
        let hours: number | null = null;
        let miles: number | null = null;
        if (lat != null && lng != null && inNorthAmerica({ lat, lng })) {
          const route = await driveRoute(origin, { lat, lng });
          if (route) {
            hours = route.hours;
            miles = route.miles;
          }
        }
        patch.driveHours = hours;
        patch.driveMiles = miles;
        patch.isDrivable = computeDrivable(hours, settings.maxDriveHours);
      }

      await db
        .update(property)
        .set({ ...patch, geocodeStatus: "ok", updatedAt: new Date() })
        .where(eq(property.id, p.id));
    } catch (e) {
      if (e instanceof QuotaError) {
        quotaExceeded = true; // leave this property pending and stop the batch
        break;
      }
      failed++;
      await db
        .update(property)
        .set({
          geocodeStatus: "failed",
          geocodeError: e instanceof Error ? e.message : String(e),
          updatedAt: new Date(),
        })
        .where(and(eq(property.id, p.id)));
    }
    processed++;
  }
  return { processed, failed, quotaExceeded, remaining: await countPending() };
}

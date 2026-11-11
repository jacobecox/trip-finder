import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin, requireUser } from "@/lib/auth";
import { DEFAULT_TAG_WEIGHTS, getDb, property, settings, TAGS } from "@/lib/db";
import { geocodeText } from "@/lib/geo/nominatim";
import { getSettings } from "@/lib/queries";

const Body = z.object({
  originLabel: z.string().min(2).max(200),
  originLat: z.number().min(-90).max(90).optional(),
  originLng: z.number().min(-180).max(180).optional(),
  maxDriveHours: z.number().min(0.5).max(48),
  costWeight: z.number().min(0).max(100).optional(),
  activityWeight: z.number().min(0).max(100).optional(),
  tagWeights: z.partialRecord(z.enum(TAGS), z.number().min(0).max(100)).optional(),
  tickets: z.number().int().min(1).max(20).optional(),
  mpg: z.number().min(1).max(200).optional(),
  gasPriceUsd: z.number().min(0).max(50).optional(),
  flightBaseUsd: z.number().min(0).max(5000).optional(),
  flightPerMileUsd: z.number().min(0).max(5).optional(),
  originAirport: z.string().regex(/^[A-Za-z]{3}$/).optional(),
  lapInfants: z.number().int().min(0).max(4).optional(),
  airportMaxDriveHours: z.number().min(0.5).max(12).optional(),
  hubMaxDriveHours: z.number().min(0).max(12).optional(),
  maxAirports: z.number().int().min(1).max(7).optional(),
  extraDriveUsdPerHour: z.number().min(0).max(500).optional(),
  serpapiMonthlyCap: z.number().int().min(0).max(100000).optional(),
  fareCacheHours: z.number().int().min(1).max(24 * 60).optional(),
  altOriginAirport: z.string().regex(/^([A-Za-z]{3})?$/).optional(),
  altOriginDriveHours: z.number().min(0).max(24).optional(),
  altOriginDriveMiles: z.number().min(0).max(2000).optional(),
  altOriginParkingUsdPerDay: z.number().min(0).max(500).optional(),
});

export async function GET() {
  if (!(await requireUser())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await getSettings());
}

export async function PUT(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Only the admin can do this" }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const b = parsed.data;
  const db = getDb();
  const cur = await getSettings();

  let lat = b.originLat ?? cur.originLat;
  let lng = b.originLng ?? cur.originLng;
  const coordsEdited = lat !== cur.originLat || lng !== cur.originLng;
  if (b.originLabel !== cur.originLabel && !coordsEdited) {
    const hit = await geocodeText(b.originLabel).catch(() => null);
    if (!hit) return NextResponse.json({ error: "Could not find that origin" }, { status: 422 });
    ({ lat, lng } = hit);
  }
  const originChanged = lat !== cur.originLat || lng !== cur.originLng;

  await db
    .update(settings)
    .set({
      originLabel: b.originLabel,
      originLat: lat,
      originLng: lng,
      maxDriveHours: b.maxDriveHours,
      costWeight: b.costWeight ?? cur.costWeight,
      activityWeight: b.activityWeight ?? cur.activityWeight,
      // merge so partial updates work; drop keys for tags that no longer exist
      tagWeights: Object.fromEntries(
        TAGS.map((t) => [t, b.tagWeights?.[t] ?? cur.tagWeights[t] ?? DEFAULT_TAG_WEIGHTS[t]]),
      ) as typeof cur.tagWeights,
      tickets: b.tickets ?? cur.tickets,
      mpg: b.mpg ?? cur.mpg,
      gasPriceUsd: b.gasPriceUsd ?? cur.gasPriceUsd,
      flightBaseUsd: b.flightBaseUsd ?? cur.flightBaseUsd,
      flightPerMileUsd: b.flightPerMileUsd ?? cur.flightPerMileUsd,
      originAirport: b.originAirport?.toUpperCase() ?? cur.originAirport,
      lapInfants: b.lapInfants ?? cur.lapInfants,
      airportMaxDriveHours: b.airportMaxDriveHours ?? cur.airportMaxDriveHours,
      hubMaxDriveHours: b.hubMaxDriveHours ?? cur.hubMaxDriveHours,
      maxAirports: b.maxAirports ?? cur.maxAirports,
      extraDriveUsdPerHour: b.extraDriveUsdPerHour ?? cur.extraDriveUsdPerHour,
      serpapiMonthlyCap: b.serpapiMonthlyCap ?? cur.serpapiMonthlyCap,
      fareCacheHours: b.fareCacheHours ?? cur.fareCacheHours,
      altOriginAirport: b.altOriginAirport?.toUpperCase() ?? cur.altOriginAirport,
      altOriginDriveHours: b.altOriginDriveHours ?? cur.altOriginDriveHours,
      altOriginDriveMiles: b.altOriginDriveMiles ?? cur.altOriginDriveMiles,
      altOriginParkingUsdPerDay: b.altOriginParkingUsdPerDay ?? cur.altOriginParkingUsdPerDay,
    })
    .where(eq(settings.id, 1));

  // Max hours: recompute in SQL. Origin: queue re-routing (lat/lng are kept, so only routing re-runs).
  await db
    .update(property)
    .set({ isDrivable: sql`${property.driveHours} is not null and ${property.driveHours} <= ${b.maxDriveHours}` });
  let requeued = 0;
  if (originChanged) {
    const rows = await db
      .update(property)
      .set({ geocodeStatus: "pending" })
      .where(sql`${property.driveOverridden} = false and ${property.lat} is not null`)
      .returning({ id: property.id });
    requeued = rows.length;
  }
  // candidate-airport rules changed: rebuild airport lists (cheap: one ORS matrix call each)
  const airportRulesChanged =
    (b.airportMaxDriveHours ?? cur.airportMaxDriveHours) !== cur.airportMaxDriveHours ||
    (b.hubMaxDriveHours ?? cur.hubMaxDriveHours) !== cur.hubMaxDriveHours ||
    (b.maxAirports ?? cur.maxAirports) !== cur.maxAirports;
  if (airportRulesChanged)
    await db.update(property).set({ airportStatus: "pending" }).where(sql`${property.lat} is not null`);
  return NextResponse.json({ ok: true, requeued, airportsRequeued: airportRulesChanged });
}

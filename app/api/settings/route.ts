import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getDb, property, settings, TAGS } from "@/lib/db";
import { geocodeText } from "@/lib/geo/nominatim";
import { getSettings } from "@/lib/queries";

const Body = z.object({
  originLabel: z.string().min(2).max(200),
  originLat: z.number().min(-90).max(90).optional(),
  originLng: z.number().min(-180).max(180).optional(),
  maxDriveHours: z.number().min(0.5).max(48),
  costWeight: z.number().min(0).max(100).optional(),
  activityWeight: z.number().min(0).max(100).optional(),
  tagWeights: z.record(z.enum(TAGS), z.number().min(0).max(100)).optional(),
  tickets: z.number().int().min(1).max(20).optional(),
  mpg: z.number().min(1).max(200).optional(),
  gasPriceUsd: z.number().min(0).max(50).optional(),
  flightBaseUsd: z.number().min(0).max(5000).optional(),
  flightPerMileUsd: z.number().min(0).max(5).optional(),
});

export async function GET() {
  if (!(await requireUser())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await getSettings());
}

export async function PUT(req: Request) {
  if (!(await requireUser())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
      tagWeights: b.tagWeights ?? cur.tagWeights,
      tickets: b.tickets ?? cur.tickets,
      mpg: b.mpg ?? cur.mpg,
      gasPriceUsd: b.gasPriceUsd ?? cur.gasPriceUsd,
      flightBaseUsd: b.flightBaseUsd ?? cur.flightBaseUsd,
      flightPerMileUsd: b.flightPerMileUsd ?? cur.flightPerMileUsd,
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
  return NextResponse.json({ ok: true, requeued });
}

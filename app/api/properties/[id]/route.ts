import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getDb, property } from "@/lib/db";
import { computeDrivable } from "@/lib/geo/geocode-job";
import { getSettings } from "@/lib/queries";

const Body = z.object({
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  driveHours: z.number().min(0).max(200).nullable().optional(),
  driveMiles: z.number().min(0).max(100000).nullable().optional(),
  resetOverrides: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireUser())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!Number.isInteger(id) || !parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const b = parsed.data;
  const db = getDb();
  const settings = await getSettings();
  const patch: Partial<typeof property.$inferInsert> = { updatedAt: new Date() };

  if (b.resetOverrides) {
    // Clear overrides and queue for re-geocoding (lat/lng cleared so it is looked up again)
    Object.assign(patch, {
      latLngOverridden: false,
      driveOverridden: false,
      lat: null,
      lng: null,
      geocodeSource: null,
      geocodeStatus: "pending",
    });
  } else {
    if (b.lat !== undefined || b.lng !== undefined) {
      Object.assign(patch, { lat: b.lat ?? null, lng: b.lng ?? null, latLngOverridden: true, geocodeSource: "manual" });
      if (b.lat != null && b.lng != null) patch.geocodeStatus = "ok";
    }
    if (b.driveHours !== undefined) {
      Object.assign(patch, {
        driveHours: b.driveHours,
        driveMiles: b.driveMiles ?? null,
        driveOverridden: true,
        isDrivable: computeDrivable(b.driveHours, settings.maxDriveHours),
      });
    }
  }
  await db.update(property).set(patch).where(eq(property.id, id));
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getDb, property, propertyTag, TAGS } from "@/lib/db";
import { computeDrivable } from "@/lib/geo/geocode-job";
import { getSettings } from "@/lib/queries";

const Body = z.object({
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  driveHours: z.number().min(0).max(200).nullable().optional(),
  driveMiles: z.number().min(0).max(100000).nullable().optional(),
  resetOverrides: z.boolean().optional(),
  // true/false = manual choice, null = clear it (fall back to the auto suggestion)
  tags: z.partialRecord(z.enum(TAGS), z.boolean().nullable()).optional(),
  tagsReviewed: z.boolean().optional(),
  resetTags: z.boolean().optional(),
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
      tagStatus: "pending",
    });
  } else {
    if (b.lat !== undefined || b.lng !== undefined) {
      // new location: re-run auto-tagging there
      Object.assign(patch, {
        lat: b.lat ?? null,
        lng: b.lng ?? null,
        latLngOverridden: true,
        geocodeSource: "manual",
        tagStatus: "pending",
      });
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
  if (b.tagsReviewed !== undefined) patch.tagsReviewed = b.tagsReviewed;
  if (b.resetTags) patch.tagsReviewed = false;
  await db.update(property).set(patch).where(eq(property.id, id));

  if (b.resetTags) await db.update(propertyTag).set({ manual: null }).where(eq(propertyTag.propertyId, id));
  const manual = Object.entries(b.tags ?? {}) as [(typeof TAGS)[number], boolean | null][];
  if (manual.length)
    await db
      .insert(propertyTag)
      .values(manual.map(([tag, value]) => ({ propertyId: id, tag, manual: value })))
      .onConflictDoUpdate({ target: [propertyTag.propertyId, propertyTag.tag], set: { manual: sql`excluded.manual` } });
  return NextResponse.json({ ok: true });
}

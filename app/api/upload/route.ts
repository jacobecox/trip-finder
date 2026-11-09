import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { getDb, listing, listingsUpload, property } from "@/lib/db";
import { normalizeKey } from "@/lib/normalize";
import { parsePdf } from "@/lib/parser/extract";
import { getBlobStore } from "@/lib/storage";
import { countPending } from "@/lib/geo/geocode-job";

export const maxDuration = 60;
const MAX_BYTES = 10 * 1024 * 1024;
const CHUNK = 500;

export async function POST(req: Request) {
  if (!(await requireUser())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".pdf"))
    return NextResponse.json({ error: "Upload a PDF file" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File too large" }, { status: 413 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { listings, warnings } = await parsePdf(bytes);
  if (listings.length === 0)
    return NextResponse.json({ error: "No listings found in this PDF", warnings }, { status: 422 });

  const blobUrl = await getBlobStore().put(file.name, bytes, "application/pdf");
  const db = getDb();

  const [upload] = await db
    .insert(listingsUpload)
    .values({
      blobUrl,
      filename: file.name,
      rowCount: listings.length,
      warningCount: warnings.length,
      warnings: JSON.stringify(warnings),
    })
    .returning();

  try {
    // Upsert properties by normalized key; existing (already geocoded) ones are left alone
    const props = new Map<string, (typeof listings)[number]>();
    for (const l of listings) {
      const k = normalizeKey({ name: l.property, city: l.city, state: l.state, countryCode: l.countryCode });
      if (!props.has(k)) props.set(k, l);
    }
    const propValues = [...props].map(([normalizedKey, l]) => ({
      normalizedKey,
      name: l.property,
      city: l.city,
      state: l.state,
      countryCode: l.countryCode,
      country: l.country,
    }));
    for (let i = 0; i < propValues.length; i += CHUNK)
      await db.insert(property).values(propValues.slice(i, i + CHUNK)).onConflictDoNothing();

    const keys = [...props.keys()];
    const idByKey = new Map<string, number>();
    for (let i = 0; i < keys.length; i += CHUNK) {
      const rows = await db
        .select({ id: property.id, k: property.normalizedKey })
        .from(property)
        .where(inArray(property.normalizedKey, keys.slice(i, i + CHUNK)));
      rows.forEach((r) => idByKey.set(r.k, r.id));
    }

    const listingValues = listings.map((l) => ({
      uploadId: upload.id,
      inventoryNumber: l.inventoryNumber,
      propertyId: idByKey.get(normalizeKey({ name: l.property, city: l.city, state: l.state, countryCode: l.countryCode }))!,
      arrivalDate: l.arrivalDate,
      checkoutDate: l.checkoutDate,
      unitType: l.unitType,
      priceUsd: Math.round(l.priceUsd),
    }));
    for (let i = 0; i < listingValues.length; i += CHUNK)
      await db.insert(listing).values(listingValues.slice(i, i + CHUNK));
  } catch (e) {
    // The HTTP driver has no transactions; remove the partial upload (listings cascade)
    await db.delete(listingsUpload).where(eq(listingsUpload.id, upload.id));
    throw e;
  }

  return NextResponse.json({
    uploadId: upload.id,
    rowCount: listings.length,
    warnings,
    pending: await countPending(),
  });
}

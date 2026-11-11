import { createHash } from "node:crypto";
import { desc, eq, inArray } from "drizzle-orm";
import { getDb, listing, listingsUpload, property } from "@/lib/db";
import { normalizeKey } from "@/lib/normalize";
import { parsePdf } from "@/lib/parser/extract";
import type { ParsedListing, ParseWarning } from "@/lib/parser/types";
import { getBlobStore } from "@/lib/storage";

const CHUNK = 500;

const keyOf = (l: ParsedListing) =>
  normalizeKey({ name: l.property, city: l.city, state: l.state, countryCode: l.countryCode });

/**
 * Saves an upload and its listings. Properties are upserted by normalized key, so ones
 * already geocoded (and any manual overrides) are left untouched; only new ones start pending.
 */
export async function ingestUpload(input: {
  filename: string;
  blobUrl: string;
  listings: ParsedListing[];
  warnings: ParseWarning[];
  source?: "upload" | "email";
  contentHash?: string;
}) {
  const db = getDb();
  const [upload] = await db
    .insert(listingsUpload)
    .values({
      blobUrl: input.blobUrl,
      filename: input.filename,
      rowCount: input.listings.length,
      warningCount: input.warnings.length,
      warnings: JSON.stringify(input.warnings),
      source: input.source ?? "upload",
      contentHash: input.contentHash ?? null,
    })
    .returning();

  try {
    const props = new Map<string, ParsedListing>();
    for (const l of input.listings) if (!props.has(keyOf(l))) props.set(keyOf(l), l);
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

    const listingValues = input.listings.map((l) => ({
      uploadId: upload.id,
      inventoryNumber: l.inventoryNumber,
      propertyId: idByKey.get(keyOf(l))!,
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
  return upload;
}

export const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/**
 * Parse -> store the PDF -> save listings. Shared by the upload page and the email webhook.
 * Email imports return "duplicate" when the newest upload has the same PDF hash (a re-forwarded
 * or retried email).
 */
export async function importPdf(input: { filename: string; bytes: Uint8Array; source: "upload" | "email" }) {
  const contentHash = sha256(input.bytes);
  if (input.source === "email") {
    const [latest] = await getDb()
      .select({ id: listingsUpload.id, contentHash: listingsUpload.contentHash })
      .from(listingsUpload)
      .orderBy(desc(listingsUpload.id))
      .limit(1);
    if (latest?.contentHash === contentHash) return { status: "duplicate" as const, uploadId: latest.id };
  }
  const { listings, warnings } = await parsePdf(input.bytes);
  if (listings.length === 0) return { status: "empty" as const, warnings };
  const blobUrl = await getBlobStore().put(input.filename, input.bytes, "application/pdf");
  const upload = await ingestUpload({ filename: input.filename, blobUrl, listings, warnings, source: input.source, contentHash });
  return { status: "ok" as const, upload, rowCount: listings.length, warnings };
}

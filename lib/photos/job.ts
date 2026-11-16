import { and, eq, isNotNull, sql } from "drizzle-orm";
import { getDb, property } from "@/lib/db";
import { getBlobStore } from "@/lib/storage";
import { downloadPhoto, findPlaceId, PhotoCapError, placePhotos, placesEnabled } from "./google";
import { wikiPhoto } from "./wiki";

const pending = and(eq(property.photoStatus, "pending"), eq(property.geocodeStatus, "ok"), isNotNull(property.lat));

export async function countPhotoPending() {
  if (!placesEnabled()) return 0;
  const [r] = await getDb().select({ n: sql<number>`count(*)::int` }).from(property).where(pending);
  return r.n;
}

const ext = (type: string) => (type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg");

/**
 * Downloads the place's nth photo once and keeps it (Blob storage), with its photographer.
 * Used when a resort is first seen and when the admin asks for the next photo.
 */
export async function saveGooglePhoto(propertyId: number, placeId: string, index: number) {
  const photos = await placePhotos(placeId);
  if (!photos.length) return false;
  const i = index % photos.length;
  const ph = photos[i];
  const img = await downloadPhoto(ph);
  const url = await getBlobStore().put(`photos/property-${propertyId}-${i}.${ext(img.type)}`, img.bytes, img.type);
  await getDb()
    .update(property)
    .set({
      photoStatus: "google",
      googlePlaceId: placeId,
      photoIndex: i,
      photoUrl: url,
      photoCredit: ph.author,
      photoCreditUrl: ph.authorUri,
      photoError: null,
      updatedAt: new Date(),
    })
    .where(eq(property.id, propertyId));
  return true;
}

/**
 * Finds and keeps a photo for each located resort that has none yet: the resort's Google place
 * photo, else Wikipedia's photo of the town. Runs once per resort, so new lists of the same
 * resorts download nothing. Resumable; stops for the month at the photo cap.
 */
export async function runPhotoBatch(budgetMs = 40_000) {
  const start = Date.now();
  const db = getDb();
  const rows = await db.select().from(property).where(pending).limit(200);
  let processed = 0;
  let capReached = false;
  for (const p of rows) {
    if (Date.now() - start >= budgetMs) break;
    try {
      const placeId = await findPlaceId({ ...p, lat: p.lat!, lng: p.lng! });
      if (!(placeId && (await saveGooglePhoto(p.id, placeId, 0)))) {
        const w = await wikiPhoto(p);
        await db
          .update(property)
          .set({
            photoStatus: w ? "wiki" : "none",
            googlePlaceId: placeId,
            photoUrl: w?.url ?? null,
            photoCredit: w ? "Wikipedia" : null,
            photoCreditUrl: w?.page ?? null,
            photoError: null,
            updatedAt: new Date(),
          })
          .where(eq(property.id, p.id));
      }
    } catch (e) {
      if (e instanceof PhotoCapError) {
        capReached = true; // stays pending; picked up next month
        break;
      }
      await db
        .update(property)
        .set({ photoStatus: "failed", photoError: e instanceof Error ? e.message.slice(0, 300) : String(e), updatedAt: new Date() })
        .where(eq(property.id, p.id));
    }
    processed++;
  }
  return { processed, capReached, remaining: capReached ? 0 : await countPhotoPending() };
}

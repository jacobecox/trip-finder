import { and, eq, inArray, isNotNull, lt, or, sql } from "drizzle-orm";
import { getDb, property } from "@/lib/db";
import { getBlobStore } from "@/lib/storage";
import { downloadPhoto, findPlaceId, PHOTO_CAP, PhotoCapError, type PhotoMeta, photoUsage, placePhotos, placesEnabled } from "./google";
import { CANDIDATES, choosePhoto, MAX_PHOTOS } from "./pick";

// "picking" = claimed by a run; if that run died, it's free again after 10 minutes
const claimable = or(
  eq(property.photoStatus, "pending"),
  and(eq(property.photoStatus, "picking"), lt(property.updatedAt, sql`now() - interval '10 minutes'`)),
);
const pending = and(claimable, eq(property.geocodeStatus, "ok"), isNotNull(property.lat));

export async function countPhotoPending() {
  if (!placesEnabled()) return 0;
  const [r] = await getDb().select({ n: sql<number>`count(*)::int` }).from(property).where(pending);
  return r.n;
}

const ext = (type: string) => (type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg");

async function keep(propertyId: number, placeId: string, index: number, ph: PhotoMeta, img: { type: string; bytes: Uint8Array }) {
  const url = await getBlobStore().put(`photos/property-${propertyId}-${index}.${ext(img.type)}`, img.bytes, img.type);
  await getDb()
    .update(property)
    .set({
      photoStatus: "google",
      googlePlaceId: placeId,
      photoIndex: index,
      photoUrl: url,
      photoCredit: ph.author,
      photoCreditUrl: ph.authorUri,
      photoError: null,
      updatedAt: new Date(),
    })
    .where(eq(property.id, propertyId));
}

/** Downloads the place's nth photo and keeps it (the admin's "next photo"). */
export async function saveGooglePhoto(propertyId: number, placeId: string, index: number) {
  const photos = await placePhotos(placeId);
  if (!photos.length) return false;
  const i = index % photos.length;
  await keep(propertyId, placeId, i, photos[i], await downloadPhoto(photos[i]));
  return true;
}

/**
 * Has Claude pick the place photo that best shows the resort (see pick.ts for the rule). Looks at
 * the first CANDIDATES photos; if none of them is the ideal kind for this resort, at all of them
 * (Google lists up to 10). Null if no photo shows the resort itself.
 */
async function pickGooglePhoto(name: string, placeId: string) {
  const photos = (await placePhotos(placeId)).slice(0, MAX_PHOTOS);
  const images: { type: string; bytes: Uint8Array }[] = [];
  for (const ph of photos.slice(0, CANDIDATES)) images.push(await downloadPhoto(ph));
  let choice = await choosePhoto(name, images);
  if (!choice?.ideal && photos.length > images.length) {
    for (const ph of photos.slice(images.length)) images.push(await downloadPhoto(ph));
    choice = await choosePhoto(name, images); // judged again together, so the best of all wins
  }
  return choice?.showsProperty ? { index: choice.index, photo: photos[choice.index], image: images[choice.index] } : null;
}

/**
 * Finds and keeps a photo for each located resort that has none yet: the best of the resort's
 * Google photos that actually shows it (chosen by Claude), else none. Runs once per resort, so
 * new lists of the same resorts download nothing. Resumable; stops for the month at the photo cap.
 * `ids` limits it to those resorts (a one-off re-pick).
 */
export async function runPhotoBatch(budgetMs = 40_000, ids?: number[]) {
  const start = Date.now();
  const db = getDb();
  const rows = await db.select().from(property).where(ids ? and(pending, inArray(property.id, ids)) : pending).limit(200);
  let processed = 0;
  let capReached = false;
  for (const p of rows) {
    if (Date.now() - start >= budgetMs) break;
    // only start a resort if all its downloads fit this month
    if ((await photoUsage()) + MAX_PHOTOS > PHOTO_CAP) {
      capReached = true;
      break;
    }
    // claim it, so two runs never pick (and pay for) the same resort
    const [claimed] = await db
      .update(property)
      .set({ photoStatus: "picking", updatedAt: new Date() })
      .where(and(eq(property.id, p.id), claimable))
      .returning({ id: property.id });
    if (!claimed) continue;
    try {
      const placeId = await findPlaceId({ ...p, lat: p.lat!, lng: p.lng! });
      const g = placeId ? await pickGooglePhoto(p.name, placeId) : null;
      if (g) await keep(p.id, placeId!, g.index, g.photo, g.image);
      else
        // no photo shows the resort: the card shows its plain placeholder instead
        await db
          .update(property)
          .set({ photoStatus: "none", googlePlaceId: placeId, photoUrl: null, photoCredit: null, photoCreditUrl: null, photoError: null, updatedAt: new Date() })
          .where(eq(property.id, p.id));
    } catch (e) {
      if (e instanceof PhotoCapError) {
        capReached = true; // back to pending; picked up next month
        await db.update(property).set({ photoStatus: "pending" }).where(eq(property.id, p.id));
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

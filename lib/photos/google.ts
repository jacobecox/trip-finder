import { and, eq, sql } from "drizzle-orm";
import { apiUsage, getDb } from "@/lib/db";
import { distanceKm } from "@/lib/geo/util";

/**
 * Resort photos from Google Places (New). Finding the place (Text Search, ids + location) and
 * listing its photos (Place Details, photos only) are free. Downloading a photo is billed
 * (1,000 free a month), so each resort's photo is downloaded once, when the resort is first seen,
 * and kept; downloads are counted and stop at PHOTO_CAP a month.
 */
const BASE = "https://places.googleapis.com/v1";
// a month, under the 1,000 free; PHOTO_CAP in the env raises it for a one-off local run
export const PHOTO_CAP = Number(process.env.PHOTO_CAP) || 900;
export const PHOTO_WIDTH = 1000; // one size serves cards, map and trip page
const SERVICE = "places-photo";

export class PhotoCapError extends Error {}

const key = () => {
  const k = process.env.GOOGLE_PLACES_API_KEY;
  if (!k) throw new Error("GOOGLE_PLACES_API_KEY is not set");
  return k;
};
export const placesEnabled = () => !!process.env.GOOGLE_PLACES_API_KEY;

/**
 * The Google place for a resort: the first Text Search result within 30 km of where we located it
 * (our pin may be the town's center). Null when there's no match nearby.
 */
export async function findPlaceId(p: { name: string; city: string; state: string; country: string; lat: number; lng: number }) {
  const res = await fetch(`${BASE}/places:searchText`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key(),
      "X-Goog-FieldMask": "places.id,places.location",
    },
    body: JSON.stringify({
      textQuery: [p.name, p.city, p.state, p.country].filter(Boolean).join(", "),
      locationBias: { circle: { center: { latitude: p.lat, longitude: p.lng }, radius: 30_000 } },
      pageSize: 5,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Places search ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { places?: { id: string; location?: { latitude: number; longitude: number } }[] };
  const near = (body.places ?? []).find(
    (x) => !x.location || distanceKm({ lat: p.lat, lng: p.lng }, { lat: x.location.latitude, lng: x.location.longitude }) <= 30,
  );
  return near?.id ?? null;
}

export interface PhotoMeta {
  name: string;
  author: string | null;
  authorUri: string | null;
}

/** The place's photos with who took them (shown with the photo, as Google requires). */
export async function placePhotos(placeId: string): Promise<PhotoMeta[]> {
  const res = await fetch(`${BASE}/places/${encodeURIComponent(placeId)}`, {
    headers: { "X-Goog-Api-Key": key(), "X-Goog-FieldMask": "photos" },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`Place details ${res.status}`);
  const body = (await res.json()) as {
    photos?: { name: string; authorAttributions?: { displayName?: string; uri?: string }[] }[];
  };
  return (body.photos ?? []).map((ph) => ({
    name: ph.name,
    author: ph.authorAttributions?.[0]?.displayName ?? null,
    authorUri: ph.authorAttributions?.[0]?.uri ?? null,
  }));
}

const month = () => new Date().toISOString().slice(0, 7);

export async function photoUsage() {
  const [r] = await getDb()
    .select({ count: apiUsage.count })
    .from(apiUsage)
    .where(and(eq(apiUsage.service, SERVICE), eq(apiUsage.month, month())));
  return r?.count ?? 0;
}

async function countPhoto() {
  await getDb()
    .insert(apiUsage)
    .values({ service: SERVICE, month: month(), count: 1 })
    .onConflictDoUpdate({ target: [apiUsage.service, apiUsage.month], set: { count: sql`${apiUsage.count} + 1` } });
}

/** Downloads one photo (billed, counted). Throws PhotoCapError past the monthly cap. */
export async function downloadPhoto(photo: PhotoMeta): Promise<{ type: string; bytes: Uint8Array }> {
  if ((await photoUsage()) >= PHOTO_CAP) throw new PhotoCapError("monthly photo cap reached");
  await countPhoto();
  const res = await fetch(`${BASE}/${photo.name}/media?maxWidthPx=${PHOTO_WIDTH}`, {
    headers: { "X-Goog-Api-Key": key() },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Place photo ${res.status}`);
  return { type: res.headers.get("content-type") ?? "image/jpeg", bytes: new Uint8Array(await res.arrayBuffer()) };
}

import { and, desc, eq, lt, ne, sql } from "drizzle-orm";
import { getDb, listing, listingsUpload, property, propertyTag, settings } from "@/lib/db";
import { effectiveTags, isUntagged, type TagRow } from "@/lib/tags/effective";
import { airportsByProperty, faresFor } from "@/lib/flights/fares";

async function tagRowsByProperty() {
  const rows = await getDb()
    .select({
      propertyId: propertyTag.propertyId,
      tag: propertyTag.tag,
      osm: propertyTag.osm,
      osmEvidence: propertyTag.osmEvidence,
      manual: propertyTag.manual,
    })
    .from(propertyTag);
  const map = new Map<number, TagRow[]>();
  for (const { propertyId, ...r } of rows) map.set(propertyId, [...(map.get(propertyId) ?? []), r]);
  return map;
}

export async function getSettings() {
  const db = getDb();
  await db.insert(settings).values({ id: 1 }).onConflictDoNothing();
  const [row] = await db.select().from(settings).where(eq(settings.id, 1));
  return row;
}

export async function getLatestUpload() {
  const [row] = await getDb().select().from(listingsUpload).orderBy(desc(listingsUpload.id)).limit(1);
  return row ?? null;
}

/**
 * What changed since the last different list (a re-upload of the same file doesn't count): stays
 * not on it are new, and stays that got cheaper carry the drop. Matched by the exchange's inventory
 * number, which stays the same across lists. Null on the first list, when there's nothing to compare.
 */
async function previousList(current: { id: number; filename: string }) {
  const db = getDb();
  const [prev] = await db
    .select({ id: listingsUpload.id, filename: listingsUpload.filename })
    .from(listingsUpload)
    .where(and(lt(listingsUpload.id, current.id), ne(listingsUpload.filename, current.filename)))
    .orderBy(desc(listingsUpload.id))
    .limit(1);
  if (!prev) return null;
  const rows = await db
    .select({ inventoryNumber: listing.inventoryNumber, priceUsd: listing.priceUsd })
    .from(listing)
    .where(eq(listing.uploadId, prev.id));
  return { filename: prev.filename, prices: new Map(rows.map((r) => [r.inventoryNumber, r.priceUsd])) };
}

export async function getCurrentListings() {
  const upload = await getLatestUpload();
  if (!upload) return { upload: null, previous: null, rows: [] };
  const rows = await getDb()
    .select({
      id: listing.id,
      inventoryNumber: listing.inventoryNumber,
      arrivalDate: listing.arrivalDate,
      checkoutDate: listing.checkoutDate,
      unitType: listing.unitType,
      priceUsd: listing.priceUsd,
      propertyId: property.id,
      property: property.name,
      city: property.city,
      state: property.state,
      country: property.country,
      countryCode: property.countryCode,
      driveHours: property.driveHours,
      isDrivable: property.isDrivable,
      geocodeStatus: property.geocodeStatus,
      lat: property.lat,
      lng: property.lng,
      driveMiles: property.driveMiles,
      tagStatus: property.tagStatus,
      tagsReviewed: property.tagsReviewed,
    })
    .from(listing)
    .innerJoin(property, eq(listing.propertyId, property.id))
    .where(eq(listing.uploadId, upload.id))
    .orderBy(listing.arrivalDate, listing.id);
  const [tagMap, s, prev] = await Promise.all([tagRowsByProperty(), getSettings(), previousList(upload)]);
  const fares = await faresFor(rows, s);
  return {
    upload,
    previous: prev && { filename: prev.filename },
    rows: rows.map((r) => {
      const tags = effectiveTags(tagMap.get(r.propertyId) ?? []);
      const before = prev?.prices.get(r.inventoryNumber);
      return {
        ...r,
        tags,
        untagged: isUntagged(r, tags),
        fare: fares.get(r) ?? null,
        isNew: !!prev && before == null,
        priceDropUsd: before != null && before > r.priceUsd ? before - r.priceUsd : 0,
      };
    }),
  };
}

export async function getPropertiesWithCounts() {
  const [rows, tagMap] = await Promise.all([propertyRows(), tagRowsByProperty()]);
  const airports = await airportsByProperty(rows.map((r) => r.id));
  return rows.map((r) => {
    const tagRows = tagMap.get(r.id) ?? [];
    const tags = effectiveTags(tagRows);
    const airportRows = (airports.get(r.id) ?? []).map(({ iata, driveHours, auto, pinned, excluded }) => ({
      iata,
      driveHours,
      auto,
      pinned,
      excluded,
    }));
    return { ...r, tagRows, tags, untagged: isUntagged(r, tags), airportRows };
  });
}

function propertyRows() {
  return getDb()
    .select({
      id: property.id,
      name: property.name,
      city: property.city,
      state: property.state,
      country: property.country,
      lat: property.lat,
      lng: property.lng,
      geocodeSource: property.geocodeSource,
      geocodeStatus: property.geocodeStatus,
      geocodeError: property.geocodeError,
      driveHours: property.driveHours,
      driveMiles: property.driveMiles,
      isDrivable: property.isDrivable,
      latLngOverridden: property.latLngOverridden,
      driveOverridden: property.driveOverridden,
      tagStatus: property.tagStatus,
      tagError: property.tagError,
      tagsReviewed: property.tagsReviewed,
      airportStatus: property.airportStatus,
      airportError: property.airportError,
      listingCount: sql<number>`(select count(*)::int from ${listing} where ${listing.propertyId} = ${property.id})`,
    })
    .from(property)
    .orderBy(property.name);
}

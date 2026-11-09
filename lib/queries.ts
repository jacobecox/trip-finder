import { desc, eq, sql } from "drizzle-orm";
import { getDb, listing, listingsUpload, property, settings } from "@/lib/db";

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

export async function getCurrentListings() {
  const upload = await getLatestUpload();
  if (!upload) return { upload: null, rows: [] };
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
    })
    .from(listing)
    .innerJoin(property, eq(listing.propertyId, property.id))
    .where(eq(listing.uploadId, upload.id))
    .orderBy(listing.arrivalDate, listing.id);
  return { upload, rows };
}

export async function getPropertiesWithCounts() {
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
      listingCount: sql<number>`(select count(*)::int from ${listing} where ${listing.propertyId} = ${property.id})`,
    })
    .from(property)
    .orderBy(property.name);
}

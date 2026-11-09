import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const listingsUpload = pgTable("listings_upload", {
  id: serial("id").primaryKey(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  blobUrl: text("blob_url").notNull(),
  filename: text("filename").notNull(),
  rowCount: integer("row_count").notNull().default(0),
  warningCount: integer("warning_count").notNull().default(0),
  warnings: text("warnings"), // JSON-encoded ParseWarning[]
});

export const property = pgTable(
  "property",
  {
    id: serial("id").primaryKey(),
    // lowercase/trimmed "name|city|state|country_code"; unique identity
    normalizedKey: text("normalized_key").notNull(),
    name: text("name").notNull(),
    city: text("city").notNull(),
    state: text("state").notNull().default(""),
    countryCode: text("country_code").notNull(),
    country: text("country").notNull(),

    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    geocodeSource: text("geocode_source"), // 'ors' | 'manual'
    // pending | ok | failed
    geocodeStatus: text("geocode_status").notNull().default("pending"),
    geocodeError: text("geocode_error"),

    driveHours: real("drive_hours"),
    driveMiles: real("drive_miles"),
    isDrivable: boolean("is_drivable").notNull().default(false),

    // manual overrides survive re-geocoding
    latLngOverridden: boolean("lat_lng_overridden").notNull().default(false),
    driveOverridden: boolean("drive_overridden").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("property_normalized_key_idx").on(t.normalizedKey)],
);

export const listing = pgTable(
  "listing",
  {
    id: serial("id").primaryKey(),
    uploadId: integer("upload_id")
      .notNull()
      .references(() => listingsUpload.id, { onDelete: "cascade" }),
    inventoryNumber: text("inventory_number").notNull(),
    propertyId: integer("property_id")
      .notNull()
      .references(() => property.id),
    arrivalDate: date("arrival_date", { mode: "string" }).notNull(),
    checkoutDate: date("checkout_date", { mode: "string" }).notNull(),
    unitType: text("unit_type").notNull(),
    priceUsd: integer("price_usd").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("listing_upload_inventory_idx").on(t.uploadId, t.inventoryNumber),
    index("listing_property_idx").on(t.propertyId),
  ],
);

// Single-row table (id is always 1)
export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  originLabel: text("origin_label").notNull().default("Colorado Springs, CO"),
  originLat: doublePrecision("origin_lat").notNull().default(38.8339),
  originLng: doublePrecision("origin_lng").notNull().default(-104.8214),
  maxDriveHours: real("max_drive_hours").notNull().default(8),
});

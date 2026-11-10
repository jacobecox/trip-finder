import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { DEFAULT_TAG_WEIGHTS, type Tag, type TagWeights } from "@/lib/tags/constants";

export { TAGS, DEFAULT_TAG_WEIGHTS, type Tag, type TagWeights } from "@/lib/tags/constants";

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

    // activity tagging (OSM): pending | ok | failed
    tagStatus: text("tag_status").notNull().default("pending"),
    tagError: text("tag_error"),
    // user confirmed the tags (also clears the "untagged" flag for places with no activities)
    tagsReviewed: boolean("tags_reviewed").notNull().default(false),

    // candidate arrival airports (property_airport): pending | ok | failed
    airportStatus: text("airport_status").notNull().default("pending"),
    airportError: text("airport_error"),

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


/**
 * One row per (property, tag). Auto (OSM) and manual results are kept separately;
 * the effective value is manual ?? osm, so re-tagging never overwrites a manual choice.
 */
export const propertyTag = pgTable(
  "property_tag",
  {
    id: serial("id").primaryKey(),
    propertyId: integer("property_id")
      .notNull()
      .references(() => property.id, { onDelete: "cascade" }),
    tag: text("tag").$type<Tag>().notNull(),
    osm: boolean("osm"),
    osmEvidence: text("osm_evidence"),
    manual: boolean("manual"),
  },
  (t) => [uniqueIndex("property_tag_unique_idx").on(t.propertyId, t.tag)],
);

/**
 * Arrival airports considered for a property, with drive time from the airport to the lodging.
 * Auto rows are rebuilt when the location changes; pinned/excluded are manual and kept.
 */
export const propertyAirport = pgTable(
  "property_airport",
  {
    id: serial("id").primaryKey(),
    propertyId: integer("property_id")
      .notNull()
      .references(() => property.id, { onDelete: "cascade" }),
    iata: text("iata").notNull(),
    driveHours: real("drive_hours"),
    driveMiles: real("drive_miles"),
    auto: boolean("auto").notNull().default(true), // chosen by the candidate rules
    pinned: boolean("pinned").notNull().default(false), // always search this one
    excluded: boolean("excluded").notNull().default(false), // never search this one
  },
  (t) => [uniqueIndex("property_airport_unique_idx").on(t.propertyId, t.iata)],
);

export interface FareOption {
  iata: string; // arrival airport
  origin?: string; // departure airport (missing on quotes saved before DEN support = the search origin)
  priceUsd: number; // round trip, all passengers
  airline: string;
  stops: number;
  durationMin: number; // outbound, door to door in the air incl. layovers
  layovers?: { iata: string; minutes: number; overnight?: boolean }[]; // outbound; missing on older quotes
}

/** Cached SerpApi Google Flights result for one search (origin -> several airports, dates, passengers). */
export const flightQuote = pgTable(
  "flight_quote",
  {
    id: serial("id").primaryKey(),
    origin: text("origin").notNull(), // e.g. "COS"
    airports: text("airports").notNull(), // sorted, comma-separated arrival IATA codes
    outboundDate: date("outbound_date", { mode: "string" }).notNull(),
    returnDate: date("return_date", { mode: "string" }).notNull(),
    passengers: text("passengers").notNull(), // "adults/children/lap infants", e.g. "2/1/1"
    status: text("status").notNull(), // ok | none (no flights) | failed
    error: text("error"),
    options: jsonb("options").$type<FareOption[]>().notNull().default([]), // cheapest per airport
    searchUrl: text("search_url"), // Google Flights page for the same search
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("flight_quote_key_idx").on(t.origin, t.airports, t.outboundDate, t.returnDate, t.passengers)],
);

/** Searches spent per service per month (SerpApi free tier is 250/month). */
export const apiUsage = pgTable(
  "api_usage",
  {
    service: text("service").notNull(),
    month: text("month").notNull(), // YYYY-MM (UTC)
    count: integer("count").notNull().default(0),
  },
  (t) => [uniqueIndex("api_usage_key_idx").on(t.service, t.month)],
);

// Single-row table (id is always 1)
export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  originLabel: text("origin_label").notNull().default("Colorado Springs, CO"),
  originLat: doublePrecision("origin_lat").notNull().default(38.8339),
  originLng: doublePrecision("origin_lng").notNull().default(-104.8214),
  maxDriveHours: real("max_drive_hours").notNull().default(8),

  // scoring: final = (costWeight*cost + activityWeight*activity) / (costWeight + activityWeight)
  costWeight: real("cost_weight").notNull().default(0.75),
  activityWeight: real("activity_weight").notNull().default(0.25),
  tagWeights: jsonb("tag_weights").$type<TagWeights>().notNull().default(DEFAULT_TAG_WEIGHTS),

  // trip cost inputs (USD, miles)
  tickets: integer("tickets").notNull().default(3),
  mpg: real("mpg").notNull().default(25),
  gasPriceUsd: real("gas_price_usd").notNull().default(3.5),
  // rough round-trip fare estimate per ticket until real flight prices (Phase 3)
  flightBaseUsd: real("flight_base_usd").notNull().default(120),
  flightPerMileUsd: real("flight_per_mile_usd").notNull().default(0.1),

  // real fares (SerpApi Google Flights)
  originAirport: text("origin_airport").notNull().default("COS"),
  lapInfants: integer("lap_infants").notNull().default(1), // in addition to `tickets` seats
  airportMaxDriveHours: real("airport_max_drive_hours").notNull().default(2.5),
  hubMaxDriveHours: real("hub_max_drive_hours").notNull().default(4), // nearest big airport, if none closer
  maxAirports: integer("max_airports").notNull().default(7), // Google Flights' per-search limit
  extraDriveUsdPerHour: real("extra_drive_usd_per_hour").notNull().default(25),
  serpapiMonthlyCap: integer("serpapi_monthly_cap").notNull().default(240),
  // second departure airport searched in the same request ("" = off); its cost adds the drive from home + parking
  altOriginAirport: text("alt_origin_airport").notNull().default("DEN"),
  altOriginDriveHours: real("alt_origin_drive_hours").notNull().default(1.4), // home -> airport, one way
  altOriginDriveMiles: real("alt_origin_drive_miles").notNull().default(85),
  altOriginParkingUsdPerDay: real("alt_origin_parking_usd_per_day").notNull().default(10),
  fareCacheHours: integer("fare_cache_hours").notNull().default(24),
});

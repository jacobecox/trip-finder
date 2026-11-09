CREATE TABLE "listing" (
	"id" serial PRIMARY KEY NOT NULL,
	"upload_id" integer NOT NULL,
	"inventory_number" text NOT NULL,
	"property_id" integer NOT NULL,
	"arrival_date" date NOT NULL,
	"checkout_date" date NOT NULL,
	"unit_type" text NOT NULL,
	"price_usd" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listings_upload" (
	"id" serial PRIMARY KEY NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"blob_url" text NOT NULL,
	"filename" text NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"warning_count" integer DEFAULT 0 NOT NULL,
	"warnings" text
);
--> statement-breakpoint
CREATE TABLE "property" (
	"id" serial PRIMARY KEY NOT NULL,
	"normalized_key" text NOT NULL,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"state" text DEFAULT '' NOT NULL,
	"country_code" text NOT NULL,
	"country" text NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"geocode_source" text,
	"geocode_status" text DEFAULT 'pending' NOT NULL,
	"geocode_error" text,
	"drive_hours" real,
	"drive_miles" real,
	"is_drivable" boolean DEFAULT false NOT NULL,
	"lat_lng_overridden" boolean DEFAULT false NOT NULL,
	"drive_overridden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"origin_label" text DEFAULT 'Colorado Springs, CO' NOT NULL,
	"origin_lat" double precision DEFAULT 38.8339 NOT NULL,
	"origin_lng" double precision DEFAULT -104.8214 NOT NULL,
	"max_drive_hours" real DEFAULT 8 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "listing" ADD CONSTRAINT "listing_upload_id_listings_upload_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."listings_upload"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing" ADD CONSTRAINT "listing_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "listing_upload_inventory_idx" ON "listing" USING btree ("upload_id","inventory_number");--> statement-breakpoint
CREATE INDEX "listing_property_idx" ON "listing" USING btree ("property_id");--> statement-breakpoint
CREATE UNIQUE INDEX "property_normalized_key_idx" ON "property" USING btree ("normalized_key");
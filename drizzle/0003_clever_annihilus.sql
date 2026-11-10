CREATE TABLE "api_usage" (
	"service" text NOT NULL,
	"month" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flight_quote" (
	"id" serial PRIMARY KEY NOT NULL,
	"origin" text NOT NULL,
	"airports" text NOT NULL,
	"outbound_date" date NOT NULL,
	"return_date" date NOT NULL,
	"passengers" text NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"search_url" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "property_airport" (
	"id" serial PRIMARY KEY NOT NULL,
	"property_id" integer NOT NULL,
	"iata" text NOT NULL,
	"drive_hours" real,
	"drive_miles" real,
	"auto" boolean DEFAULT true NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"excluded" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "property" ADD COLUMN "airport_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "property" ADD COLUMN "airport_error" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "origin_airport" text DEFAULT 'COS' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "lap_infants" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "airport_max_drive_hours" real DEFAULT 2.5 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "hub_max_drive_hours" real DEFAULT 4 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "max_airports" integer DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "extra_drive_usd_per_hour" real DEFAULT 25 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "serpapi_monthly_cap" integer DEFAULT 240 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "fare_cache_hours" integer DEFAULT 24 NOT NULL;--> statement-breakpoint
ALTER TABLE "property_airport" ADD CONSTRAINT "property_airport_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "api_usage_key_idx" ON "api_usage" USING btree ("service","month");--> statement-breakpoint
CREATE UNIQUE INDEX "flight_quote_key_idx" ON "flight_quote" USING btree ("origin","airports","outbound_date","return_date","passengers");--> statement-breakpoint
CREATE UNIQUE INDEX "property_airport_unique_idx" ON "property_airport" USING btree ("property_id","iata");
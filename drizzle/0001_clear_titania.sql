CREATE TABLE "property_tag" (
	"id" serial PRIMARY KEY NOT NULL,
	"property_id" integer NOT NULL,
	"tag" text NOT NULL,
	"osm" boolean,
	"osm_evidence" text,
	"manual" boolean
);
--> statement-breakpoint
ALTER TABLE "property" ADD COLUMN "tag_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "property" ADD COLUMN "tag_error" text;--> statement-breakpoint
ALTER TABLE "property" ADD COLUMN "tags_reviewed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "cost_weight" real DEFAULT 0.75 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "activity_weight" real DEFAULT 0.25 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "tag_weights" jsonb DEFAULT '{"kid_friendly":3,"beach":2,"theme_park":2,"hiking":1,"skiing":1}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "tickets" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "mpg" real DEFAULT 25 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "gas_price_usd" real DEFAULT 3.5 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "flight_base_usd" real DEFAULT 120 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "flight_per_mile_usd" real DEFAULT 0.1 NOT NULL;--> statement-breakpoint
ALTER TABLE "property_tag" ADD CONSTRAINT "property_tag_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "property_tag_unique_idx" ON "property_tag" USING btree ("property_id","tag");
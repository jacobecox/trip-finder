CREATE TABLE "stay_climate" (
	"property_id" integer NOT NULL,
	"start_md" text NOT NULL,
	"nights" integer NOT NULL,
	"stats" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stay_climate" ADD CONSTRAINT "stay_climate_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stay_climate_key" ON "stay_climate" USING btree ("property_id","start_md","nights");
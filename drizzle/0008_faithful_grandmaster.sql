ALTER TABLE "property" ADD COLUMN "photo_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "property" ADD COLUMN "photo_error" text;--> statement-breakpoint
ALTER TABLE "property" ADD COLUMN "google_place_id" text;--> statement-breakpoint
ALTER TABLE "property" ADD COLUMN "photo_index" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "property" ADD COLUMN "photo_url" text;--> statement-breakpoint
ALTER TABLE "property" ADD COLUMN "photo_credit" text;--> statement-breakpoint
ALTER TABLE "property" ADD COLUMN "photo_credit_url" text;
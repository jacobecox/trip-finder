ALTER TABLE "listings_upload" ADD COLUMN "source" text DEFAULT 'upload' NOT NULL;--> statement-breakpoint
ALTER TABLE "listings_upload" ADD COLUMN "content_hash" text;--> statement-breakpoint
ALTER TABLE "listings_upload" ADD COLUMN "digest_sent_at" timestamp with time zone;
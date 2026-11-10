ALTER TABLE "settings" ADD COLUMN "alt_origin_airport" text DEFAULT 'DEN' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "alt_origin_drive_hours" real DEFAULT 1.4 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "alt_origin_drive_miles" real DEFAULT 85 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "alt_origin_parking_usd_per_day" real DEFAULT 10 NOT NULL;
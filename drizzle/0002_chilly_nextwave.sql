ALTER TABLE "settings" ALTER COLUMN "tag_weights" SET DEFAULT '{"beach":2,"theme_park":2,"zoo_aquarium":2,"hiking":1,"skiing":1,"scenic":1,"city":0}'::jsonb;--> statement-breakpoint
-- "kid_friendly" is now "zoo_aquarium" (same detection, clearer name)
UPDATE "property_tag" SET "tag" = 'zoo_aquarium' WHERE "tag" = 'kid_friendly';--> statement-breakpoint
UPDATE "settings" SET "tag_weights" = ("tag_weights" - 'kid_friendly') || jsonb_build_object(
  'zoo_aquarium', COALESCE(("tag_weights"->>'kid_friendly')::real, 2), 'scenic', 1, 'city', 0
);--> statement-breakpoint
-- new tags (scenic, city) need every located property re-tagged; manual choices are kept
UPDATE "property" SET "tag_status" = 'pending' WHERE "tag_status" IN ('ok', 'failed');

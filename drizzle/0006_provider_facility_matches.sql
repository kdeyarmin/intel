-- Fields the matching page already reads and writes (they were silently
-- dropped before), plus facility_id for provider ↔ Medicare facility matches.
-- provider_location_matches is a small table.
ALTER TABLE "provider_location_matches" ADD COLUMN IF NOT EXISTS "facility_id" integer;
--> statement-breakpoint
ALTER TABLE "provider_location_matches" ADD COLUMN IF NOT EXISTS "provider_name" text;
--> statement-breakpoint
ALTER TABLE "provider_location_matches" ADD COLUMN IF NOT EXISTS "location_display" text;
--> statement-breakpoint
ALTER TABLE "provider_location_matches" ADD COLUMN IF NOT EXISTS "match_reasons" jsonb;
--> statement-breakpoint
ALTER TABLE "provider_location_matches" ADD COLUMN IF NOT EXISTS "address_match_score" double precision;
--> statement-breakpoint
ALTER TABLE "provider_location_matches" ADD COLUMN IF NOT EXISTS "proximity_score" double precision;
--> statement-breakpoint
ALTER TABLE "provider_location_matches" ADD COLUMN IF NOT EXISTS "specialization_score" double precision;
--> statement-breakpoint
ALTER TABLE "provider_location_matches" ADD COLUMN IF NOT EXISTS "referral_score" double precision;
--> statement-breakpoint
ALTER TABLE "provider_location_matches" ADD COLUMN IF NOT EXISTS "name_match_score" double precision;
--> statement-breakpoint
ALTER TABLE "provider_location_matches" ADD COLUMN IF NOT EXISTS "override_notes" text;
--> statement-breakpoint
-- The page's statuses are suggested/approved/rejected/override; "pending" rows showed unstyled.
ALTER TABLE "provider_location_matches" ALTER COLUMN "status" SET DEFAULT 'suggested';
--> statement-breakpoint
UPDATE "provider_location_matches" SET "status" = 'suggested' WHERE "status" = 'pending' OR "status" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_location_matches_npi_idx" ON "provider_location_matches" ("npi");

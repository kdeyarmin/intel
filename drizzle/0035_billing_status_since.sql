-- When the organization's current billing status began. The dunning ladder
-- (orgAccessTier in server/lib/entitlements.ts) reads it: a past_due
-- organization keeps read-only access for 14 days from this moment, then
-- drops to billing-only until it pays. applyStripeEvent moves it on every
-- status transition. Existing rows start the clock at their last update —
-- the safer backfill, since it can only ever give an organization more
-- read-only time than a guess at the true transition date would.
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "billing_status_since" timestamp;
--> statement-breakpoint
UPDATE "organizations" SET "billing_status_since" = COALESCE("updated_date", "created_date", now()) WHERE "billing_status_since" IS NULL;

-- The time of the last Stripe event applied to an organization, so a late or
-- repeated event for an older state can't undo a newer one.
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "stripe_event_at" timestamp;

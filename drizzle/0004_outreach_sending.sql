-- Real campaign sending: delivery tracking, unsubscribe/bounce suppression and
-- outreach-score details. New columns are nullable (catalog-only changes, even
-- on providers); IF NOT EXISTS keeps this safe for databases synced with db:push.
CREATE TABLE IF NOT EXISTS "email_suppressions" (
	"email" varchar(255) PRIMARY KEY NOT NULL,
	"reason" varchar(50),
	"source" varchar(50),
	"created_date" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "outreach_messages" ADD COLUMN IF NOT EXISTS "responded_at" timestamp;
--> statement-breakpoint
ALTER TABLE "outreach_messages" ADD COLUMN IF NOT EXISTS "provider_message_id" varchar(255);
--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "ai_outreach_strategy" text;
--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "ai_engagement_factors" jsonb;
--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "ai_outreach_scored_at" timestamp;
--> statement-breakpoint
-- Unsubscribes and bounces suppress pending messages by lower(recipient_email).
CREATE INDEX IF NOT EXISTS "messages_pending_email_idx" ON "outreach_messages" (lower("recipient_email")) WHERE "status" = 'pending';

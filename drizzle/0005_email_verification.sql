-- DNS/MX email verification results on providers. All nullable, so these are
-- catalog-only changes even on the ~6M-row providers table.
ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "email_quality_score" integer;
--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "email_quality_confidence" varchar(20);
--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "email_quality_reasons" jsonb;
--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "email_quality_risk_flags" jsonb;
--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "email_analyzed_at" timestamp;

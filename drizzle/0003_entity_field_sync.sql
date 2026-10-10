-- Columns the UI has always written but the schema never had, so the generic
-- entity API silently dropped them (saved-filter defaults, report favourites,
-- alert analysis, affiliation details, pause timestamps, ...). All nullable or
-- constant-defaulted, so each ADD COLUMN is a catalog-only change even on large
-- tables. IF NOT EXISTS keeps this safe for databases synced with db:push.
ALTER TABLE "data_quality_alerts" ADD COLUMN IF NOT EXISTS "npi" varchar(20);
--> statement-breakpoint
ALTER TABLE "data_quality_alerts" ADD COLUMN IF NOT EXISTS "rule_id" varchar(100);
--> statement-breakpoint
ALTER TABLE "data_quality_alerts" ADD COLUMN IF NOT EXISTS "rule_name" text;
--> statement-breakpoint
ALTER TABLE "data_quality_alerts" ADD COLUMN IF NOT EXISTS "category" varchar(100);
--> statement-breakpoint
ALTER TABLE "data_quality_alerts" ADD COLUMN IF NOT EXISTS "entity_type" varchar(100);
--> statement-breakpoint
ALTER TABLE "data_quality_alerts" ADD COLUMN IF NOT EXISTS "field_name" varchar(255);
--> statement-breakpoint
ALTER TABLE "data_quality_alerts" ADD COLUMN IF NOT EXISTS "summary" text;
--> statement-breakpoint
ALTER TABLE "data_quality_alerts" ADD COLUMN IF NOT EXISTS "suggestion_reason" text;
--> statement-breakpoint
ALTER TABLE "data_quality_alerts" ADD COLUMN IF NOT EXISTS "affected_count" integer;
--> statement-breakpoint
ALTER TABLE "data_quality_alerts" ADD COLUMN IF NOT EXISTS "scan_batch_id" varchar(100);
--> statement-breakpoint
ALTER TABLE "data_quality_alerts" ADD COLUMN IF NOT EXISTS "ai_root_cause" text;
--> statement-breakpoint
ALTER TABLE "data_quality_alerts" ADD COLUMN IF NOT EXISTS "ai_solutions" jsonb;
--> statement-breakpoint
ALTER TABLE "data_quality_alerts" ADD COLUMN IF NOT EXISTS "ai_impact_assessment" text;
--> statement-breakpoint
ALTER TABLE "data_quality_alerts" ADD COLUMN IF NOT EXISTS "ai_analyzed_at" timestamp;
--> statement-breakpoint
ALTER TABLE "saved_filters" ADD COLUMN IF NOT EXISTS "is_default" boolean DEFAULT false;
--> statement-breakpoint
ALTER TABLE "custom_reports" ADD COLUMN IF NOT EXISTS "is_favorite" boolean DEFAULT false;
--> statement-breakpoint
ALTER TABLE "enrichment_records" ADD COLUMN IF NOT EXISTS "reviewed_by" varchar(255);
--> statement-breakpoint
ALTER TABLE "enrichment_records" ADD COLUMN IF NOT EXISTS "reviewed_at" timestamp;
--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN IF NOT EXISTS "paused_at" timestamp;
--> statement-breakpoint
ALTER TABLE "column_mapping_rules" ADD COLUMN IF NOT EXISTS "source" varchar(50);
--> statement-breakpoint
ALTER TABLE "column_mapping_rules" ADD COLUMN IF NOT EXISTS "times_used" integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "column_mapping_rules" ADD COLUMN IF NOT EXISTS "last_used_at" timestamp;
--> statement-breakpoint
ALTER TABLE "provider_affiliations" ADD COLUMN IF NOT EXISTS "role" varchar(255);
--> statement-breakpoint
ALTER TABLE "provider_affiliations" ADD COLUMN IF NOT EXISTS "city" varchar(100);
--> statement-breakpoint
ALTER TABLE "provider_affiliations" ADD COLUMN IF NOT EXISTS "state" varchar(10);
--> statement-breakpoint
ALTER TABLE "provider_affiliations" ADD COLUMN IF NOT EXISTS "confidence" varchar(20);
--> statement-breakpoint
ALTER TABLE "provider_affiliations" ADD COLUMN IF NOT EXISTS "status" varchar(50);
--> statement-breakpoint
ALTER TABLE "provider_affiliations" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true;
--> statement-breakpoint
ALTER TABLE "provider_affiliations" ADD COLUMN IF NOT EXISTS "is_primary" boolean DEFAULT false;
--> statement-breakpoint
ALTER TABLE "provider_affiliations" ADD COLUMN IF NOT EXISTS "notes" text;
--> statement-breakpoint
ALTER TABLE "outreach_campaigns" ADD COLUMN IF NOT EXISTS "total_recipients" integer;
--> statement-breakpoint
ALTER TABLE "outreach_messages" ADD COLUMN IF NOT EXISTS "recipient_name" varchar(255);
--> statement-breakpoint
ALTER TABLE "scheduled_exports" ADD COLUMN IF NOT EXISTS "config" jsonb;

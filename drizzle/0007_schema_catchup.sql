-- 0001_mute_star_brand.sql and 0002_cynical_hellfire_club.sql were never
-- added to the journal, so a database built with `db:migrate` never got these
-- columns (databases built with `db:push` have them). Re-applied idempotently.
ALTER TABLE "provider_service_utilization" ADD COLUMN IF NOT EXISTS "hcpcs_code" varchar(20);
--> statement-breakpoint
ALTER TABLE "provider_service_utilization" ADD COLUMN IF NOT EXISTS "hcpcs_description" text;
--> statement-breakpoint
ALTER TABLE "provider_service_utilization" ADD COLUMN IF NOT EXISTS "place_of_service" varchar(10);
--> statement-breakpoint
ALTER TABLE "provider_service_utilization" ADD COLUMN IF NOT EXISTS "average_medicare_payment_amt" varchar(50);
--> statement-breakpoint
ALTER TABLE "import_schedule_configs" ADD COLUMN IF NOT EXISTS "label" varchar(255);
--> statement-breakpoint
ALTER TABLE "import_schedule_configs" ADD COLUMN IF NOT EXISTS "schedule_frequency" varchar(30);
--> statement-breakpoint
ALTER TABLE "import_schedule_configs" ADD COLUMN IF NOT EXISTS "schedule_time" varchar(10);
--> statement-breakpoint
ALTER TABLE "import_schedule_configs" ADD COLUMN IF NOT EXISTS "nppes_config" jsonb;
--> statement-breakpoint
ALTER TABLE "import_schedule_configs" ADD COLUMN IF NOT EXISTS "api_url" text;
--> statement-breakpoint
ALTER TABLE "import_schedule_configs" ADD COLUMN IF NOT EXISTS "data_year" varchar(10);
--> statement-breakpoint
ALTER TABLE "import_schedule_configs" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true;
--> statement-breakpoint
ALTER TABLE "import_schedule_configs" ADD COLUMN IF NOT EXISTS "last_run_at" timestamp;
--> statement-breakpoint
ALTER TABLE "import_schedule_configs" ADD COLUMN IF NOT EXISTS "last_run_status" varchar(30);
--> statement-breakpoint
ALTER TABLE "import_schedule_configs" ADD COLUMN IF NOT EXISTS "last_run_summary" text;
--> statement-breakpoint
ALTER TABLE "import_schedule_configs" ADD COLUMN IF NOT EXISTS "last_successful_run_at" timestamp;
--> statement-breakpoint
ALTER TABLE "import_schedule_configs" ADD COLUMN IF NOT EXISTS "next_run_at" timestamp;
--> statement-breakpoint
ALTER TABLE "import_schedule_configs" ADD COLUMN IF NOT EXISTS "consecutive_failures" integer DEFAULT 0;

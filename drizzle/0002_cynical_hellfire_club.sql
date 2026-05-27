ALTER TABLE "import_schedule_configs" ADD COLUMN "label" varchar(255);--> statement-breakpoint
ALTER TABLE "import_schedule_configs" ADD COLUMN "schedule_frequency" varchar(30);--> statement-breakpoint
ALTER TABLE "import_schedule_configs" ADD COLUMN "schedule_time" varchar(10);--> statement-breakpoint
ALTER TABLE "import_schedule_configs" ADD COLUMN "nppes_config" jsonb;--> statement-breakpoint
ALTER TABLE "import_schedule_configs" ADD COLUMN "api_url" text;--> statement-breakpoint
ALTER TABLE "import_schedule_configs" ADD COLUMN "data_year" varchar(10);--> statement-breakpoint
ALTER TABLE "import_schedule_configs" ADD COLUMN "is_active" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "import_schedule_configs" ADD COLUMN "last_run_at" timestamp;--> statement-breakpoint
ALTER TABLE "import_schedule_configs" ADD COLUMN "last_run_status" varchar(30);--> statement-breakpoint
ALTER TABLE "import_schedule_configs" ADD COLUMN "last_run_summary" text;--> statement-breakpoint
ALTER TABLE "import_schedule_configs" ADD COLUMN "last_successful_run_at" timestamp;--> statement-breakpoint
ALTER TABLE "import_schedule_configs" ADD COLUMN "next_run_at" timestamp;--> statement-breakpoint
ALTER TABLE "import_schedule_configs" ADD COLUMN "consecutive_failures" integer DEFAULT 0;
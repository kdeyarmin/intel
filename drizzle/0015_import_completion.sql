-- Scheduled imports settle when their batch finishes, not when it starts
-- (server/lib/importCompletion.ts): a schedule records the batch it started
-- and the batch records its schedule, so the completion sweep can match them.
ALTER TABLE "import_schedule_configs" ADD COLUMN IF NOT EXISTS "last_batch_id" integer;
--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN IF NOT EXISTS "schedule_id" integer;
--> statement-breakpoint
-- Which version of each source dataset is loaded, from the CMS catalogs
-- (server/lib/cmsCatalog.ts): the vintage users see, and what the daily
-- catalog check compares against to decide an import is due.
CREATE TABLE IF NOT EXISTS "dataset_versions" (
	"import_type" varchar(100) PRIMARY KEY NOT NULL,
	"source" varchar(30) NOT NULL,
	"source_dataset_id" text,
	"source_title" text,
	"catalog_modified" timestamp,
	"catalog_issued" timestamp,
	"temporal_start" date,
	"temporal_end" date,
	"accrual_periodicity" varchar(50),
	"catalog_checked_at" timestamp,
	"imported_modified" timestamp,
	"imported_at" timestamp,
	"imported_batch_id" integer,
	"row_count" bigint,
	"data_year" varchar(10),
	"status" varchar(20) NOT NULL DEFAULT 'never_imported',
	"notes" text,
	"updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
-- Medicare Order & Referring eligibility: one row per NPI, replaced on each
-- release (the file is a complete snapshot). Previously these rows were
-- written into cms_referrals with no target, polluting the referral graph.
CREATE TABLE IF NOT EXISTS "cms_order_referring" (
	"npi" varchar(10) PRIMARY KEY NOT NULL,
	"last_name" text,
	"first_name" text,
	"partb" boolean,
	"dme" boolean,
	"hha" boolean,
	"pmd" boolean,
	"hospice" boolean,
	"as_of" date,
	"import_batch_id" integer,
	"updated_date" timestamp DEFAULT now()
);

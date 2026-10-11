-- Background rollups over the large tables (server/lib/rollups). Each job
-- scans its source in primary-key chunks and replaces its result table in one
-- transaction; rollup_runs records when each last ran.
CREATE TABLE IF NOT EXISTS "rollup_runs" (
	"job" varchar(64) PRIMARY KEY NOT NULL,
	"status" varchar(20) NOT NULL DEFAULT 'idle',
	"started_at" timestamp,
	"finished_at" timestamp,
	"last_success_at" timestamp,
	"rows_scanned" bigint,
	"rows_skipped" bigint,
	"result_rows" integer,
	"duration_ms" integer,
	"progress" jsonb,
	"error" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rollup_zip_locations" (
	"zip5" varchar(5) PRIMARY KEY NOT NULL,
	"practice_locations" integer NOT NULL,
	"all_locations" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rollup_cms_service_types" (
	"data_year" varchar(10) NOT NULL,
	"service_type" varchar(255) NOT NULL,
	"provider_count" integer NOT NULL,
	"total_services" double precision NOT NULL,
	"total_payments" double precision NOT NULL,
	"total_beneficiaries" double precision NOT NULL,
	PRIMARY KEY ("data_year", "service_type")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rollup_cms_top_referred" (
	"data_year" varchar(10) NOT NULL,
	"referred_to_npi" varchar(10) NOT NULL,
	"total_referrals" double precision NOT NULL,
	"referring_providers" integer NOT NULL,
	PRIMARY KEY ("data_year", "referred_to_npi")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rollup_facility_types" (
	"facility_type" varchar(100) PRIMARY KEY NOT NULL,
	"record_count" bigint NOT NULL,
	"state_count" integer NOT NULL,
	"latest_year" varchar(10)
);

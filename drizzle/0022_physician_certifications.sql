-- Home health certifications and care plan oversight billed by physicians and other clinicians
-- (CMS "Physician & Other Practitioners - by Provider and Service", HCPCS G0180, G0179, G0181,
-- G0182): the one public measure of who actually certifies a patient for home health. The rows are
-- fetched with a server-side filter on those codes, so the table holds tens of thousands of rows.
-- The referral sources rollup reads it, and gets two columns for it.
CREATE TABLE IF NOT EXISTS "cms_physician_certifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"npi" varchar(10) NOT NULL,
	"hcpcs_code" varchar(10) NOT NULL,
	"place_of_service" varchar(1) NOT NULL,
	"data_year" varchar(10) NOT NULL,
	"provider_type" varchar(120),
	"state" varchar(2),
	"benes" integer,
	"services" double precision,
	"raw_data" jsonb,
	"import_batch_id" integer,
	"updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_cms_phys_cert" ON "cms_physician_certifications" ("npi", "hcpcs_code", "place_of_service", "data_year");
--> statement-breakpoint
ALTER TABLE "rollup_referral_sources" ADD COLUMN IF NOT EXISTS "hh_cert_benes" integer;
--> statement-breakpoint
ALTER TABLE "rollup_referral_sources" ADD COLUMN IF NOT EXISTS "hospice_oversight_benes" integer;

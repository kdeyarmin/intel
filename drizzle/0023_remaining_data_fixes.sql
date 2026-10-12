-- Home health star ratings move in half stars, so the facility rating is no longer an integer.
-- Inpatient DRG rows are one per hospital and DRG (they must not collapse onto medicare_facilities).
-- Hospice referral ranking, market-saturation year-over-year, and where a county risk score came from.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'medicare_facilities'
       AND column_name = 'quality_rating' AND udt_name = 'int4'
  ) THEN
    ALTER TABLE "medicare_facilities"
      ALTER COLUMN "quality_rating" TYPE double precision
      USING "quality_rating"::double precision;
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cms_inpatient_drg" (
	"id" serial PRIMARY KEY NOT NULL,
	"ccn" varchar(10) NOT NULL,
	"drg_code" varchar(10) NOT NULL,
	"data_year" varchar(10) NOT NULL,
	"drg_desc" text,
	"provider_name" text,
	"state" varchar(2),
	"discharges" integer,
	"avg_covered_charges" double precision,
	"avg_total_payments" double precision,
	"avg_medicare_payments" double precision,
	"raw_data" jsonb,
	"import_batch_id" integer,
	"updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_cms_inpatient_drg" ON "cms_inpatient_drg" ("ccn", "drg_code", "data_year");
--> statement-breakpoint
ALTER TABLE "rollup_referral_sources" ADD COLUMN IF NOT EXISTS "hospice_index" integer;
--> statement-breakpoint
ALTER TABLE "rollup_referral_sources" ADD COLUMN IF NOT EXISTS "hospice_rank_in_county" integer;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_rollup_ref_src_county_hospice" ON "rollup_referral_sources" ("county_fips", "hospice_index");
--> statement-breakpoint
ALTER TABLE "rollup_county_market_profile" ADD COLUMN IF NOT EXISTS "hha_users_change_pct" double precision;
--> statement-breakpoint
ALTER TABLE "rollup_county_market_profile" ADD COLUMN IF NOT EXISTS "hha_providers_change_pct" double precision;
--> statement-breakpoint
ALTER TABLE "rollup_county_market_profile" ADD COLUMN IF NOT EXISTS "hospice_users_change_pct" double precision;
--> statement-breakpoint
ALTER TABLE "rollup_county_market_profile" ADD COLUMN IF NOT EXISTS "hospice_providers_change_pct" double precision;
--> statement-breakpoint
ALTER TABLE "rollup_county_market_profile" ADD COLUMN IF NOT EXISTS "snf_users_change_pct" double precision;
--> statement-breakpoint
ALTER TABLE "rollup_county_market_profile" ADD COLUMN IF NOT EXISTS "snf_providers_change_pct" double precision;
--> statement-breakpoint
ALTER TABLE "rollup_county_market_profile" ADD COLUMN IF NOT EXISTS "avg_hcc_source" varchar(40);

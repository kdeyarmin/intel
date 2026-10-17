-- Public reference files the market views read. Loaders upsert these from
-- local files; the maintenance worker does not download them.
CREATE TABLE IF NOT EXISTS "cms_pos_facility" (
  "ccn" varchar(10) NOT NULL,
  "period" varchar(7) NOT NULL,
  "name" text,
  "state" varchar(2),
  "category_code" varchar(8),
  "control_type" varchar(8),
  "certification_date" varchar(10),
  "termination_date" varchar(10),
  "chow_date" varchar(10),
  PRIMARY KEY ("ccn", "period")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cms_pos_signal" (
  "ccn" varchar(10) NOT NULL,
  "period" varchar(7) NOT NULL,
  "signal" varchar(24) NOT NULL,
  "prior_period" varchar(7),
  "detail" text,
  PRIMARY KEY ("ccn", "period", "signal")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cms_pos_signal_period" ON "cms_pos_signal" ("period", "signal");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cms_ma_penetration" (
  "period" varchar(7) NOT NULL,
  "county_fips" varchar(5) NOT NULL,
  "eligibles" integer,
  "enrolled" integer,
  "penetration" numeric(8, 4),
  PRIMARY KEY ("period", "county_fips")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "certificate_of_need" (
  "state" varchar(2) PRIMARY KEY,
  "con_status" varchar(16) NOT NULL,
  "services" text,
  "source_url" text NOT NULL,
  "source_as_of" varchar(10) NOT NULL,
  "note" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hud_zip_county" (
  "zip5" varchar(5) NOT NULL,
  "county_fips" varchar(5) NOT NULL,
  "residential_ratio" numeric(8, 6),
  "total_ratio" numeric(8, 6),
  PRIMARY KEY ("zip5", "county_fips")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hcris_cost_summary" (
  "setting" varchar(16) NOT NULL,
  "provider_id" varchar(10) NOT NULL,
  "fiscal_year" varchar(4) NOT NULL,
  "total_patient_revenue" numeric(16, 2),
  "medicare_revenue" numeric(16, 2),
  "medicaid_revenue" numeric(16, 2),
  "total_cost" numeric(16, 2),
  "net_income" numeric(16, 2),
  "medicare_share" numeric(8, 4),
  "margin" numeric(8, 4),
  PRIMARY KEY ("setting", "provider_id", "fiscal_year")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_hcris_cost_provider" ON "hcris_cost_summary" ("provider_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "county_sdoh" (
  "county_fips" varchar(5) NOT NULL,
  "year" varchar(4) NOT NULL,
  "measure_id" varchar(40) NOT NULL,
  "measure" text,
  "data_value" numeric(12, 4),
  "source" text,
  PRIMARY KEY ("county_fips", "year", "measure_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cdc_svi_county" (
  "county_fips" varchar(5) NOT NULL,
  "year" varchar(4) NOT NULL,
  "rpl_themes" numeric(6, 4),
  "rpl_theme1" numeric(6, 4),
  "rpl_theme2" numeric(6, 4),
  "rpl_theme3" numeric(6, 4),
  "rpl_theme4" numeric(6, 4),
  PRIMARY KEY ("county_fips", "year")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bls_wage" (
  "area_code" varchar(16) NOT NULL,
  "year" varchar(4) NOT NULL,
  "series" varchar(8) NOT NULL,
  "occupation" text NOT NULL,
  "employment" integer,
  "avg_wage" numeric(12, 2),
  PRIMARY KEY ("area_code", "year", "series", "occupation")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cms_ahcah" (
  "ccn" varchar(6) PRIMARY KEY,
  "facility_name" text,
  "state" varchar(2),
  "city" text,
  "listed_on" varchar(10)
);

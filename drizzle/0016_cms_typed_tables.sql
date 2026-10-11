-- Typed tables for the CMS datasets that are geography or time series rather
-- than facilities (server/functions/cmsTypedTables.ts). In medicare_facilities
-- these collapsed to one row per provider (the Hospital Service Area kept one
-- ZIP per hospital); here the natural key carries the period and the place.
CREATE TABLE IF NOT EXISTS "cms_hospital_service_area" (
	"id" serial PRIMARY KEY NOT NULL,
	"ccn" varchar(10) NOT NULL,
	"zip5" varchar(5) NOT NULL,
	"data_year" varchar(10) NOT NULL,
	"total_cases" integer,
	"total_days" integer,
	"total_charges" double precision,
	"raw_data" jsonb,
	"import_batch_id" integer,
	"updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_cms_hsa" ON "cms_hospital_service_area" ("ccn", "zip5", "data_year");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cms_hsa_zip_year" ON "cms_hospital_service_area" ("zip5", "data_year");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cms_pac_utilization" (
	"id" serial PRIMARY KEY NOT NULL,
	"setting" varchar(10) NOT NULL,
	"summary_level" varchar(10) NOT NULL,
	"ccn" varchar(10) NOT NULL DEFAULT '',
	"state" varchar(2) NOT NULL DEFAULT '',
	"data_year" varchar(10) NOT NULL,
	"year_type" varchar(4),
	"provider_name" text,
	"city" varchar(100),
	"zip5" varchar(5),
	"bene_count" integer,
	"stays" integer,
	"service_days" integer,
	"charges" double precision,
	"allowed" double precision,
	"medicare_payment" double precision,
	"standardized_payment" double precision,
	"avg_age" double precision,
	"dual_pct" double precision,
	"rural_pct" double precision,
	"avg_risk_score" double precision,
	"chronic_conditions" jsonb,
	"metrics" jsonb,
	"raw_data" jsonb,
	"import_batch_id" integer,
	"updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_cms_pac" ON "cms_pac_utilization" ("setting", "summary_level", "ccn", "state", "data_year");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cms_pac_state_zip" ON "cms_pac_utilization" ("setting", "state", "zip5", "data_year");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cms_hospital_spending_by_claim" (
	"id" serial PRIMARY KEY NOT NULL,
	"ccn" varchar(10) NOT NULL,
	"period" varchar(80) NOT NULL,
	"claim_type" varchar(80) NOT NULL,
	"data_year" varchar(10) NOT NULL,
	"period_start" date,
	"period_end" date,
	"facility_name" text,
	"state" varchar(2),
	"avg_spend_hospital" double precision,
	"avg_spend_state" double precision,
	"avg_spend_national" double precision,
	"pct_spend_hospital" double precision,
	"pct_spend_state" double precision,
	"pct_spend_national" double precision,
	"raw_data" jsonb,
	"import_batch_id" integer,
	"updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_cms_hsbc" ON "cms_hospital_spending_by_claim" ("ccn", "period", "claim_type", "data_year");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cms_market_saturation" (
	"id" serial PRIMARY KEY NOT NULL,
	"reference_period" varchar(40) NOT NULL,
	"geo_level" varchar(30) NOT NULL,
	"geo_code" varchar(10) NOT NULL DEFAULT '',
	"service" varchar(120) NOT NULL,
	"state" varchar(2),
	"geo_name" text,
	"ffs_benes" bigint,
	"providers" integer,
	"users" bigint,
	"users_per_provider" double precision,
	"users_pct" double precision,
	"dual_users" bigint,
	"dual_users_pct" double precision,
	"total_payment" double precision,
	"moratorium" boolean,
	"providers_change_pct" double precision,
	"users_change_pct" double precision,
	"raw_data" jsonb,
	"import_batch_id" integer,
	"updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_cms_mktsat" ON "cms_market_saturation" ("reference_period", "geo_level", "geo_code", "service");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cms_monthly_enrollment" (
	"id" serial PRIMARY KEY NOT NULL,
	"period" varchar(8) NOT NULL,
	"geo_level" varchar(10) NOT NULL,
	"geo_code" varchar(5) NOT NULL DEFAULT '',
	"state" varchar(2),
	"county_name" text,
	"total_benes" bigint,
	"original_medicare" bigint,
	"ma_and_other" bigint,
	"aged" bigint,
	"disabled" bigint,
	"dual" bigint,
	"full_dual" bigint,
	"age_85_plus" bigint,
	"metrics" jsonb,
	"raw_data" jsonb,
	"import_batch_id" integer,
	"updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_cms_enroll" ON "cms_monthly_enrollment" ("period", "geo_level", "geo_code");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cms_geo_variation" (
	"id" serial PRIMARY KEY NOT NULL,
	"data_year" varchar(10) NOT NULL,
	"geo_level" varchar(10) NOT NULL,
	"geo_code" varchar(10) NOT NULL DEFAULT '',
	"age_level" varchar(10) NOT NULL DEFAULT 'All',
	"geo_desc" text,
	"state" varchar(2),
	"benes" bigint,
	"ma_benes" bigint,
	"ma_participation_rate" double precision,
	"avg_age" double precision,
	"dual_pct" double precision,
	"avg_hcc_score" double precision,
	"std_per_capita_total" double precision,
	"std_per_capita_ip" double precision,
	"std_per_capita_snf" double precision,
	"std_per_capita_hha" double precision,
	"std_per_capita_hospice" double precision,
	"readmission_rate" double precision,
	"er_visits_per_1000" double precision,
	"snf_stays_per_1000" double precision,
	"metrics" jsonb,
	"raw_data" jsonb,
	"import_batch_id" integer,
	"updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_cms_geovar" ON "cms_geo_variation" ("data_year", "geo_level", "geo_code", "age_level");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cms_zip_service_area" (
	"id" serial PRIMARY KEY NOT NULL,
	"setting" varchar(10) NOT NULL,
	"ccn" varchar(10) NOT NULL,
	"zip5" varchar(5) NOT NULL,
	"state" varchar(2),
	"as_of" date,
	"import_batch_id" integer,
	"updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_cms_zipsvc" ON "cms_zip_service_area" ("setting", "ccn", "zip5");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cms_zipsvc_zip" ON "cms_zip_service_area" ("setting", "zip5");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cms_physician_by_provider" (
	"id" serial PRIMARY KEY NOT NULL,
	"npi" varchar(10) NOT NULL,
	"data_year" varchar(10) NOT NULL,
	"entity_code" varchar(1),
	"provider_type" varchar(120),
	"state" varchar(2),
	"zip5" varchar(5),
	"ruca" varchar(5),
	"benes" integer,
	"services" double precision,
	"hcpcs_codes" integer,
	"submitted_charges" double precision,
	"allowed" double precision,
	"medicare_payment" double precision,
	"standardized_payment" double precision,
	"avg_age" double precision,
	"dual_count" integer,
	"avg_risk_score" double precision,
	"chronic_conditions" jsonb,
	"metrics" jsonb,
	"raw_data" jsonb,
	"import_batch_id" integer,
	"updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_cms_phys" ON "cms_physician_by_provider" ("npi", "data_year");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cms_phys_state_zip" ON "cms_physician_by_provider" ("state", "zip5", "data_year");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cms_facility_affiliation" (
	"id" serial PRIMARY KEY NOT NULL,
	"npi" varchar(10) NOT NULL,
	"facility_type" varchar(60) NOT NULL,
	"facility_ccn" varchar(10) NOT NULL DEFAULT '',
	"ind_pac_id" varchar(20),
	"as_of" date,
	"import_batch_id" integer,
	"updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_cms_affil" ON "cms_facility_affiliation" ("npi", "facility_type", "facility_ccn");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cms_affil_ccn" ON "cms_facility_affiliation" ("facility_ccn");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cms_dme_by_referring" (
	"id" serial PRIMARY KEY NOT NULL,
	"npi" varchar(10) NOT NULL,
	"data_year" varchar(10) NOT NULL,
	"state" varchar(2),
	"zip5" varchar(5),
	"specialty" varchar(120),
	"suppliers" integer,
	"benes" integer,
	"claims" integer,
	"services" double precision,
	"medicare_payment" double precision,
	"standardized_payment" double precision,
	"avg_age" double precision,
	"avg_risk_score" double precision,
	"chronic_conditions" jsonb,
	"raw_data" jsonb,
	"import_batch_id" integer,
	"updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_cms_dmeref" ON "cms_dme_by_referring" ("npi", "data_year");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cms_ltc_facility_characteristics" (
	"id" serial PRIMARY KEY NOT NULL,
	"ccn" varchar(10) NOT NULL,
	"period_end" date NOT NULL,
	"facility_name" text,
	"city" varchar(100),
	"state" varchar(2),
	"zip5" varchar(5),
	"certification_date" date,
	"medicare_census" integer,
	"medicaid_census" integer,
	"other_census" integer,
	"total_residents" integer,
	"participation" varchar(60),
	"hospital_based" boolean,
	"ownership_type" varchar(80),
	"multi_facility" boolean,
	"multi_facility_org_name" text,
	"special_care_beds" jsonb,
	"ccrc" boolean,
	"raw_data" jsonb,
	"import_batch_id" integer,
	"updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_cms_ltc671" ON "cms_ltc_facility_characteristics" ("ccn", "period_end");

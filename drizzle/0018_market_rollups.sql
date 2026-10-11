-- Market and patient-flow rollups (server/lib/rollups/market.ts): where a
-- hospital's inpatients live, which hospitals discharge a county's residents,
-- post-discharge spend mix, post-acute market share, agency coverage, likely
-- referral sources and the one-row county market profile. Each is replaced
-- whole by its rollup job (query kind) under the usual rollup lock and run row.
CREATE TABLE IF NOT EXISTS "rollup_hospital_catchment" (
	"ccn" varchar(10) NOT NULL,
	"zip5" varchar(5) NOT NULL,
	"data_year" varchar(10) NOT NULL,
	"county_fips" varchar(5),
	"cases" integer,
	"days" integer,
	"charges" double precision,
	"share_of_hospital" double precision,
	PRIMARY KEY ("ccn", "zip5", "data_year")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_rollup_hosp_catch_county" ON "rollup_hospital_catchment" ("county_fips", "data_year");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rollup_county_hospital_sources" (
	"county_fips" varchar(5) NOT NULL,
	"ccn" varchar(10) NOT NULL,
	"data_year" varchar(10) NOT NULL,
	"cases" integer,
	"days" integer,
	"share_of_county" double precision,
	"rank" integer,
	PRIMARY KEY ("county_fips", "ccn", "data_year")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_rollup_county_hosp_ccn" ON "rollup_county_hospital_sources" ("ccn", "data_year");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rollup_hospital_discharge_mix" (
	"ccn" varchar(10) NOT NULL,
	"data_year" varchar(10) NOT NULL,
	"facility_name" text,
	"state" varchar(2),
	"pct_snf" double precision,
	"pct_hha" double precision,
	"pct_hospice" double precision,
	"pct_inpatient" double precision,
	"pct_outpatient" double precision,
	"pct_snf_state" double precision,
	"pct_hha_state" double precision,
	"pct_hospice_state" double precision,
	"pct_snf_national" double precision,
	"pct_hha_national" double precision,
	"pct_hospice_national" double precision,
	"avg_episode_spend" double precision,
	PRIMARY KEY ("ccn", "data_year")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rollup_pac_market_share" (
	"setting" varchar(10) NOT NULL,
	"data_year" varchar(10) NOT NULL,
	"geo_level" varchar(10) NOT NULL,
	"geo_code" varchar(5) NOT NULL,
	"ccn" varchar(10) NOT NULL,
	"provider_name" text,
	"city" varchar(100),
	"state" varchar(2),
	"zip5" varchar(5),
	"benes" integer,
	"stays" integer,
	"days" integer,
	"payment" double precision,
	"dual_pct" double precision,
	"risk_score" double precision,
	"share_benes" double precision,
	"rank" integer,
	"providers_in_market" integer,
	PRIMARY KEY ("setting", "data_year", "geo_level", "geo_code", "ccn")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_rollup_pac_share_ccn" ON "rollup_pac_market_share" ("ccn", "setting", "data_year");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rollup_agency_coverage" (
	"setting" varchar(10) NOT NULL,
	"county_fips" varchar(5) NOT NULL,
	"ccn" varchar(10) NOT NULL,
	"zips_served" integer NOT NULL,
	"county_zips" integer NOT NULL,
	"share_of_county_zips" double precision,
	PRIMARY KEY ("setting", "county_fips", "ccn")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_rollup_agency_cov_ccn" ON "rollup_agency_coverage" ("setting", "ccn");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rollup_referral_sources" (
	"npi" varchar(10) PRIMARY KEY NOT NULL,
	"data_year" varchar(10) NOT NULL,
	"county_fips" varchar(5),
	"state" varchar(2),
	"zip5" varchar(5),
	"specialty" varchar(120),
	"benes" integer,
	"services" double precision,
	"avg_risk_score" double precision,
	"dual_pct" double precision,
	"cc_chf_pct" double precision,
	"cc_copd_pct" double precision,
	"cc_alzheimer_pct" double precision,
	"cc_ckd_pct" double precision,
	"cc_diabetes_pct" double precision,
	"hha_eligible" boolean,
	"hospice_eligible" boolean,
	"dme_eligible" boolean,
	"dme_benes" integer,
	"hospital_ccns" text[],
	"affiliations" integer,
	"referral_index" integer,
	"rank_in_county" integer
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_rollup_ref_src_county" ON "rollup_referral_sources" ("county_fips", "referral_index");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_rollup_ref_src_state" ON "rollup_referral_sources" ("state", "referral_index");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rollup_county_market_profile" (
	"county_fips" varchar(5) PRIMARY KEY NOT NULL,
	"state" varchar(2) NOT NULL,
	"county_name" text NOT NULL,
	"enrollment_period" varchar(8),
	"benes" bigint,
	"original_medicare" bigint,
	"ma_benes" bigint,
	"ma_penetration" double precision,
	"aged" bigint,
	"dual" bigint,
	"benes_85_plus" bigint,
	"saturation_period" varchar(40),
	"hha_providers" integer,
	"hha_users" bigint,
	"hha_users_pct" double precision,
	"hospice_providers" integer,
	"hospice_users" bigint,
	"hospice_users_pct" double precision,
	"snf_providers" integer,
	"snf_users" bigint,
	"snf_users_pct" double precision,
	"variation_year" varchar(10),
	"std_per_capita_total" double precision,
	"std_per_capita_snf" double precision,
	"std_per_capita_hha" double precision,
	"std_per_capita_hospice" double precision,
	"readmission_rate" double precision,
	"er_visits_per_1000" double precision,
	"avg_hcc_score" double precision,
	"hsa_year" varchar(10),
	"hospitals_serving" integer,
	"top_hospital_ccn" varchar(10),
	"top_hospital_share" double precision,
	"pac_year" varchar(10),
	"snf_facilities" integer,
	"hha_agencies" integer,
	"hospice_agencies" integer,
	"as_of" jsonb
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_rollup_county_profile_state" ON "rollup_county_market_profile" ("state");

-- Demand-side and state-licensing data for the county market profile.
-- census_acs_* hold the bundled ACS 5-year estimates (server/lib/census/acs.ts);
-- licensed_facilities holds state-licensed homes that CMS files never list
-- (personal care homes, assisted living), imported from CSV uploads.
CREATE TABLE IF NOT EXISTS "census_acs_county" (
	"fips" varchar(5) PRIMARY KEY NOT NULL,
	"pop_total" integer,
	"pop_65_plus" integer,
	"pop_85_plus" integer,
	"median_income" integer,
	"median_home_value" integer,
	"hh_65_plus" integer,
	"living_alone_65_plus" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "census_acs_zcta" (
	"zcta" varchar(5) PRIMARY KEY NOT NULL,
	"pop_total" integer,
	"pop_65_plus" integer,
	"pop_85_plus" integer,
	"median_income" integer,
	"median_home_value" integer,
	"hh_65_plus" integer,
	"living_alone_65_plus" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "licensed_facilities" (
	"id" serial PRIMARY KEY NOT NULL,
	"state" varchar(2) NOT NULL,
	"license_type" varchar(60) NOT NULL,
	"facility_key" varchar(64) NOT NULL,
	"license_number" varchar(60),
	"name" text NOT NULL,
	"address" text,
	"city" varchar(100),
	"zip5" varchar(5),
	"county_fips" varchar(5),
	"capacity" integer,
	"status" varchar(60),
	"licensee" text,
	"phone" varchar(50),
	"source_url" text,
	"as_of" date,
	"raw_data" jsonb,
	"import_batch_id" integer,
	"updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_licensed_facilities" ON "licensed_facilities" ("state", "license_type", "facility_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_licensed_facilities_county" ON "licensed_facilities" ("county_fips", "license_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_licensed_facilities_state_type" ON "licensed_facilities" ("state", "license_type");
--> statement-breakpoint
ALTER TABLE "rollup_county_market_profile" ADD COLUMN IF NOT EXISTS "pop_total" integer;
--> statement-breakpoint
ALTER TABLE "rollup_county_market_profile" ADD COLUMN IF NOT EXISTS "pop_65_plus" integer;
--> statement-breakpoint
ALTER TABLE "rollup_county_market_profile" ADD COLUMN IF NOT EXISTS "pop_85_plus" integer;
--> statement-breakpoint
ALTER TABLE "rollup_county_market_profile" ADD COLUMN IF NOT EXISTS "median_income" integer;
--> statement-breakpoint
ALTER TABLE "rollup_county_market_profile" ADD COLUMN IF NOT EXISTS "median_home_value" integer;
--> statement-breakpoint
ALTER TABLE "rollup_county_market_profile" ADD COLUMN IF NOT EXISTS "living_alone_65_plus" integer;
--> statement-breakpoint
ALTER TABLE "rollup_county_market_profile" ADD COLUMN IF NOT EXISTS "licensed_homes" integer;
--> statement-breakpoint
ALTER TABLE "rollup_county_market_profile" ADD COLUMN IF NOT EXISTS "licensed_beds" integer;

-- Census geography (2020): counties, ZCTA centroids with their main county,
-- and ZCTA↔county land shares. Loaded from server/data/census by
-- server/lib/census/load.ts (npm run geo:load, or automatically at boot).
CREATE TABLE IF NOT EXISTS "geo_counties" (
	"fips" varchar(5) PRIMARY KEY NOT NULL,
	"state" varchar(2) NOT NULL,
	"name" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "geo_counties_state_idx" ON "geo_counties" ("state");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "geo_zctas" (
	"zcta" varchar(5) PRIMARY KEY NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"land_sqmi" double precision,
	"primary_county_fips" varchar(5),
	"state" varchar(2)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "geo_zctas_county_idx" ON "geo_zctas" ("primary_county_fips");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "geo_zctas_state_idx" ON "geo_zctas" ("state");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "geo_zcta_counties" (
	"zcta" varchar(5) NOT NULL,
	"county_fips" varchar(5) NOT NULL,
	"land_share" double precision NOT NULL,
	PRIMARY KEY ("zcta", "county_fips")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "geo_zcta_counties_county_idx" ON "geo_zcta_counties" ("county_fips");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "geo_meta" (
	"key" varchar(50) PRIMARY KEY NOT NULL,
	"vintage" varchar(20),
	"dataset_sha256" varchar(64),
	"row_counts" jsonb,
	"loaded_at" timestamp DEFAULT now()
);

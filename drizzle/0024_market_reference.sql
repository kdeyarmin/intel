-- County and provider reference files that are not in the CMS data-api catalog:
-- Medicare Advantage enrollment by plan, Part D drugs, CDC PLACES, exclusions, opt-out.
CREATE TABLE IF NOT EXISTS "cms_ma_plan_enrollment" (
  "period" varchar(7) NOT NULL,
  "county_fips" varchar(5) NOT NULL,
  "state" varchar(2),
  "county_name" text,
  "organization" text NOT NULL,
  "enrollment" integer NOT NULL,
  "contracts" integer,
  CONSTRAINT "cms_ma_plan_enrollment_pkey" PRIMARY KEY ("period", "county_fips", "organization")
);
CREATE INDEX IF NOT EXISTS "idx_cms_ma_plan_fips" ON "cms_ma_plan_enrollment" ("county_fips");

CREATE TABLE IF NOT EXISTS "cms_partd_geo_drug" (
  "county_fips" varchar(5) NOT NULL,
  "data_year" varchar(4) NOT NULL,
  "generic_name" text NOT NULL,
  "claims" integer,
  "drug_cost" numeric(16,2),
  "beneficiaries" integer,
  "opioid" boolean,
  CONSTRAINT "cms_partd_geo_drug_pkey" PRIMARY KEY ("county_fips", "data_year", "generic_name")
);

CREATE TABLE IF NOT EXISTS "cms_partd_provider_drug" (
  "npi" varchar(10) NOT NULL,
  "data_year" varchar(4) NOT NULL,
  "generic_name" text NOT NULL,
  "brand_name" text,
  "claims" integer,
  "drug_cost" numeric(16,2),
  "beneficiaries" integer,
  CONSTRAINT "cms_partd_provider_drug_pkey" PRIMARY KEY ("npi", "data_year", "generic_name")
);
CREATE INDEX IF NOT EXISTS "idx_cms_partd_npi" ON "cms_partd_provider_drug" ("npi");

CREATE TABLE IF NOT EXISTS "cdc_places_county" (
  "county_fips" varchar(5) NOT NULL,
  "measure_id" varchar(40) NOT NULL,
  "measure" text,
  "data_value" numeric(8,2),
  "year" varchar(4),
  CONSTRAINT "cdc_places_county_pkey" PRIMARY KEY ("county_fips", "measure_id")
);

CREATE TABLE IF NOT EXISTS "oig_exclusions" (
  "npi" varchar(10) PRIMARY KEY,
  "name" text,
  "excl_type" varchar(20),
  "excl_date" varchar(8),
  "state" varchar(2)
);

CREATE TABLE IF NOT EXISTS "medicare_opt_out" (
  "npi" varchar(10) PRIMARY KEY,
  "name" text,
  "specialty" text,
  "state" varchar(2),
  "effective_date" varchar(20),
  "end_date" varchar(20)
);

CREATE TABLE IF NOT EXISTS "cms_geo_service" (
  "county_fips" varchar(5) NOT NULL,
  "data_year" varchar(4) NOT NULL,
  "hcpcs" varchar(10) NOT NULL,
  "description" text,
  "beneficiaries" integer,
  "services" numeric(14,1),
  "payment" numeric(16,2),
  CONSTRAINT "cms_geo_service_pkey" PRIMARY KEY ("county_fips", "data_year", "hcpcs")
);

CREATE TABLE IF NOT EXISTS "hrsa_shortage" (
  "county_fips" varchar(5) NOT NULL,
  "discipline" varchar(40) NOT NULL,
  "designation_type" text NOT NULL DEFAULT '',
  "hpsa_score" numeric(6,2),
  "status" text,
  CONSTRAINT "hrsa_shortage_pkey" PRIMARY KEY ("county_fips", "discipline", "designation_type")
);

CREATE TABLE IF NOT EXISTS "cms_open_payment_totals" (
  "npi" varchar(20) PRIMARY KEY,
  "recipient_state" varchar(2),
  "program_year" integer NOT NULL,
  "payment_count" integer NOT NULL,
  "total_amount" numeric(14,2) NOT NULL
);


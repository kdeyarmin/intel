-- Free PHC4 published reports. Not the paid inpatient discharge file:
-- there is no discharge destination, and facility names are PHC4's short
-- names (not an NPI or a Medicare certification number).
-- Volume and cancer rows are the facility's county. County stats are the
-- patient's county of residence, at any Pennsylvania general acute hospital.

CREATE TABLE IF NOT EXISTS "phc4_cardiac_volume" (
  "report_period" varchar(9) NOT NULL,
  "procedure_code" varchar(40) NOT NULL,
  "county_name" text NOT NULL DEFAULT '',
  "facility_name" text NOT NULL,
  "total_cases" integer,
  "inpatient_cases" integer,
  "outpatient_cases" integer,
  CONSTRAINT "phc4_cardiac_volume_pkey" PRIMARY KEY ("report_period", "procedure_code", "county_name", "facility_name")
);
CREATE INDEX IF NOT EXISTS "idx_phc4_cardiac_volume_county" ON "phc4_cardiac_volume" ("county_name");

CREATE TABLE IF NOT EXISTS "phc4_cardiac_outcome" (
  "report_period" varchar(9) NOT NULL,
  "procedure_code" varchar(40) NOT NULL,
  "facility_name" text NOT NULL,
  "measure" varchar(24) NOT NULL,
  "cases" integer,
  "actual_value" numeric(14,2),
  "expected_value" numeric(14,2),
  "expected_low" numeric(14,2),
  "expected_high" numeric(14,2),
  "actual_rate" numeric(8,2),
  "expected_rate" numeric(8,2),
  "p_value" numeric(8,4),
  "rating" varchar(16),
  "adjusted_average" numeric(14,2),
  CONSTRAINT "phc4_cardiac_outcome_pkey" PRIMARY KEY ("report_period", "procedure_code", "facility_name", "measure")
);
CREATE INDEX IF NOT EXISTS "idx_phc4_cardiac_outcome_facility" ON "phc4_cardiac_outcome" ("facility_name");

CREATE TABLE IF NOT EXISTS "phc4_cancer_surgery" (
  "report_period" varchar(12) NOT NULL,
  "county_name" text NOT NULL DEFAULT '',
  "facility_name" text NOT NULL,
  "facility_type" text,
  "cancer" varchar(24) NOT NULL,
  "inpatient_cases" integer,
  "outpatient_cases" integer,
  "total_cases" integer,
  CONSTRAINT "phc4_cancer_surgery_pkey" PRIMARY KEY ("report_period", "county_name", "facility_name", "cancer")
);
CREATE INDEX IF NOT EXISTS "idx_phc4_cancer_county" ON "phc4_cancer_surgery" ("county_name");

CREATE TABLE IF NOT EXISTS "phc4_county_stat" (
  "period" varchar(12) NOT NULL,
  "report" varchar(40) NOT NULL,
  "county_name" text NOT NULL,
  "category" text NOT NULL,
  "cases" integer,
  "value" numeric(10,2),
  "value_unit" varchar(32) NOT NULL,
  CONSTRAINT "phc4_county_stat_pkey" PRIMARY KEY ("period", "report", "county_name", "category")
);
CREATE INDEX IF NOT EXISTS "idx_phc4_county_stat_county" ON "phc4_county_stat" ("county_name");
ALTER TABLE "phc4_county_stat" ALTER COLUMN "value_unit" TYPE varchar(32);

-- Medicare DMEPOS public use files for calendar year 2024 (released July 2026)
-- plus the Medicare equipment-supplier directory. Cells CMS suppressed are
-- stored as missing, not zero. The directory id is a supplier number, not an NPI.
ALTER TABLE "cms_dme_by_referring"
  ADD COLUMN IF NOT EXISTS "hcpcs_codes" integer,
  ADD COLUMN IF NOT EXISTS "allowed" double precision,
  ADD COLUMN IF NOT EXISTS "submitted_charges" double precision,
  ADD COLUMN IF NOT EXISTS "dme_suppressed" boolean,
  ADD COLUMN IF NOT EXISTS "dme_benes" integer,
  ADD COLUMN IF NOT EXISTS "dme_payment" double precision,
  ADD COLUMN IF NOT EXISTS "pos_suppressed" boolean,
  ADD COLUMN IF NOT EXISTS "pos_benes" integer,
  ADD COLUMN IF NOT EXISTS "pos_payment" double precision,
  ADD COLUMN IF NOT EXISTS "drug_suppressed" boolean,
  ADD COLUMN IF NOT EXISTS "drug_benes" integer,
  ADD COLUMN IF NOT EXISTS "drug_payment" double precision;

CREATE TABLE IF NOT EXISTS "cms_dme_by_supplier" (
  "npi" varchar(10) NOT NULL,
  "data_year" varchar(4) NOT NULL,
  "name" text,
  "city" text,
  "state" varchar(2),
  "zip5" varchar(5),
  "specialty" text,
  "hcpcs_codes" integer,
  "benes" integer,
  "claims" integer,
  "services" double precision,
  "medicare_payment" double precision,
  "allowed" double precision,
  "dme_suppressed" boolean,
  "dme_benes" integer,
  "dme_payment" double precision,
  "pos_suppressed" boolean,
  "pos_benes" integer,
  "pos_payment" double precision,
  "drug_suppressed" boolean,
  "drug_benes" integer,
  "drug_payment" double precision,
  CONSTRAINT "cms_dme_by_supplier_pkey" PRIMARY KEY ("data_year", "npi")
);
CREATE INDEX IF NOT EXISTS "idx_cms_dme_supplier_zip" ON "cms_dme_by_supplier" ("zip5");

CREATE TABLE IF NOT EXISTS "cms_dme_order_line" (
  "data_year" varchar(4) NOT NULL,
  "npi" varchar(10) NOT NULL,
  "hcpcs" varchar(10) NOT NULL,
  "rental" varchar(1) NOT NULL DEFAULT '',
  "state" varchar(2),
  "rbcs_desc" text,
  "hcpcs_desc" text,
  "suppliers" integer,
  "benes" integer,
  "claims" integer,
  "services" double precision,
  "avg_payment" double precision,
  CONSTRAINT "cms_dme_order_line_pkey" PRIMARY KEY ("data_year", "npi", "hcpcs", "rental")
);
CREATE INDEX IF NOT EXISTS "idx_dme_order_npi" ON "cms_dme_order_line" ("npi");

CREATE TABLE IF NOT EXISTS "cms_dme_supply_line" (
  "data_year" varchar(4) NOT NULL,
  "npi" varchar(10) NOT NULL,
  "hcpcs" varchar(10) NOT NULL,
  "rental" varchar(1) NOT NULL DEFAULT '',
  "state" varchar(2),
  "rbcs_desc" text,
  "hcpcs_desc" text,
  "benes" integer,
  "claims" integer,
  "services" double precision,
  "avg_payment" double precision,
  CONSTRAINT "cms_dme_supply_line_pkey" PRIMARY KEY ("data_year", "npi", "hcpcs", "rental")
);
CREATE INDEX IF NOT EXISTS "idx_dme_supply_npi" ON "cms_dme_supply_line" ("npi");

CREATE TABLE IF NOT EXISTS "cms_dme_geo_service" (
  "data_year" varchar(4) NOT NULL,
  "geo_level" varchar(16) NOT NULL,
  "geo_code" varchar(5) NOT NULL DEFAULT '',
  "hcpcs" varchar(10) NOT NULL,
  "rental" varchar(1) NOT NULL DEFAULT '',
  "state" varchar(2) NOT NULL DEFAULT '',
  "geo_desc" text,
  "rbcs_desc" text,
  "hcpcs_desc" text,
  "referring_providers" integer,
  "suppliers" integer,
  "benes" integer,
  "claims" integer,
  "services" double precision,
  "avg_payment" double precision,
  CONSTRAINT "cms_dme_geo_service_pkey" PRIMARY KEY ("data_year", "geo_level", "geo_code", "hcpcs", "rental")
);
CREATE INDEX IF NOT EXISTS "idx_dme_geo_state" ON "cms_dme_geo_service" ("state");

CREATE TABLE IF NOT EXISTS "dme_supplier_directory" (
  "provider_id" varchar(20) NOT NULL,
  "npi" varchar(10),
  "business_name" text,
  "practice_name" text,
  "address" text,
  "city" text,
  "state" varchar(2),
  "zip5" varchar(5),
  "phone" varchar(20),
  "accepts_assignment" boolean,
  "participation_begin" date,
  "specialties" text,
  "provider_types" text,
  "supplies" text,
  "latitude" double precision,
  "longitude" double precision,
  "cba_contracted" boolean,
  "as_of" date,
  CONSTRAINT "dme_supplier_directory_pkey" PRIMARY KEY ("provider_id")
);
CREATE INDEX IF NOT EXISTS "idx_dme_dir_zip" ON "dme_supplier_directory" ("zip5");
CREATE INDEX IF NOT EXISTS "idx_dme_dir_npi" ON "dme_supplier_directory" ("npi");

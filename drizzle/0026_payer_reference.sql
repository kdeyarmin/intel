-- Free payer files: Pennsylvania Medicaid managed care, marketplace plan footprints,
-- Medicare Advantage star ratings, commercial medical loss ratios, and open enrollment.
CREATE TABLE IF NOT EXISTS "pa_mco_enrollment" (
  "period" varchar(7) NOT NULL,
  "county_name" text NOT NULL,
  "plan" text NOT NULL,
  "zone" varchar(32),
  "enrollment" integer NOT NULL,
  CONSTRAINT "pa_mco_enrollment_pkey" PRIMARY KEY ("period", "county_name", "plan")
);
CREATE INDEX IF NOT EXISTS "idx_pa_mco_county" ON "pa_mco_enrollment" ("county_name");

CREATE TABLE IF NOT EXISTS "qhp_county_issuer" (
  "plan_year" varchar(4) NOT NULL,
  "county_fips" varchar(5) NOT NULL,
  "issuer_id" varchar(8) NOT NULL,
  "issuer_name" text NOT NULL,
  "market" varchar(20) NOT NULL,
  "plan_count" integer,
  "metals" text,
  "state_enrollment" integer,
  CONSTRAINT "qhp_county_issuer_pkey" PRIMARY KEY ("plan_year", "county_fips", "issuer_id", "market")
);
CREATE INDEX IF NOT EXISTS "idx_qhp_county_issuer_fips" ON "qhp_county_issuer" ("county_fips");

CREATE TABLE IF NOT EXISTS "cms_ma_star" (
  "rating_year" varchar(4) NOT NULL,
  "contract_id" varchar(16) NOT NULL,
  "organization_type" varchar(80),
  "contract_name" text,
  "marketing_name" text,
  "parent_organization" text,
  "snp" varchar(3),
  "part_c_rating" numeric(3,1),
  "part_d_rating" numeric(3,1),
  "overall_rating" numeric(3,1),
  CONSTRAINT "cms_ma_star_pkey" PRIMARY KEY ("rating_year", "contract_id")
);

CREATE TABLE IF NOT EXISTS "cms_ma_contract_county" (
  "period" varchar(7) NOT NULL,
  "county_fips" varchar(5) NOT NULL,
  "contract_id" varchar(16) NOT NULL,
  "enrollment" integer NOT NULL,
  CONSTRAINT "cms_ma_contract_county_pkey" PRIMARY KEY ("period", "county_fips", "contract_id")
);
CREATE INDEX IF NOT EXISTS "idx_cms_ma_contract_county_fips" ON "cms_ma_contract_county" ("county_fips");

CREATE TABLE IF NOT EXISTS "cms_mlr" (
  "reporting_year" varchar(4) NOT NULL,
  "state" varchar(2) NOT NULL,
  "market" varchar(20) NOT NULL,
  "company" text NOT NULL,
  "mlr" numeric(8,2),
  "mlr_denominator" numeric(16,2),
  "rebate" numeric(16,2),
  CONSTRAINT "cms_mlr_pkey" PRIMARY KEY ("reporting_year", "state", "market", "company")
);
CREATE INDEX IF NOT EXISTS "idx_cms_mlr_state" ON "cms_mlr" ("state");

CREATE TABLE IF NOT EXISTS "cms_oep_state" (
  "coverage_year" varchar(4) NOT NULL,
  "state" varchar(2) NOT NULL,
  "platform" varchar(20),
  "plan_selections" integer,
  "avg_premium" numeric(10,2),
  "avg_premium_after_aptc" numeric(10,2),
  CONSTRAINT "cms_oep_state_pkey" PRIMARY KEY ("coverage_year", "state")
);

CREATE TABLE IF NOT EXISTS "pa_aca_rate" (
  "plan_year" varchar(4) NOT NULL,
  "market" varchar(20) NOT NULL,
  "company" text NOT NULL,
  "on_marketplace" varchar(3),
  "requested_pct" numeric(6,2),
  "approved_pct" numeric(6,2),
  "market_share" numeric(6,2),
  CONSTRAINT "pa_aca_rate_pkey" PRIMARY KEY ("plan_year", "market", "company")
);

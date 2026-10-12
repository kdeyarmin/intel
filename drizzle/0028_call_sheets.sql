-- A marketer's saved call sheet for one county: the providers and facilities
-- they pulled, with a status, a next date and their own notes. The sheet
-- belongs to the organization; the accounts belong to the sheet.
CREATE TABLE IF NOT EXISTS "call_sheets" (
  "id" serial PRIMARY KEY,
  "org_id" integer,
  "name" varchar(255) NOT NULL,
  "state" varchar(2),
  "county_fips" varchar(5),
  "county_name" text,
  "account_count" integer DEFAULT 0,
  "created_by" varchar(255),
  "created_date" timestamp DEFAULT now(),
  "updated_date" timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "call_sheets_org_idx" ON "call_sheets" ("org_id");

CREATE TABLE IF NOT EXISTS "call_sheet_accounts" (
  "id" serial PRIMARY KEY,
  "sheet_id" integer NOT NULL REFERENCES "call_sheets" ("id") ON DELETE CASCADE,
  "account_kind" varchar(20) NOT NULL,
  "account_key" varchar(64) NOT NULL,
  "account_type" varchar(40) NOT NULL,
  "name" text,
  "city" varchar(100),
  "phone" varchar(50),
  "detail" text,
  "status" varchar(40) NOT NULL DEFAULT 'new',
  "next_date" varchar(10),
  "notes" text,
  "created_date" timestamp DEFAULT now(),
  "updated_date" timestamp DEFAULT now(),
  CONSTRAINT "call_sheet_accounts_unique" UNIQUE ("sheet_id", "account_type", "account_key")
);
CREATE INDEX IF NOT EXISTS "call_sheet_accounts_sheet_idx" ON "call_sheet_accounts" ("sheet_id");

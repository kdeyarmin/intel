-- A marketer's book of accounts for one organization: the people at each
-- account, the visits and calls, and the referrals those accounts sent.
-- Referrals do not store a patient name.
CREATE TABLE IF NOT EXISTS "crm_accounts" (
  "id" serial PRIMARY KEY,
  "org_id" integer,
  "account_key" varchar(64) NOT NULL,
  "account_type" varchar(40) NOT NULL,
  "name" text NOT NULL,
  "city" varchar(100),
  "phone" varchar(50),
  "created_date" timestamp DEFAULT now(),
  "updated_date" timestamp DEFAULT now(),
  CONSTRAINT "crm_accounts_org_key_uq" UNIQUE ("org_id", "account_type", "account_key")
);
CREATE INDEX IF NOT EXISTS "crm_accounts_org_idx" ON "crm_accounts" ("org_id");

CREATE TABLE IF NOT EXISTS "crm_contacts" (
  "id" serial PRIMARY KEY,
  "account_id" integer NOT NULL REFERENCES "crm_accounts" ("id") ON DELETE CASCADE,
  "role" varchar(40) NOT NULL,
  "name" varchar(255) NOT NULL,
  "phone" varchar(50),
  "email" varchar(255),
  "created_date" timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "crm_contacts_account_idx" ON "crm_contacts" ("account_id");

CREATE TABLE IF NOT EXISTS "crm_activities" (
  "id" serial PRIMARY KEY,
  "account_id" integer NOT NULL REFERENCES "crm_accounts" ("id") ON DELETE CASCADE,
  "kind" varchar(20) NOT NULL,
  "activity_date" varchar(10) NOT NULL,
  "done" boolean NOT NULL DEFAULT true,
  "note" text,
  "created_date" timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "crm_activities_account_idx" ON "crm_activities" ("account_id", "activity_date");

CREATE TABLE IF NOT EXISTS "crm_referrals" (
  "id" serial PRIMARY KEY,
  "account_id" integer NOT NULL REFERENCES "crm_accounts" ("id") ON DELETE CASCADE,
  "received_on" varchar(10) NOT NULL,
  "outcome" varchar(20) NOT NULL DEFAULT 'open',
  "admitted_on" varchar(10),
  "note" text,
  "created_date" timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "crm_referrals_account_idx" ON "crm_referrals" ("account_id", "received_on");

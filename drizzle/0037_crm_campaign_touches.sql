-- Links a marketing-book account to an outreach campaign. First touch, last
-- touch and influenced are derived from these dates; they are not stored.
CREATE TABLE IF NOT EXISTS "crm_campaign_touches" (
  "id" serial PRIMARY KEY,
  "account_id" integer NOT NULL REFERENCES "crm_accounts"("id") ON DELETE CASCADE,
  "campaign_id" integer NOT NULL REFERENCES "outreach_campaigns"("id") ON DELETE CASCADE,
  "touched_on" varchar(10) NOT NULL,
  "created_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "crm_campaign_touches_pair_uq" ON "crm_campaign_touches" ("account_id", "campaign_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_campaign_touches_campaign_idx" ON "crm_campaign_touches" ("campaign_id");

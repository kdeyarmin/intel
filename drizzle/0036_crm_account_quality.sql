-- Marketing-book fields the screens were dropping: pipeline stage, where the
-- account came from, tags, the NPI that ties it to the directory, and a
-- website/domain used to spot the same company under two names.
ALTER TABLE "crm_accounts" ADD COLUMN IF NOT EXISTS "stage" varchar(20) DEFAULT 'prospect';
--> statement-breakpoint
ALTER TABLE "crm_accounts" ADD COLUMN IF NOT EXISTS "source" varchar(40);
--> statement-breakpoint
ALTER TABLE "crm_accounts" ADD COLUMN IF NOT EXISTS "tags" text;
--> statement-breakpoint
ALTER TABLE "crm_accounts" ADD COLUMN IF NOT EXISTS "npi" varchar(10);
--> statement-breakpoint
ALTER TABLE "crm_accounts" ADD COLUMN IF NOT EXISTS "domain" varchar(255);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_accounts_npi_idx" ON "crm_accounts" ("org_id", "npi");

-- Organizations: one per customer. Every customer-owned row carries org_id,
-- members belong to one organization with an org role, plans and usage
-- back billing and quotas. Existing data is folded into organization 1 so
-- nothing is orphaned; today's admins become platform admins.
CREATE TABLE IF NOT EXISTS "organizations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" varchar(80) NOT NULL UNIQUE,
	"status" varchar(20) NOT NULL DEFAULT 'trial',
	"plan_code" varchar(40),
	"stripe_customer_id" varchar(80),
	"stripe_subscription_id" varchar(80),
	"subscription_status" varchar(40),
	"trial_ends_at" timestamp,
	"current_period_end" timestamp,
	"seat_limit" integer NOT NULL DEFAULT 3,
	"territory" jsonb NOT NULL DEFAULT '{"states":[],"county_fips":[]}'::jsonb,
	"quotas" jsonb,
	"sender" jsonb,
	"terms_version" varchar(20),
	"created_date" timestamp DEFAULT now(),
	"updated_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organization_members" (
	"org_id" integer NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
	"user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"org_role" varchar(20) NOT NULL DEFAULT 'member',
	"created_date" timestamp DEFAULT now(),
	PRIMARY KEY ("org_id", "user_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organization_members_user_idx" ON "organization_members" ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plans" (
	"code" varchar(40) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"stripe_price_id" varchar(80),
	"monthly_price_cents" integer,
	"seat_limit" integer NOT NULL DEFAULT 3,
	"territory_scope" varchar(20) NOT NULL DEFAULT 'county_pack',
	"max_counties" integer,
	"features" jsonb,
	"active" boolean NOT NULL DEFAULT true,
	"sort_order" integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "org_usage" (
	"org_id" integer NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
	"day" date NOT NULL,
	"ai_calls" integer NOT NULL DEFAULT 0,
	"ai_tokens" bigint NOT NULL DEFAULT 0,
	"exports" integer NOT NULL DEFAULT 0,
	"emails_sent" integer NOT NULL DEFAULT 0,
	PRIMARY KEY ("org_id", "day")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_platform_admin" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "terms_accepted_at" timestamp;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "terms_version" varchar(20);
--> statement-breakpoint
ALTER TABLE "lead_lists" ADD COLUMN IF NOT EXISTS "org_id" integer;
--> statement-breakpoint
ALTER TABLE "saved_filters" ADD COLUMN IF NOT EXISTS "org_id" integer;
--> statement-breakpoint
ALTER TABLE "custom_reports" ADD COLUMN IF NOT EXISTS "org_id" integer;
--> statement-breakpoint
ALTER TABLE "scheduled_reports" ADD COLUMN IF NOT EXISTS "org_id" integer;
--> statement-breakpoint
ALTER TABLE "scheduled_exports" ADD COLUMN IF NOT EXISTS "org_id" integer;
--> statement-breakpoint
ALTER TABLE "analytics_dashboards" ADD COLUMN IF NOT EXISTS "org_id" integer;
--> statement-breakpoint
ALTER TABLE "scoring_rules" ADD COLUMN IF NOT EXISTS "org_id" integer;
--> statement-breakpoint
ALTER TABLE "outreach_campaigns" ADD COLUMN IF NOT EXISTS "org_id" integer;
--> statement-breakpoint
ALTER TABLE "outreach_messages" ADD COLUMN IF NOT EXISTS "org_id" integer;
--> statement-breakpoint
ALTER TABLE "campaign_templates" ADD COLUMN IF NOT EXISTS "org_id" integer;
--> statement-breakpoint
ALTER TABLE "campaign_tasks" ADD COLUMN IF NOT EXISTS "org_id" integer;
--> statement-breakpoint
ALTER TABLE "data_quality_alerts" ADD COLUMN IF NOT EXISTS "org_id" integer;
--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "org_id" integer;
--> statement-breakpoint
ALTER TABLE "assistant_conversations" ADD COLUMN IF NOT EXISTS "org_id" integer;
--> statement-breakpoint
ALTER TABLE "assistant_actions" ADD COLUMN IF NOT EXISTS "org_id" integer;
--> statement-breakpoint
ALTER TABLE "assistant_usage" ADD COLUMN IF NOT EXISTS "org_id" integer;
--> statement-breakpoint
-- The plans a customer can choose. Prices are placeholders until Stripe price
-- ids are set (the Billing page says "contact us" for a plan without one).
INSERT INTO "plans" ("code", "name", "description", "monthly_price_cents", "seat_limit", "territory_scope", "max_counties", "features", "sort_order") VALUES
	('county_pack', 'County Pack', 'Up to 5 counties of your choice. For a single home or agency.', 29900, 3, 'county_pack', 5, '{"quotas":{"ai_calls":100,"emails_sent":500,"exports":50}}'::jsonb, 1),
	('state', 'State', 'Every county in one state. For regional operators.', 89900, 10, 'state', NULL, '{"quotas":{"ai_calls":500,"emails_sent":5000,"exports":500}}'::jsonb, 2),
	('national', 'National', 'Every state and county. For multi-state groups and consultants.', 249900, 25, 'national', NULL, '{"quotas":{"ai_calls":2000,"emails_sent":20000,"exports":5000}}'::jsonb, 3)
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint
-- Fold everything that exists today into one organization with no limits.
INSERT INTO "organizations" ("id", "name", "slug", "status", "plan_code", "seat_limit", "territory")
VALUES (1, 'CareMetric (legacy)', 'legacy', 'active', 'national', 1000, '{"states":[],"county_fips":[]}'::jsonb)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
SELECT setval('organizations_id_seq', GREATEST(1, (SELECT max("id") FROM "organizations")));
--> statement-breakpoint
INSERT INTO "organization_members" ("org_id", "user_id", "org_role")
SELECT 1, "id", CASE WHEN "role" = 'admin' THEN 'owner' ELSE 'member' END FROM "users"
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "users" SET "is_platform_admin" = true WHERE "role" = 'admin' AND "is_platform_admin" = false;
--> statement-breakpoint
UPDATE "lead_lists" SET "org_id" = 1 WHERE "org_id" IS NULL;
--> statement-breakpoint
UPDATE "saved_filters" SET "org_id" = 1 WHERE "org_id" IS NULL;
--> statement-breakpoint
UPDATE "custom_reports" SET "org_id" = 1 WHERE "org_id" IS NULL;
--> statement-breakpoint
UPDATE "scheduled_reports" SET "org_id" = 1 WHERE "org_id" IS NULL;
--> statement-breakpoint
UPDATE "scheduled_exports" SET "org_id" = 1 WHERE "org_id" IS NULL;
--> statement-breakpoint
UPDATE "analytics_dashboards" SET "org_id" = 1 WHERE "org_id" IS NULL;
--> statement-breakpoint
UPDATE "scoring_rules" SET "org_id" = 1 WHERE "org_id" IS NULL;
--> statement-breakpoint
UPDATE "outreach_campaigns" SET "org_id" = 1 WHERE "org_id" IS NULL;
--> statement-breakpoint
UPDATE "outreach_messages" SET "org_id" = 1 WHERE "org_id" IS NULL;
--> statement-breakpoint
UPDATE "campaign_templates" SET "org_id" = 1 WHERE "org_id" IS NULL;
--> statement-breakpoint
UPDATE "campaign_tasks" SET "org_id" = 1 WHERE "org_id" IS NULL;
--> statement-breakpoint
UPDATE "data_quality_alerts" SET "org_id" = 1 WHERE "org_id" IS NULL;
--> statement-breakpoint
UPDATE "audit_events" SET "org_id" = 1 WHERE "org_id" IS NULL;
--> statement-breakpoint
UPDATE "assistant_conversations" SET "org_id" = 1 WHERE "org_id" IS NULL;
--> statement-breakpoint
UPDATE "assistant_actions" SET "org_id" = 1 WHERE "org_id" IS NULL;
--> statement-breakpoint
UPDATE "assistant_usage" SET "org_id" = 1 WHERE "org_id" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lead_lists_org_idx" ON "lead_lists" ("org_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saved_filters_org_idx" ON "saved_filters" ("org_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "custom_reports_org_idx" ON "custom_reports" ("org_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scheduled_reports_org_idx" ON "scheduled_reports" ("org_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scheduled_exports_org_idx" ON "scheduled_exports" ("org_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_dashboards_org_idx" ON "analytics_dashboards" ("org_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scoring_rules_org_idx" ON "scoring_rules" ("org_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outreach_campaigns_org_idx" ON "outreach_campaigns" ("org_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outreach_messages_org_idx" ON "outreach_messages" ("org_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaign_templates_org_idx" ON "campaign_templates" ("org_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaign_tasks_org_idx" ON "campaign_tasks" ("org_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "data_quality_alerts_org_idx" ON "data_quality_alerts" ("org_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_events_org_idx" ON "audit_events" ("org_id", "created_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assistant_conversations_org_idx" ON "assistant_conversations" ("org_id");

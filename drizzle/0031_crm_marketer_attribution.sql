-- Marketer attribution for the CRM module (Team Marketing).
--
-- Two separate ideas, stored separately on purpose:
--   1. ATTRIBUTION: who logged a visit/call or a referral. user_id on
--      crm_activities and crm_referrals records the marketer who did the work.
--      Reports attribute by this column, NEVER by who claimed the account.
--   2. CLAIM: which marketer's book of business an account sits in.
--      claimed_by_user_id on crm_accounts says whose book the account is on.
--      Claims only define book membership; they never move credit for work.
--
-- Existing rows keep user_id NULL (shown as "Previously logged" in reports).
-- Referrals still never store a patient name.

-- Who logged the activity. NULL = logged before attribution existed.
ALTER TABLE "crm_activities"
  ADD COLUMN IF NOT EXISTS "user_id" integer REFERENCES "users" ("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "crm_activities_user_idx" ON "crm_activities" ("user_id");

-- Who logged the referral. NULL = logged before attribution existed.
ALTER TABLE "crm_referrals"
  ADD COLUMN IF NOT EXISTS "user_id" integer REFERENCES "users" ("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "crm_referrals_user_idx" ON "crm_referrals" ("user_id");

-- Whose book of business the account sits on. NULL = unclaimed.
ALTER TABLE "crm_accounts"
  ADD COLUMN IF NOT EXISTS "claimed_by_user_id" integer REFERENCES "users" ("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "claimed_at" timestamp;
CREATE INDEX IF NOT EXISTS "crm_accounts_claimed_idx" ON "crm_accounts" ("claimed_by_user_id");

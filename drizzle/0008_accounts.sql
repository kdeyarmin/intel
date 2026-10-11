-- Account approval, revocable sessions, and reset/invite links.
-- status defaults to 'active' so existing accounts keep working; new signups
-- are inserted as 'pending' by the API.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "status" varchar(20) DEFAULT 'active' NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "token_version" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_login_at" timestamp;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "approved_at" timestamp;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "approved_by" varchar(255);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "disabled_at" timestamp;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "disabled_reason" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_changed_at" timestamp;
--> statement-breakpoint
-- Accounts that predate approval count as approved when they were created.
UPDATE "users" SET "approved_at" = COALESCE("created_date", now()) WHERE "approved_at" IS NULL AND "status" = 'active';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"purpose" varchar(20) NOT NULL,
	"token_hash" varchar(64) NOT NULL UNIQUE,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_by" varchar(255),
	"created_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_tokens_user_idx" ON "auth_tokens" ("user_id");
--> statement-breakpoint
-- Case-insensitive unique emails. Skipped (with a notice) while two accounts
-- differ only by case; login still matches case-insensitively. The boot index
-- runner (server/lib/bootIndexes.ts) retries it at every boot, so it appears
-- once the duplicates are merged.
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM "users" GROUP BY lower("email") HAVING count(*) > 1) THEN
		CREATE UNIQUE INDEX IF NOT EXISTS "users_email_lower_uq" ON "users" (lower("email"));
	ELSE
		RAISE NOTICE 'users has emails that differ only by case; users_email_lower_uq will be built at boot once they are merged';
	END IF;
END $$;
--> statement-breakpoint
-- Sign-in attempts per email, counted in the database so the lockout holds
-- across server instances and restarts (server/lib/userRepo.ts,
-- countLoginAttempt). A row lasts one window; ended windows are deleted.
CREATE TABLE IF NOT EXISTS "login_attempts" (
	"email" varchar(255) PRIMARY KEY NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"window_ends_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "login_attempts_window_ends_idx" ON "login_attempts" ("window_ends_at");

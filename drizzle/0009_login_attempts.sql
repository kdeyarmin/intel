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

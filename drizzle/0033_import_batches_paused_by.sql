-- Distinguish user-requested pauses from system pauses on import batches, so
-- the NPPES crawler queue worker (and the auto-resume maintenance worker)
-- only auto-wake system-paused batches and never override an explicit user pause.
ALTER TABLE "import_batches" ADD COLUMN IF NOT EXISTS "paused_by" varchar(10);

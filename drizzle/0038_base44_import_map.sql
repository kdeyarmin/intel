-- Idempotency map for the one-time Base44 export import
-- (scripts/base44/import-from-base44.ts). A source row that is already
-- listed here is left unchanged on the next run.
CREATE TABLE IF NOT EXISTS "base44_import_map" (
  "entity" varchar(80) NOT NULL,
  "source_id" varchar(80) NOT NULL,
  "target_table" varchar(80) NOT NULL,
  "target_id" integer NOT NULL,
  "imported_at" timestamp DEFAULT now(),
  PRIMARY KEY ("entity", "source_id")
);

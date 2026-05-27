CREATE TABLE "medicare_facilities_raw" (
	"facility_id" integer PRIMARY KEY NOT NULL,
	"raw_data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "medicare_facilities_raw" ADD CONSTRAINT "medicare_facilities_raw_facility_id_medicare_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."medicare_facilities"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Backfill existing raw_data into the side table in batches so a single
-- statement can't lock the hot facilities table for too long. ON CONFLICT
-- makes the migration safely re-runnable. The medicare_facilities.raw_data
-- column itself is preserved (phase 1 of the split); a follow-up migration
-- drops it after dual-write has soaked in prod.
DO $$
DECLARE
  batch_size constant int := 5000;
  moved int := 0;
BEGIN
  LOOP
    WITH src AS (
      SELECT mf.id, mf.raw_data
      FROM medicare_facilities mf
      LEFT JOIN medicare_facilities_raw mfr ON mfr.facility_id = mf.id
      WHERE mf.raw_data IS NOT NULL
        AND mfr.facility_id IS NULL
      ORDER BY mf.id
      LIMIT batch_size
    )
    INSERT INTO medicare_facilities_raw (facility_id, raw_data, updated_at)
    SELECT id, raw_data, NOW() FROM src
    ON CONFLICT (facility_id) DO NOTHING;
    GET DIAGNOSTICS moved = ROW_COUNT;
    EXIT WHEN moved = 0;
  END LOOP;
END $$;
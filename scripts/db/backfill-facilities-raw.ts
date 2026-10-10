// Copy medicare_facilities.raw_data into the medicare_facilities_raw side table
// for rows that don't have it yet.
//
// Migration 0002 does this backfill, but a database built with db:push gets
// 0002 recorded as applied without running it (see NON_IDEMPOTENT_MARKERS in
// server/db/migrationPlan.ts). Readers fall back to the old column, so nothing
// is missing today; run this before medicare_facilities.raw_data is dropped.
//
// Walks the table in primary-key order, one short transaction per batch, so it
// never holds a long lock and can be stopped and re-run at any point.
//   npm run db:backfill-facilities-raw
//   npm run db:backfill-facilities-raw -- --batch=2000 --from-id=123456
import { pool } from "../../server/db";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const batch = Number(arg("batch") ?? 5000);
let lastId = Number(arg("from-id") ?? 0);
if (!Number.isInteger(batch) || batch <= 0 || !Number.isInteger(lastId) || lastId < 0) {
  console.error("--batch must be a positive integer and --from-id a non-negative integer.");
  process.exit(1);
}

async function main() {
  let copied = 0;
  for (;;) {
    const { rows } = await pool.query(
      `WITH src AS (
         SELECT id, raw_data FROM medicare_facilities
          WHERE id > $1 ORDER BY id LIMIT $2
       ), ins AS (
         INSERT INTO medicare_facilities_raw (facility_id, raw_data, updated_at)
         SELECT id, raw_data, now() FROM src WHERE raw_data IS NOT NULL
         ON CONFLICT (facility_id) DO NOTHING
         RETURNING 1
       )
       SELECT (SELECT max(id) FROM src) AS last_id, (SELECT count(*) FROM ins)::int AS copied`,
      [lastId, batch],
    );
    if (rows[0].last_id == null) break;
    lastId = Number(rows[0].last_id);
    copied += rows[0].copied;
    console.log(`[backfill] through id ${lastId}: ${copied} row(s) copied so far`);
  }
  console.log(`[backfill] Done. Copied ${copied} row(s).`);
}

main()
  .then(() => pool.end())
  .catch(async (e) => {
    console.error(`[backfill] Failed after id ${lastId}:`, e?.message || e, `(re-run with --from-id=${lastId} to resume)`);
    await pool.end().catch(() => {});
    process.exit(1);
  });

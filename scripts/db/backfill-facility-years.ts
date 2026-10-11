// Stamp data_year on medicare_facilities rows imported before the importer set
// it (server/functions/triggerImport.ts now writes it on every row). The year
// comes from the batch that imported the row: retry_params.year is the year
// the import resolved for the dataset.
//
// Walks the table in primary-key order, one short statement per batch, so it
// never holds a long lock and can be stopped and re-run at any point.
//   npm run db:backfill-facility-years
//   npm run db:backfill-facility-years -- --batch=20000 --from-id=123456
import { pool } from "../../server/db";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const batch = Number(arg("batch") ?? 20000);
let lastId = Number(arg("from-id") ?? 0);
if (!Number.isInteger(batch) || batch <= 0 || !Number.isInteger(lastId) || lastId < 0) {
  console.error("--batch must be a positive integer and --from-id a non-negative integer.");
  process.exit(1);
}

async function main() {
  const { rows: [bounds] } = await pool.query("SELECT max(id) AS hi FROM medicare_facilities");
  const hi = Number(bounds?.hi ?? 0);
  let stamped = 0;
  while (lastId < hi) {
    const next = lastId + batch;
    const { rowCount } = await pool.query(
      `UPDATE medicare_facilities f
          SET data_year = left(b.retry_params->>'year', 10)
         FROM import_batches b
        WHERE f.id > $1 AND f.id <= $2
          AND f.data_year IS NULL
          AND f.import_batch_id ~ '^[0-9]+$'
          AND b.id = f.import_batch_id::integer
          AND b.retry_params->>'year' ~ '^[0-9]{4}'`,
      [lastId, next],
    );
    stamped += rowCount || 0;
    lastId = next;
    console.log(`[backfill] through id ${Math.min(lastId, hi)}: ${stamped} row(s) stamped so far`);
  }
  console.log(`[backfill] Done. Stamped ${stamped} row(s). Rows whose batch recorded no year keep NULL.`);
}

main()
  .then(() => pool.end())
  .catch(async (e) => {
    console.error(`[backfill] Failed after id ${lastId}:`, e?.message || e, `(re-run with --from-id=${lastId} to resume)`);
    await pool.end().catch(() => {});
    process.exit(1);
  });

// Remove the medicare_facilities rows of datasets that now have typed tables
// (server/functions/cmsTypedTables.ts). Those rows were collapsed to one per
// provider on import (the Hospital Service Area kept one ZIP per hospital),
// so they are not data to keep; the typed tables are rebuilt by re-importing.
//
// Run AFTER the typed re-imports have completed. Deletes in primary-key
// ranges, one short statement each (idx_medfac_type_state serves the type
// filter), and cascades to medicare_facilities_raw.
//   npm run db:retire-typed-facility-rows
//   npm run db:retire-typed-facility-rows -- --types=hospital_service_area,medicare_snf_utilization --range=100000
import { pool } from "../../server/db";
import { TYPED_IMPORT_TYPES } from "../../server/functions/cmsTypedTables";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const range = Number(arg("range") ?? 100000);
const types = (arg("types")?.split(",").map((t) => t.trim()).filter(Boolean)) ?? [...TYPED_IMPORT_TYPES];
const unknown = types.filter((t) => !TYPED_IMPORT_TYPES.has(t));
if (unknown.length || !Number.isInteger(range) || range <= 0) {
  console.error(unknown.length ? `Not typed import types: ${unknown.join(", ")}` : "--range must be a positive integer.");
  process.exit(1);
}

async function main() {
  for (const type of types) {
    const { rows: [typed] } = await pool.query("SELECT count(*)::int AS n FROM dataset_versions WHERE import_type = $1 AND status = 'current'", [type]);
    if (!typed?.n) {
      console.log(`[retire] ${type}: typed import not recorded as current yet; skipping (import it first)`);
      continue;
    }
    const { rows: [bounds] } = await pool.query("SELECT min(id) AS lo, max(id) AS hi FROM medicare_facilities WHERE facility_type = $1", [type]);
    if (bounds.lo == null) {
      console.log(`[retire] ${type}: no facility rows`);
      continue;
    }
    let deleted = 0;
    for (let from = Number(bounds.lo) - 1; from < Number(bounds.hi); from += range) {
      const { rowCount } = await pool.query(
        "DELETE FROM medicare_facilities WHERE facility_type = $1 AND id > $2 AND id <= $3",
        [type, from, Math.min(from + range, Number(bounds.hi))],
      );
      deleted += rowCount || 0;
    }
    console.log(`[retire] ${type}: deleted ${deleted} collapsed facility row(s)`);
  }
}

main()
  .then(() => pool.end())
  .catch(async (e) => {
    console.error("[retire] Failed:", e?.message || e);
    await pool.end().catch(() => {});
    process.exit(1);
  });

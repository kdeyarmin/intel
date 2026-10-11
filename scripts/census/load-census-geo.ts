// Loads the bundled Census geography into the geo_* tables.
// Usage: npm run geo:load [-- --force]
import { pool } from "../../server/db";
import { loadCensusGeography } from "../../server/lib/census/load";

loadCensusGeography(pool, { force: process.argv.includes("--force"), log: console })
  .then(async (r) => {
    if (r.status === "unchanged") console.log(`[census] Already loaded (${r.vintage}); use --force to reload.`);
    await pool.end();
  })
  .catch(async (e) => {
    console.error("[census] Failed:", e?.message || e);
    await pool.end().catch(() => {});
    process.exit(1);
  });

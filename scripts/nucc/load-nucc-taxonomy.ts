// Loads the bundled NUCC taxonomy into nucc_taxonomies.
// Usage: npm run nucc:load [-- --force]
import { pool } from "../../server/db";
import { loadNuccTaxonomies } from "../../server/lib/nucc/load";

loadNuccTaxonomies(pool, { force: process.argv.includes("--force"), log: console })
  .then(async (r) => {
    if (r.status === "unchanged") console.log(`[nucc] Already loaded (version ${r.version}); use --force to reload.`);
    await pool.end();
  })
  .catch(async (e) => {
    console.error("[nucc] Failed:", e?.message || e);
    await pool.end().catch(() => {});
    process.exit(1);
  });

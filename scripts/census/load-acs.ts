// Loads the bundled ACS demographics into census_acs_county / census_acs_zcta.
// Usage: npm run acs:load [-- --force]
import { pool } from "../../server/db";
import { loadAcsDemographics } from "../../server/lib/census/acs";

loadAcsDemographics(pool, { force: process.argv.includes("--force"), log: console })
  .then(async (r) => {
    if (r.status === "unchanged") console.log(`[acs] Already loaded (${r.vintage}); use --force to reload.`);
    await pool.end();
  })
  .catch(async (e) => {
    console.error("[acs] Failed:", e?.message || e);
    await pool.end().catch(() => {});
    process.exit(1);
  });

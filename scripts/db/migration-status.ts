// Show which migrations a database has recorded. Usage: npm run db:status
import { pool } from "../../server/db";
import { migrationStatus } from "../../server/db/migrate";

migrationStatus(pool)
  .then(async ({ applied, pending }) => {
    console.log(`Applied (${applied.length}):`);
    for (const t of applied) console.log(`  ✓ ${t}`);
    console.log(`Pending (${pending.length}):`);
    for (const t of pending) console.log(`  • ${t}`);
    if (applied.length === 0 && pending.length > 0) {
      console.log("\nNo history recorded. `npm run db:migrate` will baseline a db:push-built database before migrating.");
    }
    await pool.end();
  })
  .catch(async (e) => {
    console.error(e?.message || e);
    await pool.end().catch(() => {});
    process.exit(1);
  });

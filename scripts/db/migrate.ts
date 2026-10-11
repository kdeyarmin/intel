// Apply pending drizzle migrations (baselining a db:push-built database first).
// Usage: npm run db:migrate
import { pool } from "../../server/db";
import { runMigrations } from "../../server/db/migrate";

runMigrations(pool)
  .then(async (status) => {
    console.log(`[migrate] ${status.applied.length} applied, ${status.pending.length} pending`);
    await pool.end();
  })
  .catch(async (e) => {
    console.error("[migrate] Failed:", e?.message || e);
    await pool.end().catch(() => {});
    process.exit(1);
  });

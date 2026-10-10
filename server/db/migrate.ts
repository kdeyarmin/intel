// Applies drizzle migrations safely. Used by `npm run db:migrate`, the Replit
// post-merge hook, and (when DB_MIGRATE_ON_BOOT=true) server start-up.
//
// - An advisory lock stops two instances migrating at once.
// - A database built with `drizzle-kit push` (schema but no history) is
//   baselined first, so the non-idempotent early migrations aren't replayed.
import path from "path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { migrationHash, planBaseline, readJournal } from "./migrationPlan";

const LOCK_KEY = 4206917; // arbitrary, constant across deploys
export const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, "..", "..", "drizzle");

type Log = Pick<Console, "log" | "warn">;

export interface MigrationStatus {
  applied: string[];
  pending: string[];
  baselined: string[];
}

async function historyCount(client: any): Promise<number> {
  const { rows } = await client.query(`SELECT to_regclass('drizzle.__drizzle_migrations') AS t`);
  if (!rows[0].t) return 0;
  const { rows: [{ n }] } = await client.query(`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`);
  return n;
}

async function existingTables(client: any): Promise<Set<string>> {
  const { rows } = await client.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`);
  return new Set(rows.map((r: any) => r.tablename));
}

/** Which journal entries are recorded as applied (by drizzle's created_at rule). */
export async function migrationStatus(pool: any): Promise<MigrationStatus> {
  const client = await pool.connect();
  try {
    return await migrationStatusFor(client, readJournal(MIGRATIONS_FOLDER));
  } finally {
    client.release();
  }
}

export async function runMigrations(pool: any, log: Log = console): Promise<MigrationStatus> {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_KEY]);
    try {
      const journal = readJournal(MIGRATIONS_FOLDER);
      const baseline = planBaseline({
        historyCount: await historyCount(client),
        existingTables: await existingTables(client),
        journal,
        hashOf: (tag) => migrationHash(MIGRATIONS_FOLDER, tag),
      });
      if (baseline.length) {
        log.log(`[migrate] Database was built with drizzle-kit push; recording ${baseline.map((b) => b.tag).join(", ")} as applied`);
        // All or nothing: a partial baseline would count as history, so the
        // next run would skip baselining and replay the rest from scratch.
        await client.query("BEGIN");
        try {
          await client.query("CREATE SCHEMA IF NOT EXISTS drizzle");
          await client.query(
            "CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)",
          );
          for (const row of baseline) {
            await client.query("INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)", [row.hash, row.created_at]);
          }
          await client.query("COMMIT");
        } catch (e) {
          await client.query("ROLLBACK").catch(() => {});
          throw e;
        }
        if (baseline.some((b) => b.tag === "0002_medicare_facilities_raw")) {
          log.log("[migrate] 0002's medicare_facilities_raw backfill was not run; readers fall back to medicare_facilities.raw_data. Run `npm run db:backfill-facilities-raw` before that column is dropped.");
        }
      }
      const before = await migrationStatusFor(client, journal);
      await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });
      const after = await migrationStatusFor(client, journal);
      const ran = before.pending.filter((t) => !after.pending.includes(t));
      log.log(ran.length ? `[migrate] Applied ${ran.join(", ")}` : "[migrate] Database is up to date");
      return { ...after, baselined: baseline.map((b) => b.tag) };
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]).catch(() => {});
    }
  } finally {
    client.release();
  }
}

async function migrationStatusFor(client: any, journal: ReturnType<typeof readJournal>): Promise<MigrationStatus> {
  let last = 0;
  if ((await historyCount(client)) > 0) {
    const { rows } = await client.query(`SELECT max(created_at)::bigint AS last FROM drizzle.__drizzle_migrations`);
    last = Number(rows[0].last) || 0;
  }
  return {
    applied: journal.filter((e) => e.when <= last).map((e) => e.tag),
    pending: journal.filter((e) => e.when > last).map((e) => e.tag),
    baselined: [],
  };
}

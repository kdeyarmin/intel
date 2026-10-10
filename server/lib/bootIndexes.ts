// Indexes on the large tables are built at boot, in the background and
// CONCURRENTLY, so they never block writes or a deploy. They can't live in
// drizzle migrations: the migrator runs inside a transaction, where
// CREATE INDEX CONCURRENTLY isn't allowed.
//
// They also aren't declared in schema.ts, so `drizzle-kit push` would drop
// them. Never point push at a database these have been built on; use the
// migration runner (scripts/db/migrate.ts) instead.

export interface BootIndex {
  name: string;
  ddl: string;
}

const idx = (ddl: string): BootIndex => {
  const name = ddl.match(/IF NOT EXISTS (\S+)/)?.[1];
  if (!name) throw new Error(`Boot index DDL needs "IF NOT EXISTS <name>": ${ddl}`);
  return { name, ddl };
};

export const BOOT_INDEXES: BootIndex[] = [
  idx("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_medfac_type_name ON medicare_facilities (facility_type, facility_name)"),
  idx("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_medfac_provider_id ON medicare_facilities (provider_id)"),
  idx("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_medfac_type_state ON medicare_facilities (facility_type, state)"),
  // Unique backstops enforcing each table's natural key. Best-effort: a build
  // FAILS (and is logged) while duplicate rows still exist, so run
  // scripts/dedupe-existing-imports.sql once first. The importers use
  // onConflictDoNothing(), so once these exist re-imports and resumes are
  // idempotent at the DB level.
  idx("CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_medfac_type_provider ON medicare_facilities (facility_type, provider_id) WHERE provider_id IS NOT NULL"),
  idx("CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_medfac_type_name ON medicare_facilities (facility_type, md5(lower(facility_name))) WHERE provider_id IS NULL AND facility_name IS NOT NULL"),
  // Provider-pair shared-patient rows (Physician Shared Patient Patterns) are
  // unique on (npi, referred_to_npi, data_year). The old (npi, data_year)
  // index is dropped as obsolete below.
  idx("CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_cms_referrals_npi_referred_year ON cms_referrals (npi, COALESCE(referred_to_npi, ''), data_year)"),
  idx("CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_psu_natural ON provider_service_utilization (npi, COALESCE(hcpcs_code,''), COALESCE(place_of_service,''), data_year)"),
  idx("CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_prov_loc_natural ON provider_locations (npi, COALESCE(location_type,''), left(coalesce(zip,''),5), md5(lower(btrim(coalesce(address_1,'')))))"),
  idx("CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_prov_tax_natural ON provider_taxonomies (npi, COALESCE(taxonomy_code,''))"),
  // Inbound referral lookups (who refers to these providers) for network analysis.
  idx("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cms_referrals_referred_to ON cms_referrals (referred_to_npi) WHERE referred_to_npi IS NOT NULL"),
  // Bulk email verification picks providers that have an email; only a small
  // share of the ~6M providers do, so a partial index avoids a full scan.
  idx("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_providers_with_email ON providers (email_analyzed_at NULLS FIRST, id) WHERE email IS NOT NULL AND email <> ''"),
  // Recent events of one type, newest first: account activity on Admin
  // Settings and the maintenance heartbeat. audit_events only grows.
  idx("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_events_type_created ON audit_events (event_type, created_date DESC)"),
  // Case-insensitive unique emails. Migration 0008 creates it when it can;
  // while two accounts differ only by case the build fails (and is logged)
  // at every boot, and succeeds on the first boot after they're merged.
  idx("CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS users_email_lower_uq ON users (lower(email))"),
];

// A CONCURRENTLY build that fails (or is interrupted) leaves an INVALID index
// behind, and IF NOT EXISTS would then skip it forever. Invalid indexes on
// these tables are dropped at boot so the build is retried.
export const SWEEP_TABLES = [
  "medicare_facilities",
  "cms_referrals",
  "provider_service_utilization",
  "provider_locations",
  "provider_taxonomies",
  "providers",
  "users",
  "audit_events",
];

// Still-valid indexes whose natural key changed and must be rebuilt under a
// new name. cms_referrals moved from one row per (npi, year) to provider
// pairs, so its uniqueness now includes referred_to_npi.
export const OBSOLETE_INDEXES = ["uq_cms_referrals_npi_year"];

type Log = Pick<Console, "log" | "warn">;

// Held for the whole sweep and build, so only one instance does it. Without
// it, an instance booting mid-build would see the other's CONCURRENTLY build
// (invalid until it finishes) as failed and drop it.
export const BOOT_INDEX_LOCK = 4206918; // arbitrary; distinct from the migration lock

async function run(client: any, timeout: string, sql: string) {
  await client.query(`SET statement_timeout = '${timeout}'`);
  await client.query(sql);
}

/** Drop invalid and obsolete indexes, then build any missing boot indexes. Never throws. */
export async function runBootIndexes(pool: any, log: Log = console): Promise<void> {
  let client: any;
  try {
    client = await pool.connect();
  } catch (e: any) {
    log.warn("[DB Index] Background index creation failed:", e.message?.substring(0, 120));
    return;
  }
  let locked = false;
  try {
    const { rows: lock } = await client.query("SELECT pg_try_advisory_lock($1) AS locked", [BOOT_INDEX_LOCK]);
    locked = lock[0]?.locked === true;
    if (!locked) {
      log.log("[DB Index] Another instance is building boot indexes; skipping");
      return;
    }

    const { rows: invalid } = await client.query(
      `SELECT c2.relname AS indexname
         FROM pg_index i
         JOIN pg_class c ON c.oid = i.indrelid
         JOIN pg_class c2 ON c2.oid = i.indexrelid
        WHERE c.relname = ANY($1) AND NOT i.indisvalid`,
      [SWEEP_TABLES],
    ).catch(() => ({ rows: [] as Array<{ indexname: string }> }));
    const { rows: obsolete } = await client.query(
      `SELECT relname AS indexname FROM pg_class WHERE relkind = 'i' AND relname = ANY($1)`,
      [OBSOLETE_INDEXES],
    ).catch(() => ({ rows: [] as Array<{ indexname: string }> }));

    const toDrop = new Set([...invalid, ...obsolete].map((r: any) => r.indexname as string));
    for (const name of toDrop) {
      try {
        // CONCURRENTLY: a plain DROP INDEX locks the whole table against reads and writes.
        await run(client, "120000", `DROP INDEX CONCURRENTLY IF EXISTS "${name.replace(/"/g, '""')}"`);
        log.log(`[DB Index] Dropped ${OBSOLETE_INDEXES.includes(name) ? "obsolete" : "invalid"} index ${name}`);
      } catch (e: any) {
        log.warn(`[DB Index] Drop ${name} failed:`, e.message?.substring(0, 120));
      }
    }

    for (const { name, ddl } of BOOT_INDEXES) {
      try {
        await run(client, "0", ddl);
        log.log(`[DB Index] ${name} ready`);
      } catch (e: any) {
        log.warn(`[DB Index] ${name} failed:`, e.message?.substring(0, 200));
      }
    }
    log.log("[DB Index] Background index creation complete");
  } catch (e: any) {
    log.warn("[DB Index] Background index creation failed:", e.message?.substring(0, 120));
  } finally {
    if (locked) await client.query("SELECT pg_advisory_unlock($1)", [BOOT_INDEX_LOCK]).catch(() => {});
    // Don't hand the pooled connection back with a changed timeout.
    await client.query("RESET statement_timeout").catch(() => {});
    client.release();
  }
}

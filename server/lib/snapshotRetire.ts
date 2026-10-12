// Snapshot datasets (hospice and home health ZIP service areas, clinician
// facility affiliations) are keyed without a period, so a newer release only
// adds and updates rows: an agency that stopped serving a ZIP, or an
// affiliation that ended, would stay in the table and keep counting in the
// coverage and referral-source rollups. After a complete, unfiltered import
// the rows that batch didn't write have left the source and are removed here,
// in short chunks. "Didn't write" means written by an older batch: the next
// import can start while this runs, and the rows it upserts carry a newer id.
import { pool } from "../db";
import { TYPED_ROUTES } from "../functions/cmsTypedTables";

/** A table whose rows a complete release replaces. `key` is the unique column rows are deleted by (default `id`). */
export type SnapshotSpec = {
  table: string;
  /** One fixed slice of the table (a setting). */
  scope?: { column: string; value: string };
  /** Or the slices the batch wrote: one per distinct value of these columns (a licensing file's state and type). */
  scopeFromBatch?: string[];
  key?: string;
};

/**
 * Snapshot datasets that aren't typed routes. Order & Referring is a complete list per release: an NPI the
 * release no longer lists is no longer eligible to order, and without this it would stay eligible forever.
 */
const EXTRA_SNAPSHOTS: Record<string, SnapshotSpec> = {
  cms_order_referring: { table: "cms_order_referring", key: "npi" },
};

const snapshotOf = (importType: string): SnapshotSpec | undefined => TYPED_ROUTES[importType]?.snapshot ?? EXTRA_SNAPSHOTS[importType];

// Rows older than the batch (or from before batches were tracked): the only ones a release can have dropped.
const OLDER = "(import_batch_id IS NULL OR import_batch_id < $1)";

export const RETIRE_CHUNK = 20_000;

export type RetireDecision = { retire: true } | { retire: false; reason: string };

/**
 * Pure. Retire only when the batch wrote rows and they are the larger share:
 * a source that suddenly returns a small fraction of what is stored is a
 * truncated or filtered file, not a release that dropped most of the dataset.
 */
export function decideRetire(kept: number, stale: number): RetireDecision {
  if (stale <= 0) return { retire: false, reason: "nothing stale" };
  if (kept <= 0) return { retire: false, reason: "the import wrote no rows" };
  if (stale > kept) return { retire: false, reason: `would remove ${stale} rows and keep only ${kept}` };
  return { retire: true };
}

export interface RetireResult { retired: number; kept: number; stale: number; skipped?: string }

/**
 * Whether an import of this type and shape covers the whole dataset (and so can retire rows). A page that
 * failed to write (`errors`) leaves its rows with the previous batch's id, where they would read as dropped
 * from the release: any error means the write wasn't complete and nothing is retired.
 */
export function retiresSnapshot(importType: string, opts: { dry_run?: boolean; npi_filter?: unknown; state_filter?: unknown; errors?: number }): boolean {
  if (!snapshotOf(importType) || opts.dry_run || opts.npi_filter || Number(opts.errors) > 0) return false;
  // A state_filter narrows most feeds, but on a licensing file it only names the file's own state.
  return !opts.state_filter || !!TYPED_ROUTES[importType]?.stateFromParams;
}

type Scope = { sql: string; params: unknown[] };

/** The slices of the table this batch replaces: one fixed scope, one per (state, licence type) it wrote, or all of it. */
async function scopesFor(snap: SnapshotSpec, batchId: number, db: Pick<typeof pool, "query">): Promise<Scope[]> {
  if (snap.scope) return [{ sql: ` AND ${snap.scope.column} = $2`, params: [snap.scope.value] }];
  if (snap.scopeFromBatch?.length) {
    const cols = snap.scopeFromBatch;
    const { rows } = await db.query(`SELECT DISTINCT ${cols.join(", ")} FROM ${snap.table} WHERE import_batch_id = $1`, [batchId]);
    return rows.map((r: any) => ({
      sql: cols.map((c, i) => ` AND ${c} IS NOT DISTINCT FROM $${i + 2}`).join(""),
      params: cols.map((c) => r[c] ?? null),
    }));
  }
  return [{ sql: "", params: [] }];
}

export async function retireStaleSnapshotRows(
  importType: string,
  batchId: number,
  opts: { db?: Pick<typeof pool, "query">; log?: Pick<Console, "log" | "warn">; chunk?: number } = {},
): Promise<RetireResult> {
  const snap = snapshotOf(importType);
  if (!snap) return { retired: 0, kept: 0, stale: 0, skipped: "not a snapshot dataset" };
  const db = opts.db ?? pool;
  const log = opts.log ?? console;
  const chunk = Math.max(1, Math.floor(opts.chunk ?? RETIRE_CHUNK));
  const key = snap.key ?? "id";

  const total: RetireResult = { retired: 0, kept: 0, stale: 0 };
  const skipped: string[] = [];
  for (const scope of await scopesFor(snap, batchId, db)) {
    // Rows from a newer batch are neither stale nor this batch's: they belong to an import that started since.
    const { rows: [c] } = await db.query(
      `SELECT count(*) FILTER (WHERE import_batch_id >= $1)::int AS kept,
              count(*) FILTER (WHERE ${OLDER})::int AS stale
         FROM ${snap.table} WHERE true${scope.sql}`,
      [batchId, ...scope.params],
    );
    const kept = Number(c?.kept) || 0;
    const stale = Number(c?.stale) || 0;
    total.kept += kept;
    total.stale += stale;
    const decision = decideRetire(kept, stale);
    if (!decision.retire) {
      if (stale > 0) {
        log.warn(`[snapshotRetire] ${importType}: kept ${stale} older rows (${decision.reason})`);
        skipped.push(decision.reason);
      }
      continue;
    }
    for (;;) {
      // The outer statement repeats the predicate: a row picked by the subquery that an import upserts before
      // the delete reaches it is re-checked against its new version and kept.
      const res = await db.query(
        `DELETE FROM ${snap.table} WHERE ${OLDER}${scope.sql} AND ${key} IN (
           SELECT ${key} FROM ${snap.table} WHERE ${OLDER}${scope.sql} LIMIT ${chunk}
         )`,
        [batchId, ...scope.params],
      );
      const n = res.rowCount || 0;
      total.retired += n;
      if (n < chunk) break;
    }
  }
  if (total.retired > 0) {
    log.log(`[snapshotRetire] ${importType}: removed ${total.retired} rows that the latest release no longer lists (kept ${total.kept})`);
    await db.query(
      "UPDATE import_batches SET retry_params = COALESCE(retry_params, '{}'::jsonb) || $2::jsonb WHERE id = $1",
      [batchId, JSON.stringify({ retired_rows: total.retired })],
    ).catch(() => {});
  }
  if (total.retired === 0 && skipped.length) total.skipped = skipped[0];
  return total;
}

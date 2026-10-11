// Snapshot datasets (hospice and home health ZIP service areas, clinician
// facility affiliations) are keyed without a period, so a newer release only
// adds and updates rows: an agency that stopped serving a ZIP, or an
// affiliation that ended, would stay in the table and keep counting in the
// coverage and referral-source rollups. After a complete, unfiltered import
// the rows that batch didn't write have left the source and are removed here,
// in short chunks.
import { pool } from "../db";
import { TYPED_ROUTES } from "../functions/cmsTypedTables";

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

/** Whether an import of this type and shape covers the whole dataset (and so can retire rows). */
export function retiresSnapshot(importType: string, opts: { dry_run?: boolean; npi_filter?: unknown; state_filter?: unknown }): boolean {
  return !!TYPED_ROUTES[importType]?.snapshot && !opts.dry_run && !opts.npi_filter && !opts.state_filter;
}

export async function retireStaleSnapshotRows(
  importType: string,
  batchId: number,
  opts: { db?: Pick<typeof pool, "query">; log?: Pick<Console, "log" | "warn">; chunk?: number } = {},
): Promise<RetireResult> {
  const snap = TYPED_ROUTES[importType]?.snapshot;
  if (!snap) return { retired: 0, kept: 0, stale: 0, skipped: "not a snapshot dataset" };
  const db = opts.db ?? pool;
  const log = opts.log ?? console;
  const chunk = opts.chunk ?? RETIRE_CHUNK;
  const scope = snap.scope ? ` AND ${snap.scope.column} = $2` : "";
  const scopeParams = snap.scope ? [snap.scope.value] : [];

  const { rows: [c] } = await db.query(
    `SELECT count(*) FILTER (WHERE import_batch_id = $1)::int AS kept,
            count(*) FILTER (WHERE import_batch_id IS DISTINCT FROM $1)::int AS stale
       FROM ${snap.table} WHERE true${scope}`,
    [batchId, ...scopeParams],
  );
  const kept = Number(c?.kept) || 0;
  const stale = Number(c?.stale) || 0;
  const decision = decideRetire(kept, stale);
  if (!decision.retire) {
    if (stale > 0) log.warn(`[snapshotRetire] ${importType}: kept ${stale} older rows (${decision.reason})`);
    return { retired: 0, kept, stale, skipped: decision.reason };
  }

  let retired = 0;
  for (;;) {
    const res = await db.query(
      `DELETE FROM ${snap.table} WHERE id IN (
         SELECT id FROM ${snap.table} WHERE import_batch_id IS DISTINCT FROM $1${scope} LIMIT ${Math.max(1, Math.floor(chunk))}
       )`,
      [batchId, ...scopeParams],
    );
    const n = res.rowCount || 0;
    retired += n;
    if (n < chunk) break;
  }
  log.log(`[snapshotRetire] ${importType}: removed ${retired} rows that the latest release no longer lists (kept ${kept})`);
  await db.query(
    "UPDATE import_batches SET retry_params = COALESCE(retry_params, '{}'::jsonb) || $2::jsonb WHERE id = $1",
    [batchId, JSON.stringify({ retired_rows: retired })],
  ).catch(() => {});
  return { retired, kept, stale };
}

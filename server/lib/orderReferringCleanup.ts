// One-time cleanup: Order & Referring rows used to be written into
// cms_referrals with no target (referred_to_npi NULL) and the eligibility
// flags in raw_data. They now live in cms_order_referring, so the old rows
// come out of the referral graph. Walks the table by primary key in short
// statements (the partial boot index idx_cms_referrals_null_target covers
// both the probe and each range), so it is safe to run after every import.
import { pool } from "../db";

export const CLEANUP_RANGE = 200_000;

export async function purgeOrderReferringRows(opts: { range?: number; log?: Pick<Console, "log" | "warn"> } = {}): Promise<{ deleted: number; scanned_to: number }> {
  const range = opts.range ?? CLEANUP_RANGE;
  const log = opts.log ?? console;
  const probe = await pool.query("SELECT min(id) AS lo, max(id) AS hi FROM cms_referrals WHERE referred_to_npi IS NULL AND raw_data ? 'PARTB'");
  const lo = probe.rows[0]?.lo == null ? null : Number(probe.rows[0].lo);
  const hi = probe.rows[0]?.hi == null ? null : Number(probe.rows[0].hi);
  if (lo == null || hi == null) return { deleted: 0, scanned_to: 0 };
  let deleted = 0;
  for (let from = lo - 1; from < hi; from += range) {
    const { rowCount } = await pool.query(
      "DELETE FROM cms_referrals WHERE id > $1 AND id <= $2 AND referred_to_npi IS NULL AND raw_data ? 'PARTB'",
      [from, Math.min(from + range, hi)],
    );
    deleted += rowCount || 0;
  }
  log.log(`[orderReferringCleanup] removed ${deleted} eligibility rows from cms_referrals`);
  return { deleted, scanned_to: hi };
}

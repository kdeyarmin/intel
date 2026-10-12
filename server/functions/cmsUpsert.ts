// Natural-key de-duplication for CMS imports.
//
// The live CMS importer historically did blind `INSERT`s, so re-importing or
// restarting a dataset created a fresh copy of every row (medicare_facilities
// had grown to tens of millions of rows partly from this). These pure helpers
// let the importer look up already-stored rows by their natural key and skip
// duplicates, both against the database and within the same in-flight batch.
//
// Kept free of DB/Drizzle imports so they can be unit-tested directly.

export type CmsKeyConfig = {
  // Column queried with `IN (...)` to fetch candidate existing rows.
  primaryCol: string;
  // Full natural key used to decide identity (compared client-side).
  keyCols: string[];
  // Optional column the import is scoped by (e.g. facility_type / data_year).
  scopeCol?: string;
};

// import_type -> how to identify a duplicate row in its destination table.
// medicare_facilities is handled separately (it has two identity shapes:
// provider_id-based and facility_name-based) — see partitionFacilities.
export const CMS_NATURAL_KEYS: Record<string, CmsKeyConfig> = {
  // cms_order_referring is upserted into cms_order_referring by NPI (see insertCMSRows), not cms_referrals.
  provider_service_utilization: {
    primaryCol: "npi",
    // The CMS "by Provider and Service" dataset has one row per
    // (provider, HCPCS code, place of service). Keying on service_type alone
    // collapsed every one of a provider's service lines into a single row,
    // discarding the bulk of the dataset — key on the HCPCS service instead.
    keyCols: ["npi", "hcpcs_code", "place_of_service", "data_year"],
  },
  // Physician Shared Patient Patterns: one directed provider->provider edge per
  // (npi, referred_to_npi, data_year). Keyed so re-imports/resumes don't
  // multiply edges; the DB-level backstop is the unique index
  // uq_cms_referrals_npi_referred_year (see server/index.ts).
  physician_shared_patient_patterns: {
    primaryCol: "npi",
    keyCols: ["npi", "referred_to_npi", "data_year"],
  },
};

/**
 * Builds a stable natural key string from the specified columns of a row.
 *
 * @param row - The record (row) containing column values to use for the key.
 * @param cols - Ordered list of column names to include in the key.
 * @returns A string composed of the specified column values joined by `|` after trimming and lowercasing; missing or null values produce empty segments.
 */
export function makeKey(row: Record<string, unknown>, cols: string[]): string {
  return cols.map((c) => String(row[c] ?? "").trim().toLowerCase()).join("|");
}

export type PartitionResult<T> = { toCreate: T[]; skipped: number };

/**
 * Given incoming rows and the set of already-existing rows (fetched by the
 * caller), return the rows that are genuinely new. Also de-duplicates rows that
 * repeat within the same incoming batch.
 */
export function partition<T extends Record<string, unknown>>(
  rows: T[],
  existing: Record<string, unknown>[],
  keyCols: string[],
): PartitionResult<T> {
  const existingKeys = new Set(existing.map((e) => makeKey(e, keyCols)));
  const seen = new Set<string>();
  const toCreate: T[] = [];
  let skipped = 0;
  for (const r of rows) {
    const key = makeKey(r, keyCols);
    if (existingKeys.has(key) || seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);
    toCreate.push(r);
  }
  return { toCreate, skipped };
}

export type RefreshResult<T> = { toCreate: T[]; toRefresh: Array<{ id: number; row: T }>; skipped: number };

/**
 * Like partition, for datasets that keep one row per natural key and are
 * re-released: a row that already exists is refreshed in place when the
 * incoming row is not from the same batch (a resume re-reading its own pages)
 * and not from an older data year. Without this a new release found every
 * provider already stored, skipped every row, and the table stayed at the first
 * release forever while the registry reported the new one as imported.
 * The first row for a key wins within a batch, as before.
 */
export function partitionRefresh<T extends Record<string, unknown>>(
  rows: T[],
  existing: Array<Record<string, unknown> & { id: number }>,
  keyCols: string[],
): RefreshResult<T> {
  const existingByKey = new Map<string, Record<string, unknown> & { id: number }>();
  for (const e of existing) {
    const key = makeKey(e, keyCols);
    if (!existingByKey.has(key)) existingByKey.set(key, e);
  }
  const seen = new Set<string>();
  const toCreate: T[] = [];
  const toRefresh: Array<{ id: number; row: T }> = [];
  let skipped = 0;
  for (const r of rows) {
    const key = makeKey(r, keyCols);
    if (seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);
    const e = existingByKey.get(key);
    if (!e) {
      toCreate.push(r);
    } else if (isRefreshOf(e, r)) {
      toRefresh.push({ id: e.id, row: r });
    } else {
      skipped++;
    }
  }
  return { toCreate, toRefresh, skipped };
}

/** Whether `incoming` should overwrite `stored`: another batch's row, and not an older vintage. */
export function isRefreshOf(stored: Record<string, unknown>, incoming: Record<string, unknown>): boolean {
  if (stored.import_batch_id != null && String(stored.import_batch_id) === String(incoming.import_batch_id)) return false;
  const storedYear = yearOf(stored.data_year);
  const incomingYear = yearOf(incoming.data_year);
  if (storedYear != null && incomingYear != null && incomingYear < storedYear) return false;
  return true;
}

// A data year as a number, or null when it is missing or not a year (Number(null) is 0).
function yearOf(v: unknown): number | null {
  const n = parseInt(String(v ?? "").trim(), 10);
  return Number.isFinite(n) ? n : null;
}

// Distinct, non-empty values for a column across a set of rows.
export function distinctValues(rows: Record<string, unknown>[], col: string): string[] {
  const out = new Set<string>();
  for (const r of rows) {
    const v = r[col];
    if (v != null && String(v).trim() !== "") out.add(String(v));
  }
  return [...out];
}

// Total Medicare payment for one service line. The "by Provider and Service"
// dataset only publishes the *average* payment per service, so the true line
// total is average × number of services. Returns a fixed-2 numeric string, or
// null when either input isn't a usable positive number (so the column stays
// empty rather than storing a fabricated value).
export function deriveLineTotal(totalServices: unknown, averageAmount: unknown): string | null {
  const svcStr = String(totalServices ?? "").replace(/[^0-9.\-]/g, "");
  const avgStr = String(averageAmount ?? "").replace(/[^0-9.\-]/g, "");
  if (svcStr === "" || avgStr === "") return null;
  const svc = Number(svcStr);
  const avg = Number(avgStr);
  if (!Number.isFinite(svc) || !Number.isFinite(avg) || svc <= 0) return null;
  return (svc * avg).toFixed(2);
}

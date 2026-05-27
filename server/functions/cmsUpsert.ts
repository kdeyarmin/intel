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
  cms_order_referring: { primaryCol: "npi", keyCols: ["npi", "data_year"] },
  provider_service_utilization: {
    primaryCol: "npi",
    // The CMS "by Provider and Service" dataset has one row per
    // (provider, HCPCS code, place of service). Keying on service_type alone
    // collapsed every one of a provider's service lines into a single row,
    // discarding the bulk of the dataset — key on the HCPCS service instead.
    keyCols: ["npi", "hcpcs_code", "place_of_service", "data_year"],
  },
};

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

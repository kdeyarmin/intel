// SQL for the searchProviders function. Kept pure so it can be unit-tested.
//
// Matches by NPI prefix, by last / first / organization name prefix, and — for
// two-word queries — by full name in either order ("John Smith", "Smith John",
// "Smith, John"), which the single-column prefix match never found.

export interface ProviderSearchOptions {
  limit?: number;
  entityType?: "Individual" | "Organization" | null;
}

export interface SqlQuery {
  text: string;
  values: unknown[];
}

// The Providers and Organizations pages filter and sort these rows like entity
// rows: "Not searched" reads email_searched_at, "Last updated" updated_date.
const COLUMNS = `id, npi, entity_type, first_name, last_name, organization_name,
       credential, status, email, email_confidence, email_validation_status,
       email_source, email_searched_at, phone, created_date, updated_date`;

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

export function buildProviderSearchQuery(rawQuery: string, options: ProviderSearchOptions = {}): SqlQuery | null {
  const q = rawQuery.trim().replace(/\s+/g, " ");
  if (q.length < 2) return null;
  const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 500);
  const values: unknown[] = [];
  const param = (v: unknown) => {
    values.push(v);
    return `$${values.length}`;
  };

  const ors: string[] = [];
  const digits = q.replace(/\D/g, "");
  if (digits.length >= 2 && digits.length === q.replace(/[\s-]/g, "").length) {
    // Pure number: NPI lookup (exact for a full NPI, prefix otherwise).
    ors.push(digits.length === 10 ? `npi = ${param(digits)}` : `npi LIKE ${param(`${digits}%`)}`);
  } else {
    const prefix = param(`${escapeLike(q)}%`);
    ors.push(`last_name ILIKE ${prefix}`, `first_name ILIKE ${prefix}`, `organization_name ILIKE ${prefix}`);

    const parts = q.split(/\s*,\s*|\s+/).filter(Boolean);
    if (parts.length === 2) {
      const a = param(`${escapeLike(parts[0])}%`);
      const b = param(`${escapeLike(parts[1])}%`);
      // "First Last" and "Last, First" / "Last First".
      ors.push(`(first_name ILIKE ${a} AND last_name ILIKE ${b})`, `(last_name ILIKE ${a} AND first_name ILIKE ${b})`);
    }
  }

  let where = `(${ors.join(" OR ")})`;
  if (options.entityType === "Individual" || options.entityType === "Organization") {
    where += ` AND entity_type = ${param(options.entityType)}`;
  }

  return {
    text: `SELECT ${COLUMNS}
  FROM providers
 WHERE ${where}
 ORDER BY id DESC
 LIMIT ${param(limit)}`,
    values,
  };
}

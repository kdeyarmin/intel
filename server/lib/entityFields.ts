import { and, eq, gt, gte, inArray, isNotNull, isNull, like, lt, lte, ne, or, sql } from "drizzle-orm";

// Field handling for the generic entity router (routes/entities.ts).
//
// Drizzle silently ignores object keys that aren't table columns, both in
// inserts/updates and (via buildWhereClause) in filters. That hid a whole class
// of bugs: a filter on a misspelled column matched *every* row, and settings
// written under the wrong name vanished. These helpers make that explicit.

export class UnknownFieldError extends Error {
  status = 400;
  constructor(entity: string, field: string) {
    super(`Unknown filter field '${field}' on ${entity}`);
    this.name = "UnknownFieldError";
  }
}

/** A filter that can't be applied as written (bad operator or operand). */
export class InvalidFilterError extends Error {
  status = 400;
  constructor(message: string) {
    super(message);
    this.name = "InvalidFilterError";
  }
}

const SENSITIVE_WRITE_FIELDS = ["password_hash", "role"];
// Entities whose `role` column is ordinary data (a provider's role at an
// organization), not an account role, so it isn't stripped.
const ROLE_IS_DATA = new Set(["ProviderAffiliation"]);

/** Drop fields a generic entity write must never set (account roles, password hashes). */
export function sanitizeWriteData(entityName: string, data: Record<string, any>): Record<string, any> {
  const cleaned = { ...data };
  for (const field of SENSITIVE_WRITE_FIELDS) {
    if (field === "role" && ROLE_IS_DATA.has(entityName)) continue;
    delete cleaned[field];
  }
  return cleaned;
}

/** A provider's email verification result; it describes one address. */
export const EMAIL_VERIFICATION_COLUMNS = [
  "email_validation_status",
  "email_validation_reason",
  "email_quality_score",
  "email_quality_confidence",
  "email_quality_reasons",
  "email_quality_risk_flags",
  "email_analyzed_at",
];

/**
 * When an update sets a provider's email, clear the verification result unless
 * the address is unchanged (ignoring case) or the update sets those fields
 * itself. Done in SQL against the stored address, so it holds without a read.
 */
export function clearStaleEmailVerification<T extends Record<string, any>>(table: any, data: T): T {
  if (!("email" in data) || !table.email) return data;
  const next: Record<string, any> = { ...data };
  for (const col of EMAIL_VERIFICATION_COLUMNS) {
    if (col in next || !table[col]) continue;
    next[col] = sql`CASE WHEN ${emailChanged(table, data.email)} THEN NULL ELSE ${table[col]} END`;
  }
  return next as T;
}

const emailChanged = (table: any, email: unknown) =>
  sql`lower(coalesce(${table.email}, '')) IS DISTINCT FROM lower(coalesce(${email ?? null}::text, ''))`;

/**
 * For writers that set a provider's email together with their own unchecked
 * guess at its status (the AI email search). A different address loses the
 * old verification, as above. The same address keeps a stored DNS check
 * (email_analyzed_at set) rather than having its status replaced by a guess.
 */
export function unverifiedEmailUpdate<T extends Record<string, any>>(table: any, data: T): T {
  const next: Record<string, any> = clearStaleEmailVerification(table, data);
  if (!("email" in data) || !table.email) return next as T;
  for (const col of ["email_validation_status", "email_validation_reason"]) {
    if (!(col in data) || !table[col]) continue;
    next[col] = sql`CASE WHEN ${emailChanged(table, data.email)} OR ${table.email_analyzed_at} IS NULL THEN ${data[col] ?? null}::text ELSE ${table[col]} END`;
  }
  return next as T;
}

const FILTER_OPERATORS = new Set(["$in", "$nin", "$gt", "$gte", "$lt", "$lte", "$ne", "$like", "$exists"]);

export class InvalidFieldValueError extends Error {
  status = 400;
  constructor(field: string, value: unknown) {
    super(`Invalid date for '${field}': ${JSON.stringify(value)}`);
    this.name = "InvalidFieldValueError";
  }
}

/**
 * Drizzle's timestamp columns call value.toISOString(), so the ISO strings the
 * browser sends (e.g. cancelled_at: new Date().toISOString()) crashed the
 * request with "value.toISOString is not a function". Convert them to Dates;
 * an empty string clears the value.
 */
export function coerceColumnValue(column: any, field: string, value: unknown): unknown {
  if (column?.dataType !== "date" || value == null || value instanceof Date) return value;
  if (value === "") return null;
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) throw new InvalidFieldValueError(field, value);
    return d;
  }
  throw new InvalidFieldValueError(field, value);
}

export function coerceRowValues(table: any, data: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    out[key] = coerceColumnValue(table[key], key, value);
  }
  return out;
}

// "Settings bag" entities: the UI stores free-form form state on them. Keys that
// aren't real columns are kept in this jsonb column instead of being dropped,
// and are spread back onto the row when it is read.
export const JSONB_OVERFLOW: Record<string, string> = {
  CustomReport: "query_config",
  ScheduledReport: "config",
  ScheduledExport: "config",
  CMSApiConnector: "config",
  // UI-side batch metadata (file_url, column_mapping, category, ...). The
  // server never reads import_batches.config, so the keys can't collide.
  ImportBatch: "config",
  // Per-score explanation (score_breakdown, reasons, score_date).
  LeadScore: "details",
  // Rule parameters written by the validation-rule editor.
  ImportValidationRule: "config",
  // NPI Registry check details (status, registry name/address, taxonomies,
  // discrepancies), written by validateProviderNPI.
  ProviderNPIValidation: "validation_details",
};

const SYSTEM_FIELDS = new Set(["id", "created_date", "updated_date"]);

export interface SplitWrite {
  data: Record<string, any>;
  overflow: Record<string, any> | null;
  dropped: string[];
}

/**
 * Separate a write payload into real columns, overflow (for settings-bag
 * entities) and keys that will be dropped. `data` is assumed already
 * snake_cased and sanitized.
 */
export function splitWriteData(
  entity: string,
  columns: ReadonlySet<string>,
  data: Record<string, any>,
): SplitWrite {
  const overflowCol = JSONB_OVERFLOW[entity];
  const out: Record<string, any> = {};
  const overflow: Record<string, any> = {};
  const dropped: string[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (columns.has(key)) {
      out[key] = value;
    } else if (overflowCol && !SYSTEM_FIELDS.has(key)) {
      overflow[key] = value;
    } else if (!SYSTEM_FIELDS.has(key)) {
      dropped.push(key);
    }
  }

  if (overflowCol && Object.keys(overflow).length > 0) {
    // An explicit value for the overflow column itself is merged underneath the
    // loose keys (loose keys are the more specific, newer form state).
    const explicit = out[overflowCol];
    const base = explicit && typeof explicit === "object" && !Array.isArray(explicit) ? explicit : {};
    return { data: out, overflow: { ...base, ...overflow }, dropped };
  }
  return { data: out, overflow: null, dropped };
}

/** Spread a settings-bag entity's overflow keys onto the row (real columns win). */
export function expandOverflow(entity: string, row: Record<string, any>): Record<string, any> {
  const overflowCol = JSONB_OVERFLOW[entity];
  if (!overflowCol || !row) return row;
  const bag = row[overflowCol];
  if (!bag || typeof bag !== "object" || Array.isArray(bag)) return row;
  return { ...bag, ...row };
}

/**
 * Read-time derived fields. provider_locations has no is_primary column; the
 * NPPES "Practice" address is the primary one (the other is "Mailing"). Many
 * screens pick `locations.find(l => l.is_primary)`, which previously always
 * fell back to whichever row came first — often the mailing address.
 */
export function decorateRow(entity: string, row: Record<string, any>): Record<string, any> {
  if (!row) return row;
  let out = expandOverflow(entity, row);
  if (entity === "ProviderLocation" && out.is_primary === undefined) {
    out = { ...out, is_primary: out.location_type === "Practice" };
  }
  return out;
}

// Logged once per (entity, field) so a hot path can't flood the logs.
const reportedDrops = new Set<string>();

export function reportDroppedFields(entity: string, fields: string[], log = console.warn): void {
  const fresh = fields.filter((f) => {
    const key = `${entity}.${f}`;
    if (reportedDrops.has(key)) return false;
    reportedDrops.add(key);
    return true;
  });
  if (fresh.length > 0) {
    log(`[entities] ${entity}: ignoring unknown field(s) ${fresh.join(", ")} (no such column)`);
  }
}

export function _resetReportedDropsForTests(): void {
  reportedDrops.clear();
}

function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/**
 * Translate a Base44-style filter object ({ field: value, field: { $in: [...] },
 * $or: [...] }) into a Drizzle condition. Throws UnknownFieldError for a field
 * that isn't a column (or, for settings-bag entities, a jsonb key).
 */
export function buildWhereClause(table: any, filters: Record<string, any>, entityName = "entity"): any {
  const conditions: any[] = [];

  for (const [key, value] of Object.entries(filters)) {
    if (key === "$and" && Array.isArray(value)) {
      const subConditions = value.map((sub: any) => buildWhereClause(table, sub, entityName));
      const flat = subConditions.filter(Boolean);
      if (flat.length > 0) conditions.push(and(...flat));
      continue;
    }
    if (key === "$or" && Array.isArray(value)) {
      const subConditions = value.map((sub: any) => buildWhereClause(table, sub, entityName));
      // An empty $or matches nothing; a branch with no conditions matches everything.
      if (subConditions.length === 0) conditions.push(sql`false`);
      else if (subConditions.every(Boolean)) conditions.push(or(...subConditions));
      continue;
    }

    const snakeKey = camelToSnake(key);
    const col = (table as any)[snakeKey] || (table as any)[key];
    if (!col) {
      // Settings-bag entities keep loose keys in a jsonb column; allow simple
      // equality on those. Anything else is a caller bug: silently skipping
      // it used to turn the filter into "match everything".
      const overflowCol = JSONB_OVERFLOW[entityName];
      const bag = overflowCol ? (table as any)[overflowCol] : null;
      if (bag && (value === null || typeof value !== "object")) {
        conditions.push(
          value === null
            ? sql`${bag}->>${snakeKey} IS NULL`
            : sql`${bag}->>${snakeKey} = ${String(value)}`,
        );
        continue;
      }
      throw new UnknownFieldError(entityName, key);
    }

    const v = (raw: unknown) => coerceColumnValue(col, key, raw) as any;
    if (value === null) {
      conditions.push(isNull(col));
    } else if (typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
      // Reject what we can't apply rather than dropping it, which would turn
      // the filter into "match everything".
      const ops = Object.keys(value);
      const unsupported = ops.filter((op) => !FILTER_OPERATORS.has(op));
      if (ops.length === 0 || unsupported.length > 0) {
        throw new InvalidFilterError(
          ops.length === 0
            ? `Empty filter for '${key}' on ${entityName}`
            : `Unsupported filter operator ${unsupported.join(", ")} for '${key}' on ${entityName}`,
        );
      }
      for (const op of ["$in", "$nin"] as const) {
        if (op in value && !Array.isArray(value[op])) {
          throw new InvalidFilterError(`'${op}' for '${key}' on ${entityName} must be an array`);
        }
      }
      if ("$in" in value) {
        const arr = value.$in.map(v);
        // An empty $in matches nothing.
        conditions.push(arr.length > 0 ? inArray(col, arr) : sql`false`);
      }
      if ("$nin" in value) {
        const arr = value.$nin.map(v);
        if (arr.length > 0) {
          conditions.push(sql`${col} NOT IN (${sql.join(arr.map((x: any) => sql`${x}`), sql`, `)})`);
        }
      }
      if ("$gt" in value) conditions.push(gt(col, v(value.$gt)));
      if ("$gte" in value) conditions.push(gte(col, v(value.$gte)));
      if ("$lt" in value) conditions.push(lt(col, v(value.$lt)));
      if ("$lte" in value) conditions.push(lte(col, v(value.$lte)));
      if ("$ne" in value) conditions.push(ne(col, v(value.$ne)));
      if ("$like" in value) conditions.push(like(col, value.$like));
      if ("$exists" in value) conditions.push(value.$exists ? isNotNull(col) : isNull(col));
    } else {
      conditions.push(eq(col, v(value)));
    }
  }

  if (conditions.length === 0) return undefined;
  if (conditions.length === 1) return conditions[0];
  return and(...conditions);
}

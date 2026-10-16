// Applies an import plan. Dry-run never calls this. Writes are idempotent
// through base44_import_map: a source id that is already mapped is skipped.
import { randomBytes } from "node:crypto";
import type { ImportPlan, PlanRow } from "./plan";

export type Queryable = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

export type ApplyReport = {
  inserted: number;
  unchanged: number;
  skipped: number;
  files: { url: string; fileName: string; saved: boolean }[];
  problems: { entity: string; sourceId: string; reason: string }[];
};

const ORG_TABLES = new Set([
  "crm_accounts", "outreach_campaigns", "outreach_messages", "campaign_templates",
  "lead_lists", "saved_filters", "call_sheets",
]);

const COLUMNS: Record<string, string[]> = {
  users: ["email", "password_hash", "full_name", "role", "status", "is_platform_admin"],
  crm_accounts: ["org_id", "account_key", "account_type", "name", "city", "phone", "stage", "source", "tags", "npi", "domain", "claimed_by_user_id"],
  crm_contacts: ["account_id", "role", "name", "phone", "email"],
  crm_activities: ["account_id", "user_id", "kind", "activity_date", "done", "note"],
  crm_referrals: ["account_id", "user_id", "received_on", "outcome", "admitted_on", "note"],
  crm_campaign_touches: ["account_id", "campaign_id", "touched_on"],
  outreach_campaigns: ["org_id", "name", "description", "status", "campaign_type", "subject", "body", "sender_email", "sender_name", "goal", "created_by"],
  outreach_messages: ["org_id", "campaign_id", "npi", "recipient_email", "recipient_name", "subject", "body", "status"],
  campaign_templates: ["org_id", "name", "subject_template", "body_template", "category"],
  lead_lists: ["org_id", "name", "description", "list_type", "filter_criteria", "member_count", "created_by"],
  lead_list_members: ["list_id", "npi", "status", "notes", "added_by"],
  saved_filters: ["org_id", "name", "page", "filters", "is_default", "user_id"],
  call_sheets: ["org_id", "name", "state", "county_fips", "county_name", "account_count", "created_by"],
  call_sheet_accounts: ["sheet_id", "account_kind", "account_key", "account_type", "name", "city", "phone", "detail", "status", "next_date", "notes"],
};

export function assertApplyAllowed(databaseUrl: string, allowRemote: boolean) {
  let host = "";
  try {
    host = new URL(databaseUrl).hostname;
  } catch {
    throw new Error("DATABASE_URL is not a valid URL.");
  }
  const local = host === "localhost" || host === "127.0.0.1" || host === "::1";
  if (!local && !allowRemote) {
    throw new Error(`Refusing to write to ${host}. Review the dry-run first. Set BASE44_IMPORT_ALLOW_REMOTE=1 only for the database you mean to update. This script never sends email.`);
  }
}

async function mappedId(db: Queryable, memory: Map<string, number>, entity: string, sourceId: string): Promise<number | null> {
  const key = `${entity}:${sourceId}`;
  if (memory.has(key)) return memory.get(key)!;
  const found = await db.query(
    "SELECT target_id FROM base44_import_map WHERE entity = $1 AND source_id = $2",
    [entity, sourceId],
  );
  const id = asId(found.rows[0]?.target_id);
  if (id != null) memory.set(key, id);
  return id;
}

async function remember(db: Queryable, memory: Map<string, number>, row: PlanRow, targetId: number) {
  memory.set(`${row.entity}:${row.sourceId}`, targetId);
  await db.query(
    `INSERT INTO base44_import_map (entity, source_id, target_table, target_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (entity, source_id) DO NOTHING`,
    [row.entity, row.sourceId, row.table, targetId],
  );
}

async function userIdForEmail(db: Queryable, email: string | null | undefined): Promise<number | null> {
  if (!email) return null;
  const found = await db.query("SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1", [email]);
  return asId(found.rows[0]?.id);
}

function asId(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return null;
}

function quoteIdent(name: string): string {
  if (!/^[a-z_]+$/.test(name)) throw new Error(`Unexpected column ${name}`);
  return name;
}

export async function applyPlan(plan: ImportPlan, db: Queryable, options: {
  orgId: number;
  hashPassword: (plain: string) => Promise<string>;
}): Promise<ApplyReport> {
  if (!Number.isInteger(options.orgId) || options.orgId <= 0) throw new Error("--org-id must be a positive integer.");
  const report: ApplyReport = { inserted: 0, unchanged: 0, skipped: 0, files: [], problems: [] };
  const memory = new Map<string, number>();
  const org = await db.query("SELECT id FROM organizations WHERE id = $1", [options.orgId]);
  if (!org.rows.length) throw new Error(`Organization ${options.orgId} does not exist. Nothing was imported.`);

  for (const row of plan.rows) {
    if (row.action === "skip" || !row.sourceId) {
      report.skipped += 1;
      if (row.reason) report.problems.push({ entity: row.entity, sourceId: row.sourceId, reason: row.reason });
      continue;
    }
    const already = await mappedId(db, memory, row.entity, row.sourceId);
    if (already != null) {
      report.unchanged += 1;
      continue;
    }

    if (row.table === "users") {
      const email = String(row.values.email || "");
      const existing = await userIdForEmail(db, email);
      if (existing != null || row.action === "unchanged") {
        if (existing == null) {
          report.problems.push({ entity: row.entity, sourceId: row.sourceId, reason: "existing email was not found" });
          report.skipped += 1;
          continue;
        }
        await remember(db, memory, row, existing);
        await db.query(
          `INSERT INTO organization_members (org_id, user_id, org_role) VALUES ($1, $2, 'member')
           ON CONFLICT (org_id, user_id) DO NOTHING`,
          [options.orgId, existing],
        );
        report.unchanged += 1;
        continue;
      }
      const passwordHash = await options.hashPassword(randomBytes(32).toString("hex"));
      const inserted = await insertRow(db, "users", {
        email,
        password_hash: passwordHash,
        full_name: row.values.full_name ?? null,
        role: row.values.role === "admin" ? "admin" : "user",
        status: "invited",
        is_platform_admin: row.values.role === "admin",
      });
      await remember(db, memory, row, inserted);
      await db.query(
        `INSERT INTO organization_members (org_id, user_id, org_role) VALUES ($1, $2, 'member')
         ON CONFLICT (org_id, user_id) DO NOTHING`,
        [options.orgId, inserted],
      );
      report.inserted += 1;
      continue;
    }

    const values: Record<string, unknown> = { ...row.values };
    delete values.campaign_source_id;
    if (ORG_TABLES.has(row.table)) values.org_id = options.orgId;
    if (row.parent) {
      const parentId = await mappedId(db, memory, row.parent.entity, row.parent.sourceId);
      if (parentId == null) {
        report.skipped += 1;
        report.problems.push({ entity: row.entity, sourceId: row.sourceId, reason: "parent was not imported" });
        continue;
      }
      values[row.parent.column] = parentId;
    }
    if (row.table === "crm_campaign_touches") {
      const campaignSource = String(row.values.campaign_source_id || "");
      const campaignId = await mappedId(db, memory, "OutreachCampaign", campaignSource)
        ?? await mappedId(db, memory, "Campaign", campaignSource);
      if (campaignId == null) {
        report.skipped += 1;
        report.problems.push({ entity: row.entity, sourceId: row.sourceId, reason: "campaign was not imported" });
        continue;
      }
      values.campaign_id = campaignId;
    }
    if (row.table === "crm_accounts") values.claimed_by_user_id = await userIdForEmail(db, row.userEmail);
    else if (COLUMNS[row.table]?.includes("user_id")) values.user_id = await userIdForEmail(db, row.userEmail);

    const id = await insertRow(db, row.table, values);
    await remember(db, memory, row, id);
    report.inserted += 1;
  }
  return report;
}

async function insertRow(db: Queryable, table: string, values: Record<string, unknown>): Promise<number> {
  const columns = COLUMNS[table];
  if (!columns) throw new Error(`No column list for ${table}`);
  quoteIdent(table);
  const jsonColumns = new Set(["filter_criteria", "filters"]);
  const names = columns.filter((column) => column in values);
  const params = names.map((column) => {
    const value = values[column] ?? null;
    return jsonColumns.has(column) && value && typeof value === "object" ? JSON.stringify(value) : value;
  });
  const sql = `INSERT INTO ${quoteIdent(table)} (${names.map(quoteIdent).join(", ")}) VALUES (${names.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING id`;
  const result = await db.query(sql, params);
  const id = asId(result.rows[0]?.id);
  if (id == null) throw new Error(`Insert into ${table} did not return an id.`);
  return id;
}

export async function saveFiles(plan: ImportPlan, save: (file: { url: string; fileName: string }) => Promise<boolean>): Promise<ApplyReport["files"]> {
  const saved = [];
  for (const file of plan.files) saved.push({ ...file, saved: await save(file) });
  return saved;
}

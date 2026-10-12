import { Router, Request, Response } from "express";
import { db } from "../db";import { tableMap, leadListMembers, outreachCampaigns, outreachMessages, callSheetAccounts, crmContacts, crmActivities, crmReferrals } from "../db/schema";
import { eq, desc, asc, sql, getTableColumns, and, inArray } from "drizzle-orm";
import { authMiddleware, AuthRequest, SessionPrincipal, isOrgAdmin, isPlatformAdmin } from "../middleware/auth";
import { consumeQuota } from "../lib/orgQuota";
import { leadLists, callSheets, crmAccounts } from "../db/schema";
import {
  InvalidFieldValueError,
  JSONB_OVERFLOW,
  UnknownFieldError,
  InvalidFilterError,
  buildWhereClause,
  coerceRowValues,
  decorateRow,
  reportDroppedFields,
  clearStaleEmailVerification,
  sanitizeWriteData,
  splitWriteData,
} from "../lib/entityFields";

const router = Router();

// Entirely off-limits to the entity router. User is handled via dedicated
// routes only. CampaignSequenceStep and CampaignTask are dead scaffolding —
// nothing in the codebase writes those tables (verified by grep) — so they
// answer 404 here until a migration drops them (created by
// drizzle/0000_cute_nemesis.sql and 0020_organizations.sql).
const BLOCKED_ENTITIES = new Set(["User", "CampaignSequenceStep", "CampaignTask"]);

// The platform's own operation: imports and their schedules, the crawler,
// connectors, reconciliation, background tasks and validation rules. They hold
// credentials, request payloads and system configuration, and the cron-run
// workers act on these rows with platform authority, so only platform
// administrators read or change them. An organization's owner administers their
// own organization, not the data every customer shares.
export const PLATFORM_ONLY_ENTITIES = new Set([
  "ReconciliationSettings",
  "ApiInteractionLog",
  "NPPESCrawlerConfig",
  "CMSApiConnector",
  "ImportScheduleConfig",
  "ErrorReport",
  "BackgroundTask",
  "ImportBatch",
  "ImportValidationRule",
  "DataCleaningRule",
  "ColumnMappingRule",
  "ReconciliationJob",
  "ProviderReconciliation",
  "NPPESQueueItem",
]);

// The security trail: an organization's owners read their organization's
// events and platform administrators read all of them. The server writes it
// (recordAudit, POST /api/audit); nobody edits it through the entity API.
const AUDIT_ENTITY = "AuditEvent";

// Entities that any authenticated user may write/modify (collaborative work
// product, scoped to their organization below). Anything not listed here
// needs more than membership to write.
// Scoring rules are platform configuration (one scoring job serves every
// customer), so they are not here: platform administrators change them.
export const USER_WRITABLE_ENTITIES = new Set([
  "LeadList",
  "LeadListMember",
  "CallSheet",
  "CallSheetAccount",
  "CrmAccount",
  "CrmContact",
  "CrmActivity",
  "CrmReferral",
  "CustomReport",
  "ScheduledReport",
  "ScheduledExport",
  "SavedFilter",
  "DataQualityAlert",
  "AnalyticsDashboard",
]);

// Campaigns and the rows that make them up change what is sent in an
// organization's name, so they need its owner (everyone can still read them:
// the dashboard pipeline, a provider's outreach history).
export const ORG_ADMIN_ENTITIES = new Set([
  "OutreachCampaign",
  "OutreachMessage",
  "CampaignSequenceStep",
  "CampaignTask",
  "CampaignTemplate",
]);

// Customer-owned entities (migration 0020): every read and write is limited
// to the caller's organization, and a created row is stamped with it.
// LeadListMember belongs to its list and CampaignSequenceStep to its campaign,
// so they are scoped through lead_lists and outreach_campaigns.
export const ORG_SCOPED_ENTITIES = new Set([
  "LeadList", "CallSheet", "CrmAccount", "SavedFilter", "CustomReport", "ScheduledReport", "ScheduledExport", "AnalyticsDashboard",
  "OutreachCampaign", "OutreachMessage", "CampaignTemplate", "CampaignTask", "DataQualityAlert", AUDIT_ENTITY,
]);

/** Entities that belong to a parent row (the key to it, the parent's table, and its columns), scoped through the parent's organization. */
const PARENT_SCOPED: Record<string, { key: string; parent: any; label: string }> = {
  LeadListMember: { key: "list_id", parent: leadLists, label: "lead list" },
  CallSheetAccount: { key: "sheet_id", parent: callSheets, label: "call sheet" },
  CrmContact: { key: "account_id", parent: crmAccounts, label: "account" },
  CrmActivity: { key: "account_id", parent: crmAccounts, label: "account" },
  CrmReferral: { key: "account_id", parent: crmAccounts, label: "account" },
  CampaignSequenceStep: { key: "campaign_id", parent: outreachCampaigns, label: "campaign" },
};

// Platform administrators read these across every organization, and the platform's own rows (the server writes
// them with no organization: the maintenance heartbeat, the data-quality scan's alerts). Everything else
// customer-owned stays inside the caller's organization, platform administrators included.
const PLATFORM_READS_ALL = new Set([AUDIT_ENTITY, "DataQualityAlert"]);

/** Whether this caller sees `entity` across all organizations. */
export function readsAcrossOrganizations(entity: string, user: SessionPrincipal | undefined): boolean {
  return PLATFORM_READS_ALL.has(entity) && isPlatformAdmin(user);
}

/** The organization a request is scoped to; null when the account has none (then it sees nothing customer-owned). */
function orgIdOf(req: AuthRequest): number | null {
  const id = req.user?.orgId;
  return typeof id === "number" && Number.isInteger(id) ? id : null;
}

/** The condition that keeps an entity's rows to the caller's organization; undefined for shared entities. */
function orgCondition(entity: string | string[], table: any, req: AuthRequest) {
  const entityName = String(entity);
  if (ORG_SCOPED_ENTITIES.has(entityName)) {
    if (readsAcrossOrganizations(entityName, req.user)) return undefined;
    const orgId = orgIdOf(req);
    return orgId == null ? sql`false` : eq(table.org_id, orgId);
  }
  const via = PARENT_SCOPED[entityName];
  if (via) {
    const orgId = orgIdOf(req);
    return orgId == null ? sql`false` : inArray(table[via.key], db.select({ id: via.parent.id }).from(via.parent).where(eq(via.parent.org_id, orgId)));
  }
  return undefined;
}

function withOrg(where: any, scope: any) {
  if (!scope) return where;
  return where ? and(where, scope) : scope;
}

function getTable(entityName: string) {
  if (BLOCKED_ENTITIES.has(entityName)) {
    return null;
  }
  const table = tableMap[entityName];
  if (!table) {
    return null;
  }
  return table;
}

const columnCache = new WeakMap<object, Set<string>>();
function columnsOf(table: any): Set<string> {
  let cols = columnCache.get(table);
  if (!cols) {
    cols = new Set(Object.keys(getTableColumns(table)));
    columnCache.set(table, cols);
  }
  return cols;
}

// Children removed together with their parent row. Without this, deleting a
// lead list left its members behind (and the UI's own cleanup filtered on a
// non-existent column, so it deleted members of *every* list).
const CASCADE_DELETES: Record<string, Array<{ table: any; column: string }>> = {
  LeadList: [{ table: leadListMembers, column: "list_id" }],
  CallSheet: [{ table: callSheetAccounts, column: "sheet_id" }],
  CrmAccount: [
    { table: crmContacts, column: "account_id" },
    { table: crmActivities, column: "account_id" },
    { table: crmReferrals, column: "account_id" },
  ],
  // A deleted campaign takes its queued/sent messages with it; without this
  // they were orphaned (the sequence-step and task tables are dead
  // scaffolding with no writers, so there is nothing to cascade there).
  OutreachCampaign: [{ table: outreachMessages, column: "campaign_id" }],
};

function sendDroppedFields(res: Response, entityName: string, dropped: string[]) {
  if (dropped.length === 0) return;
  reportDroppedFields(entityName, dropped);
  res.setHeader("X-Dropped-Fields", dropped.join(","));
}

function isProd() {
  return process.env.NODE_ENV === "production";
}

function safeError(res: Response, e: any, label: string) {
  console.error(`[entities] ${label} failed:`, e?.message || e);
  // Deliberate HTTP errors (e.g. the 429 QuotaError from the for_export gate
  // below) keep their status and machine-readable code, mirroring the
  // functions dispatcher; unexpected failures stay a plain 500.
  const status = typeof e?.status === "number" ? e.status : 500;
  const body: Record<string, unknown> = {
    message: status === 500 && isProd() ? "An internal error occurred. Please try again." : (e?.message || "Internal error"),
  };
  if (e?.status && typeof e?.code === "string") body.code = e.code;
  return res.status(status).json(body);
}

type Caller = Pick<SessionPrincipal, "role" | "orgRole" | "isPlatformAdmin">;
/** A bare role string is accepted for callers (and tests) that only have the role: "admin" is a platform administrator. */
const callerOf = (who: Caller | string | null | undefined): Caller | undefined => (typeof who === "string" ? { role: who } : who ?? undefined);

/** Who may read an entity through the generic API: the platform's own rows need a platform administrator, the audit trail an owner. */
export function canReadEntity(entityName: string, who: Caller | string | null | undefined): boolean {
  const user = callerOf(who);
  if (PLATFORM_ONLY_ENTITIES.has(entityName)) return isPlatformAdmin(user);
  if (entityName === AUDIT_ENTITY) return isOrgAdmin(user);
  return true;
}

/**
 * Who may create, change or delete rows: members for collaborative work
 * product, an organization's owner for campaigns, and platform administrators
 * for everything else (the shared data every customer reads, the platform's
 * own rows and the audit trail).
 */
export function canWriteEntity(entityName: string, who: Caller | string | null | undefined): boolean {
  const user = callerOf(who);
  if (USER_WRITABLE_ENTITIES.has(entityName)) return true;
  if (ORG_ADMIN_ENTITIES.has(entityName)) return isOrgAdmin(user);
  return isPlatformAdmin(user);
}

function requireReadAccess(req: AuthRequest, res: Response, entityName: string): boolean {
  if (canReadEntity(entityName, req.user)) return true;
  res.status(403).json({
    message: "Forbidden",
    detail: PLATFORM_ONLY_ENTITIES.has(entityName) ? "Platform administrator access is required to view this resource." : "Admin access is required to view this resource.",
  });
  return false;
}

function requireWriteAccess(req: AuthRequest, res: Response, entityName: string): boolean {
  if (canWriteEntity(entityName, req.user)) return true;
  res.status(403).json({
    message: "Forbidden",
    detail: ORG_ADMIN_ENTITIES.has(entityName) ? "Admin access is required to modify this resource." : "Only platform administrators can modify this resource.",
  });
  return false;
}

function parseId(raw: string): number | null {
  if (!/^-?\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : null;
}

// Large tables with no created_date index where created_date is only ever the
// default NOW() (so it is monotonic with the serial id). For these, a
// created_date sort is remapped to id to avoid a full table sort. Other tables
// honor created_date exactly (some may have meaningful, non-insertion-order
// created_date values).
const LARGE_ENTITIES_REMAP_CREATED = new Set([
  "Provider",
  "ProviderLocation",
  "ProviderTaxonomy",
  "MedicareFacility",
  "MedicareMAInpatient",
  "CMSHHAStats",
  "CMSSNFStats",
  "CMSReferral",
  "CMSUtilization",
  "ProviderServiceUtilization",
]);

function buildOrderBy(table: any, sortField?: string, entityName?: string) {
  // Default to the primary key descending. On large tables (providers ~6M,
  // medicare_facilities ~46M) ordering by created_date forces a full sort because
  // there is no created_date index, whereas id is the always-indexed serial PK and
  // gives an equivalent "newest first" order.
  const pk = (table as any).id;
  if (!sortField) return pk ? [desc(pk)] : [desc(table.created_date)];
  const descending = sortField.startsWith("-");
  const field = descending ? sortField.slice(1) : sortField;
  // Remap created_date sorts to id ONLY for the large, unindexed tables where the
  // two are equivalent. Everything else honors the requested created_date column.
  if (
    (field === "created_date" || field === "createdDate") &&
    pk &&
    entityName &&
    LARGE_ENTITIES_REMAP_CREATED.has(entityName)
  ) {
    return [descending ? desc(pk) : asc(pk)];
  }
  const col = (table as any)[field] || (table as any)[camelToSnake(field)];
  if (!col) return pk ? [desc(pk)] : [desc(table.created_date)];
  return [descending ? desc(col) : asc(col)];
}

function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function toSnakeKeys(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(toSnakeKeys);
  if (typeof obj !== "object") return obj;
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key.startsWith("$")) {
      result[key] = value;
    } else {
      result[camelToSnake(key)] = value;
    }
  }
  return result;
}

function toCamelKeys(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(toCamelKeys);
  if (typeof obj !== "object") return obj;
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    result[snakeToCamel(key)] = value;
  }
  return result;
}

router.get("/:entity", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const table = getTable(req.params.entity);
    if (!table) return res.status(404).json({ message: `Entity ${req.params.entity} not found` });
    if (!requireReadAccess(req, res, req.params.entity)) return;

    // Export-sized reads are metered server-side (A5.2): for_export consumes
    // one export from the daily quota before any rows are read, so the count
    // cannot be skipped client-side.
    if (req.query.for_export === "true") {
      await consumeQuota(req.user, "exports");
    }

    const sort = req.query.sort as string;
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 10000);
    const offset = parseInt(req.query.offset as string) || 0;

    const orderBy = buildOrderBy(table, sort, req.params.entity);
    const scope = orgCondition(req.params.entity, table, req);
    let query = db.select().from(table);
    if (scope) query = query.where(scope) as any;
    const rows = await (query as any).orderBy(...orderBy).limit(limit).offset(offset);
    res.json(rows.map((r: any) => decorateRow(req.params.entity, r)));
  } catch (e: any) {
    return safeError(res, e, `GET /${req.params.entity}`);
  }
});

router.post("/:entity/filter", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const table = getTable(req.params.entity);
    if (!table) return res.status(404).json({ message: `Entity ${req.params.entity} not found` });
    if (!requireReadAccess(req, res, req.params.entity)) return;

    const { filters = {}, sort, limit: reqLimit } = req.body;
    const limit = Math.min(reqLimit || 100, 10000);

    // Export-sized reads are metered server-side (A5.2), same as GET above.
    if (req.body.for_export === true) {
      await consumeQuota(req.user, "exports");
    }

    const where = withOrg(buildWhereClause(table, filters, String(req.params.entity)), orgCondition(req.params.entity, table, req));
    const orderBy = buildOrderBy(table, sort, req.params.entity);

    let query = db.select().from(table);
    if (where) query = query.where(where) as any;
    const rows = await (query as any).orderBy(...orderBy).limit(limit);
    res.json(rows.map((r: any) => decorateRow(req.params.entity, r)));
  } catch (e: any) {
    if (e instanceof UnknownFieldError || e instanceof InvalidFieldValueError || e instanceof InvalidFilterError) {
      return res.status(400).json({ message: e.message });
    }
    return safeError(res, e, `POST /${req.params.entity}/filter`);
  }
});

router.get("/:entity/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const table = getTable(req.params.entity);
    if (!table) return res.status(404).json({ message: `Entity ${req.params.entity} not found` });
    if (!requireReadAccess(req, res, req.params.entity)) return;

    const idNum = parseId(req.params.id);
    if (idNum === null) return res.status(400).json({ message: "Invalid id" });

    const [row] = await db.select().from(table).where(withOrg(eq(table.id, idNum), orgCondition(req.params.entity, table, req))).limit(1);
    if (!row) return res.status(404).json({ message: "Not found" });
    res.json(decorateRow(req.params.entity, row));
  } catch (e: any) {
    return safeError(res, e, `GET /${req.params.entity}/${req.params.id}`);
  }
});

router.post("/:entity", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const table = getTable(req.params.entity);
    if (!table) return res.status(404).json({ message: `Entity ${req.params.entity} not found` });
    if (!requireWriteAccess(req, res, req.params.entity)) return;

    const entityName = req.params.entity;
    const split = splitWriteData(entityName, columnsOf(table), sanitizeWriteData(entityName, toSnakeKeys(req.body)));
    const data = coerceRowValues(table, split.data);
    delete data.id;
    delete data.created_date;
    delete data.updated_date;
    if (split.overflow) data[JSONB_OVERFLOW[entityName]] = split.overflow;
    sendDroppedFields(res, entityName, split.dropped);
    if (!(await stampOrg(entityName, data, req, res))) return;

    let row: any;
    if (entityName === "LeadListMember") {
      row = await db.transaction(async (tx) => {
        const [inserted] = (await tx.insert(table).values(data).returning()) as any[];
        await recountLeadList(tx, Number(data.list_id));
        return inserted;
      });
    } else {
      [row] = (await db.insert(table).values(data).returning()) as any[];
    }
    res.status(201).json(decorateRow(entityName, row));
  } catch (e: any) {
    if (e instanceof InvalidFieldValueError) return res.status(400).json({ message: e.message });
    return safeError(res, e, `POST /${req.params.entity}`);
  }
});

router.post("/:entity/bulk", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const table = getTable(req.params.entity);
    if (!table) return res.status(404).json({ message: `Entity ${req.params.entity} not found` });
    if (!requireWriteAccess(req, res, req.params.entity)) return;

    const items = req.body.items || req.body;
    if (!Array.isArray(items)) return res.status(400).json({ message: "Expected array of items" });
    if (items.length === 0) return res.status(400).json({ message: "Empty items array" });
    if (items.length > 5000) return res.status(400).json({ message: "Too many items (max 5000)" });

    const entityName = req.params.entity;
    const columns = columnsOf(table);
    const dropped = new Set<string>();
    const cleaned = items.map((item: any) => {
      const split = splitWriteData(entityName, columns, sanitizeWriteData(entityName, toSnakeKeys(item)));
      const data = coerceRowValues(table, split.data);
      delete data.id;
      delete data.created_date;
      delete data.updated_date;
      if (split.overflow) data[JSONB_OVERFLOW[entityName]] = split.overflow;
      split.dropped.forEach((f) => dropped.add(f));
      return data;
    });
    sendDroppedFields(res, entityName, [...dropped]);
    const knownParents = new Map<number, boolean>();
    for (const data of cleaned) if (!(await stampOrg(entityName, data, req, res, knownParents))) return;

    let rows: any[];
    if (entityName === "LeadListMember") {
      rows = await db.transaction(async (tx) => {
        const inserted = (await tx.insert(table).values(cleaned).returning()) as any[];
        const listIds = [...new Set(inserted.map((r) => Number(r.list_id)).filter((id) => Number.isInteger(id)))];
        for (const listId of listIds) await recountLeadList(tx, listId);
        return inserted;
      });
    } else {
      rows = (await db.insert(table).values(cleaned).returning()) as any[];
    }
    res.status(201).json(rows.map((r: any) => decorateRow(entityName, r)));
  } catch (e: any) {
    if (e instanceof InvalidFieldValueError) return res.status(400).json({ message: e.message });
    return safeError(res, e, `POST /${req.params.entity}/bulk`);
  }
});

router.put("/:entity/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const table = getTable(req.params.entity);
    if (!table) return res.status(404).json({ message: `Entity ${req.params.entity} not found` });
    if (!requireWriteAccess(req, res, req.params.entity)) return;

    const idNum = parseId(req.params.id);
    if (idNum === null) return res.status(400).json({ message: "Invalid id" });

    const entityName = req.params.entity;
    // Optimistic-concurrency guard for status transitions (e.g. ImportBatch
    // pause/cancel/resume): the client passes the status it acted on as
    // `expected_status`; the update only applies while the row still has it.
    // Extracted before sanitizeWriteData, which would otherwise drop it — or
    // worse, stash it in the entity's config JSONB overflow column.
    const expectedStatus = req.body?.expected_status ?? req.body?.expectedStatus;
    const split = splitWriteData(entityName, columnsOf(table), sanitizeWriteData(entityName, toSnakeKeys(req.body)));
    let data: Record<string, any> = coerceRowValues(table, split.data);
    delete data.id;
    delete data.created_date;
    data.updated_date = new Date();
    // A new address invalidates the stored verification of the old one.
    if (entityName === "Provider") data = clearStaleEmailVerification(table, data);
    if (split.overflow) {
      // Merge into the stored settings instead of replacing them, so a partial
      // update (e.g. toggling is_active) doesn't wipe the rest of the config.
      const overflowCol = JSONB_OVERFLOW[entityName];
      data[overflowCol] = sql`COALESCE(${(table as any)[overflowCol]}, '{}'::jsonb) || ${JSON.stringify(split.overflow)}::jsonb`;
    }
    sendDroppedFields(res, entityName, split.dropped);
    // The organization a row belongs to never changes through this route, and a lead list member or
    // campaign step can only be moved to a parent in the caller's own organization.
    if (ORG_SCOPED_ENTITIES.has(String(entityName))) delete data.org_id;
    const via = PARENT_SCOPED[String(entityName)];
    if (via && data[via.key] !== undefined) {
      const orgId = orgIdOf(req);
      if (orgId == null || !(await parentInOrg(String(entityName), data, orgId))) {
        return res.status(404).json({ message: "Not found", detail: `That ${via.label} isn't in your organization.` });
      }
    }

    const statusCol = (table as any).status;
    const whereClause = expectedStatus != null && statusCol
      ? and(withOrg(eq(table.id, idNum), orgCondition(entityName, table, req)), eq(statusCol, String(expectedStatus)))
      : withOrg(eq(table.id, idNum), orgCondition(entityName, table, req));
    const [row] = (await db.update(table).set(data).where(whereClause).returning()) as any[];
    if (!row) {
      if (expectedStatus != null && statusCol) {
        return res.status(409).json({ message: "Conflict", detail: "The record changed since you loaded it; refresh and try again." });
      }
      return res.status(404).json({ message: "Not found" });
    }
    res.json(decorateRow(entityName, row));
  } catch (e: any) {
    if (e instanceof InvalidFieldValueError) return res.status(400).json({ message: e.message });
    return safeError(res, e, `PUT /${req.params.entity}/${req.params.id}`);
  }
});

router.delete("/:entity/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const table = getTable(req.params.entity);
    if (!table) return res.status(404).json({ message: `Entity ${req.params.entity} not found` });
    if (!requireWriteAccess(req, res, req.params.entity)) return;

    const idNum = parseId(req.params.id);
    if (idNum === null) return res.status(400).json({ message: "Invalid id" });

    const children = CASCADE_DELETES[req.params.entity] || [];
    const scope = orgCondition(req.params.entity, table, req);
    const row = await db.transaction(async (tx) => {
      const [deleted] = (await tx.delete(table).where(withOrg(eq(table.id, idNum), scope)).returning()) as any[];
      if (!deleted) return null;
      for (const child of children) {
        await tx.delete(child.table).where(eq(child.table[child.column], idNum));
      }
      if (req.params.entity === "LeadListMember") await recountLeadList(tx, Number(deleted.list_id));
      return deleted;
    });
    if (!row) return res.status(404).json({ message: "Not found" });
    res.json({ success: true });
  } catch (e: any) {
    return safeError(res, e, `DELETE /${req.params.entity}/${req.params.id}`);
  }
});

/** Recompute a lead list's member_count in the same transaction as the membership change. */
async function recountLeadList(tx: typeof db, listId: number) {
  if (!Number.isInteger(listId)) return;
  await tx.update(leadLists).set({
    member_count: sql`(SELECT count(*)::int FROM lead_list_members WHERE list_id = ${listId})`,
    updated_date: new Date(),
  }).where(eq(leadLists.id, listId));
}

/**
 * Whether a row's parent (the lead list of a member, the campaign of a step) is in the caller's organization.
 * `known` caches answers within one request (a bulk insert names the same list many times).
 */
async function parentInOrg(entityName: string, data: Record<string, any>, orgId: number, known: Map<number, boolean> = new Map()): Promise<boolean> {
  const via = PARENT_SCOPED[entityName];
  const parentId = Number(data[via.key]);
  if (!Number.isInteger(parentId)) return false;
  if (!known.has(parentId)) {
    const [parent] = await db.select({ id: via.parent.id }).from(via.parent).where(and(eq(via.parent.id, parentId), eq(via.parent.org_id, orgId))).limit(1);
    known.set(parentId, !!parent);
  }
  return known.get(parentId)!;
}

/**
 * Stamps a new customer-owned row with the caller's organization (a client
 * can't choose another), and checks a new lead list member's list or campaign
 * step's campaign belongs to it. Answers 403/404 and returns false when it
 * doesn't, or when the account has no organization.
 */
async function stampOrg(entity: string | string[], data: Record<string, any>, req: AuthRequest, res: Response, known?: Map<number, boolean>): Promise<boolean> {
  const entityName = String(entity);
  if (ORG_SCOPED_ENTITIES.has(entityName)) {
    const orgId = orgIdOf(req);
    if (orgId == null) {
      res.status(403).json({ message: "Forbidden", detail: "Your account isn't part of an organization yet." });
      return false;
    }
    data.org_id = orgId;
    if (!data.created_by && "created_by" in data === false) data.created_by = req.user?.email ?? null;
    return true;
  }
  const via = PARENT_SCOPED[entityName];
  if (via) {
    const orgId = orgIdOf(req);
    if (orgId == null || !Number.isInteger(Number(data[via.key]))) {
      res.status(403).json({ message: "Forbidden", detail: `A ${entityName} needs a ${via.label} in your organization.` });
      return false;
    }
    if (!(await parentInOrg(entityName, data, orgId, known))) {
      res.status(404).json({ message: "Not found", detail: `That ${via.label} isn't in your organization.` });
      return false;
    }
  }
  return true;
}

export default router;

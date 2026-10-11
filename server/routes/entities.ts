import { Router, Request, Response } from "express";
import { db } from "../db";
import { tableMap, leadListMembers } from "../db/schema";
import { eq, desc, asc, sql, getTableColumns } from "drizzle-orm";
import { authMiddleware, AuthRequest } from "../middleware/auth";
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

// Entirely off-limits to the entity router (handled via dedicated routes only).
const BLOCKED_ENTITIES = new Set(["User"]);

// Sensitive entities that may contain credentials, secrets, audit logs, request payloads,
// or system configuration. Only admins may read or modify these.
const ADMIN_ONLY_ENTITIES = new Set([
  "ReconciliationSettings",
  "ApiInteractionLog",
  "NPPESCrawlerConfig",
  "CMSApiConnector",
  "ImportScheduleConfig",
  "AuditEvent",
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

// Entities that any authenticated user may write/modify (collaborative work product).
// Anything not in this set requires the admin role for write/delete operations.
// OutreachCampaign and OutreachMessage are deliberately absent: sending is
// admin-only and emails the campaign's content and queued messages as stored,
// so only admins and the server may change them.
const USER_WRITABLE_ENTITIES = new Set([
  "LeadList",
  "LeadListMember",
  "CampaignTemplate",
  "CampaignSequenceStep",
  "CampaignTask",
  "CustomReport",
  "ScheduledReport",
  "ScheduledExport",
  "SavedFilter",
  "ScoringRule",
  "DataQualityAlert",
  "AnalyticsDashboard",
]);

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
  return res.status(500).json({
    message: isProd() ? "An internal error occurred. Please try again." : (e?.message || "Internal error"),
  });
}

function isAdmin(req: AuthRequest): boolean {
  return req.user?.role === "admin";
}

function requireReadAccess(req: AuthRequest, res: Response, entityName: string): boolean {
  if (isAdmin(req)) return true;
  if (ADMIN_ONLY_ENTITIES.has(entityName)) {
    res.status(403).json({ message: "Forbidden", detail: "Admin access is required to view this resource." });
    return false;
  }
  return true;
}

export function canWriteEntity(entityName: string, role: string | undefined): boolean {
  return role === "admin" || USER_WRITABLE_ENTITIES.has(entityName);
}

function requireWriteAccess(req: AuthRequest, res: Response, entityName: string): boolean {
  if (canWriteEntity(entityName, req.user?.role)) return true;
  res.status(403).json({ message: "Forbidden", detail: "Admin access is required to modify this resource." });
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

    const sort = req.query.sort as string;
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 10000);
    const offset = parseInt(req.query.offset as string) || 0;

    const orderBy = buildOrderBy(table, sort, req.params.entity);
    const rows = await db.select().from(table).orderBy(...orderBy).limit(limit).offset(offset);
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

    const where = buildWhereClause(table, filters, req.params.entity);
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

    const [row] = await db.select().from(table).where(eq(table.id, idNum)).limit(1);
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

    const [row] = (await db.insert(table).values(data).returning()) as any[];
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

    const rows = (await db.insert(table).values(cleaned).returning()) as any[];
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

    const [row] = (await db.update(table).set(data).where(eq(table.id, idNum)).returning()) as any[];
    if (!row) return res.status(404).json({ message: "Not found" });
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
    const row = await db.transaction(async (tx) => {
      const [deleted] = (await tx.delete(table).where(eq(table.id, idNum)).returning()) as any[];
      if (!deleted) return null;
      for (const child of children) {
        await tx.delete(child.table).where(eq(child.table[child.column], idNum));
      }
      return deleted;
    });
    if (!row) return res.status(404).json({ message: "Not found" });
    res.json({ success: true });
  } catch (e: any) {
    return safeError(res, e, `DELETE /${req.params.entity}/${req.params.id}`);
  }
});

export default router;

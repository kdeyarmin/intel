import { Router, Request, Response } from "express";
import { db } from "../db";
import { tableMap } from "../db/schema";
import { eq, desc, asc, sql, and, or, inArray, like, gte, lte, gt, lt, ne, isNull, isNotNull } from "drizzle-orm";
import { authMiddleware, AuthRequest } from "../middleware/auth";

const router = Router();

// Entirely off-limits to the entity router (handled via dedicated routes only).
const BLOCKED_ENTITIES = new Set(["User"]);
const SENSITIVE_WRITE_FIELDS = new Set(["password_hash", "role"]);

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
const USER_WRITABLE_ENTITIES = new Set([
  "LeadList",
  "LeadListMember",
  "OutreachCampaign",
  "OutreachMessage",
  "CampaignTemplate",
  "CampaignSequenceStep",
  "CampaignTask",
  "Campaign",
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

function sanitizeWriteData(data: Record<string, any>): Record<string, any> {
  const cleaned = { ...data };
  for (const field of SENSITIVE_WRITE_FIELDS) {
    delete cleaned[field];
  }
  return cleaned;
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

function requireWriteAccess(req: AuthRequest, res: Response, entityName: string): boolean {
  if (isAdmin(req)) return true;
  if (USER_WRITABLE_ENTITIES.has(entityName)) return true;
  res.status(403).json({ message: "Forbidden", detail: "Admin access is required to modify this resource." });
  return false;
}

function parseId(raw: string): number | null {
  if (!/^-?\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : null;
}

function buildOrderBy(table: any, sortField?: string) {
  if (!sortField) return [desc(table.created_date)];
  const descending = sortField.startsWith("-");
  const field = descending ? sortField.slice(1) : sortField;
  const col = (table as any)[field] || (table as any)[camelToSnake(field)];
  if (!col) return [desc(table.created_date)];
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

function buildWhereClause(table: any, filters: Record<string, any>) {
  const conditions: any[] = [];

  for (const [key, value] of Object.entries(filters)) {
    if (key === "$and" && Array.isArray(value)) {
      const subConditions = value.map((sub: any) => buildWhereClause(table, sub));
      const flat = subConditions.filter(Boolean);
      if (flat.length > 0) conditions.push(and(...flat));
      continue;
    }
    if (key === "$or" && Array.isArray(value)) {
      const subConditions = value.map((sub: any) => buildWhereClause(table, sub));
      const flat = subConditions.filter(Boolean);
      if (flat.length > 0) conditions.push(or(...flat));
      continue;
    }

    const snakeKey = camelToSnake(key);
    const col = (table as any)[snakeKey] || (table as any)[key];
    if (!col) continue;

    if (value === null) {
      conditions.push(isNull(col));
    } else if (typeof value === "object" && !Array.isArray(value)) {
      if ("$in" in value) {
        const arr = Array.isArray(value.$in) ? value.$in : [];
        if (arr.length > 0) conditions.push(inArray(col, arr));
      }
      if ("$nin" in value) {
        const arr = Array.isArray(value.$nin) ? value.$nin : [];
        if (arr.length > 0) {
          conditions.push(sql`${col} NOT IN (${sql.join(arr.map((v: any) => sql`${v}`), sql`, `)})`);
        }
      }
      if ("$gt" in value) conditions.push(gt(col, value.$gt));
      if ("$gte" in value) conditions.push(gte(col, value.$gte));
      if ("$lt" in value) conditions.push(lt(col, value.$lt));
      if ("$lte" in value) conditions.push(lte(col, value.$lte));
      if ("$ne" in value) conditions.push(ne(col, value.$ne));
      if ("$like" in value) conditions.push(like(col, value.$like));
      if ("$exists" in value) conditions.push(value.$exists ? isNotNull(col) : isNull(col));
    } else {
      conditions.push(eq(col, value));
    }
  }

  if (conditions.length === 0) return undefined;
  if (conditions.length === 1) return conditions[0];
  return and(...conditions);
}

router.get("/:entity", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const table = getTable(req.params.entity);
    if (!table) return res.status(404).json({ message: `Entity ${req.params.entity} not found` });
    if (!requireReadAccess(req, res, req.params.entity)) return;

    const sort = req.query.sort as string;
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 10000);
    const offset = parseInt(req.query.offset as string) || 0;

    const orderBy = buildOrderBy(table, sort);
    const rows = await db.select().from(table).orderBy(...orderBy).limit(limit).offset(offset);
    res.json(rows);
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

    const where = buildWhereClause(table, filters);
    const orderBy = buildOrderBy(table, sort);

    let query = db.select().from(table);
    if (where) query = query.where(where) as any;
    const rows = await (query as any).orderBy(...orderBy).limit(limit);
    res.json(rows);
  } catch (e: any) {
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
    res.json(row);
  } catch (e: any) {
    return safeError(res, e, `GET /${req.params.entity}/${req.params.id}`);
  }
});

router.post("/:entity", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const table = getTable(req.params.entity);
    if (!table) return res.status(404).json({ message: `Entity ${req.params.entity} not found` });
    if (!requireWriteAccess(req, res, req.params.entity)) return;

    const data = sanitizeWriteData(toSnakeKeys(req.body));
    delete data.id;
    delete data.created_date;
    delete data.updated_date;

    const [row] = await db.insert(table).values(data).returning();
    res.status(201).json(row);
  } catch (e: any) {
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

    const cleaned = items.map((item: any) => {
      const data = sanitizeWriteData(toSnakeKeys(item));
      delete data.id;
      delete data.created_date;
      delete data.updated_date;
      return data;
    });

    const rows = await db.insert(table).values(cleaned).returning();
    res.status(201).json(rows);
  } catch (e: any) {
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

    const data = sanitizeWriteData(toSnakeKeys(req.body));
    delete data.id;
    delete data.created_date;
    data.updated_date = new Date();

    const [row] = await db.update(table).set(data).where(eq(table.id, idNum)).returning();
    if (!row) return res.status(404).json({ message: "Not found" });
    res.json(row);
  } catch (e: any) {
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

    const [row] = await db.delete(table).where(eq(table.id, idNum)).returning();
    if (!row) return res.status(404).json({ message: "Not found" });
    res.json({ success: true });
  } catch (e: any) {
    return safeError(res, e, `DELETE /${req.params.entity}/${req.params.id}`);
  }
});

export default router;

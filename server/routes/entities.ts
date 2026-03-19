import { Router, Request, Response } from "express";
import { db } from "../db";
import { tableMap } from "../db/schema";
import { eq, desc, asc, sql, and, or, inArray, like, gte, lte, gt, lt, ne, isNull, isNotNull } from "drizzle-orm";
import { authMiddleware, AuthRequest } from "../middleware/auth";

const router = Router();

function getTable(entityName: string) {
  const table = tableMap[entityName];
  if (!table) {
    return null;
  }
  return table;
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
      if ("$in" in value) conditions.push(inArray(col, value.$in));
      if ("$nin" in value) conditions.push(sql`${col} NOT IN (${sql.join(value.$nin.map((v: any) => sql`${v}`), sql`, `)})`);
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

    const sort = req.query.sort as string;
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 10000);
    const offset = parseInt(req.query.offset as string) || 0;

    const orderBy = buildOrderBy(table, sort);
    const rows = await db.select().from(table).orderBy(...orderBy).limit(limit).offset(offset);
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

router.post("/:entity/filter", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const table = getTable(req.params.entity);
    if (!table) return res.status(404).json({ message: `Entity ${req.params.entity} not found` });

    const { filters = {}, sort, limit: reqLimit } = req.body;
    const limit = Math.min(reqLimit || 100, 10000);

    const where = buildWhereClause(table, filters);
    const orderBy = buildOrderBy(table, sort);

    let query = db.select().from(table);
    if (where) query = query.where(where) as any;
    const rows = await (query as any).orderBy(...orderBy).limit(limit);
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

router.get("/:entity/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const table = getTable(req.params.entity);
    if (!table) return res.status(404).json({ message: `Entity ${req.params.entity} not found` });

    const [row] = await db.select().from(table).where(eq(table.id, parseInt(req.params.id))).limit(1);
    if (!row) return res.status(404).json({ message: "Not found" });
    res.json(row);
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

router.post("/:entity", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const table = getTable(req.params.entity);
    if (!table) return res.status(404).json({ message: `Entity ${req.params.entity} not found` });

    const data = toSnakeKeys(req.body);
    delete data.id;
    delete data.created_date;
    delete data.updated_date;

    const [row] = await db.insert(table).values(data).returning();
    res.status(201).json(row);
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

router.post("/:entity/bulk", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const table = getTable(req.params.entity);
    if (!table) return res.status(404).json({ message: `Entity ${req.params.entity} not found` });

    const items = req.body.items || req.body;
    if (!Array.isArray(items)) return res.status(400).json({ message: "Expected array of items" });

    const cleaned = items.map((item: any) => {
      const data = toSnakeKeys(item);
      delete data.id;
      delete data.created_date;
      delete data.updated_date;
      return data;
    });

    const rows = await db.insert(table).values(cleaned).returning();
    res.status(201).json(rows);
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

router.put("/:entity/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const table = getTable(req.params.entity);
    if (!table) return res.status(404).json({ message: `Entity ${req.params.entity} not found` });

    const data = toSnakeKeys(req.body);
    delete data.id;
    delete data.created_date;
    data.updated_date = new Date();

    const [row] = await db.update(table).set(data).where(eq(table.id, parseInt(req.params.id))).returning();
    if (!row) return res.status(404).json({ message: "Not found" });
    res.json(row);
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

router.delete("/:entity/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const table = getTable(req.params.entity);
    if (!table) return res.status(404).json({ message: `Entity ${req.params.entity} not found` });

    const [row] = await db.delete(table).where(eq(table.id, parseInt(req.params.id))).returning();
    if (!row) return res.status(404).json({ message: "Not found" });
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

export default router;

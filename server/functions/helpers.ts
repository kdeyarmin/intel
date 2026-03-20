import { db } from "../db";
import { eq, sql, and, inArray, desc, asc } from "drizzle-orm";
import { tableMap } from "../db/schema";

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 5
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      const isRateLimit = /429|rate limit|too many requests/i.test(e.message);
      const isNetwork =
        /network|connection|reset|timeout|ECONNREFUSED|ENOTFOUND/i.test(
          e.message
        );
      const isServerError =
        /500|502|503|504|internal server error|bad gateway|service unavailable|gateway timeout/i.test(
          e.message
        );
      if ((isRateLimit || isNetwork || isServerError) && attempt < maxRetries) {
        const backoff = Math.min(
          Math.pow(2, attempt) * 500 + Math.random() * 1000,
          5000
        );
        await sleep(backoff);
        continue;
      }
      throw e;
    }
  }
  throw new Error("withRetry exhausted");
}

const SYSTEM_FIELDS = new Set([
  "id",
  "created_date",
  "updated_date",
  "_id",
  "__v",
]);
export function stripSystemFields(obj: Record<string, any>) {
  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!SYSTEM_FIELDS.has(k)) clean[k] = v;
  }
  return clean;
}

export function isIdentical(
  a: Record<string, any>,
  b: Record<string, any>,
  fields: string[]
) {
  for (const f of fields) {
    if ((a[f] ?? "").toString().trim() !== (b[f] ?? "").toString().trim())
      return false;
  }
  return true;
}

export async function entityList(
  entityName: string,
  sortField?: string,
  limit = 100
) {
  const table = tableMap[entityName];
  if (!table) throw new Error(`Unknown entity: ${entityName}`);
  const orderCol = sortField?.startsWith("-")
    ? desc(table[sortField.slice(1)] || table.created_date)
    : sortField
    ? asc(table[sortField] || table.created_date)
    : desc(table.created_date);
  return db.select().from(table).orderBy(orderCol).limit(limit);
}

export async function entityFilter(
  entityName: string,
  filters: Record<string, any>,
  sortField?: string,
  limit = 100
) {
  const table = tableMap[entityName];
  if (!table) throw new Error(`Unknown entity: ${entityName}`);
  const conditions: any[] = [];
  for (const [key, value] of Object.entries(filters)) {
    const col = table[key];
    if (!col) continue;
    if (value === null) {
      conditions.push(sql`${col} IS NULL`);
    } else if (typeof value === "object" && !Array.isArray(value)) {
      if ("$in" in value) conditions.push(inArray(col, value.$in));
    } else {
      conditions.push(eq(col, value));
    }
  }
  const orderCol = sortField?.startsWith("-")
    ? desc(table[sortField.slice(1)] || table.created_date)
    : sortField
    ? asc(table[sortField] || table.created_date)
    : desc(table.created_date);
  let query = db.select().from(table);
  if (conditions.length > 0) query = query.where(and(...conditions)) as any;
  return (query as any).orderBy(orderCol).limit(limit);
}

export async function entityGet(entityName: string, id: number | string) {
  const table = tableMap[entityName];
  if (!table) throw new Error(`Unknown entity: ${entityName}`);
  const numId = typeof id === "string" ? parseInt(id) : id;
  const [row] = await db
    .select()
    .from(table)
    .where(eq(table.id, numId))
    .limit(1);
  return row || null;
}

export async function entityCreate(
  entityName: string,
  data: Record<string, any>
) {
  const table = tableMap[entityName];
  if (!table) throw new Error(`Unknown entity: ${entityName}`);
  const clean = { ...data };
  delete clean.id;
  delete clean.created_date;
  delete clean.updated_date;
  const [row] = await db.insert(table).values(clean).returning();
  return row;
}

export async function entityUpdate(
  entityName: string,
  id: number | string,
  data: Record<string, any>
) {
  const table = tableMap[entityName];
  if (!table) throw new Error(`Unknown entity: ${entityName}`);
  const numId = typeof id === "string" ? parseInt(id) : id;
  const clean = { ...data };
  delete clean.id;
  delete clean.created_date;
  clean.updated_date = new Date();
  const [row] = await db
    .update(table)
    .set(clean)
    .where(eq(table.id, numId))
    .returning();
  return row;
}

export async function entityBulkCreate(
  entityName: string,
  items: Record<string, any>[]
) {
  const table = tableMap[entityName];
  if (!table) throw new Error(`Unknown entity: ${entityName}`);
  const cleaned = items.map((item) => {
    const d = { ...item };
    delete d.id;
    delete d.created_date;
    delete d.updated_date;
    return d;
  });
  if (cleaned.length === 0) return [];
  return db.insert(table).values(cleaned).returning();
}

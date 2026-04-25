import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX) || 30,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
});

pool.on("error", (err) => {
  console.error("[DB Pool] Unexpected error on idle client:", err.message);
});

pool.on("connect", () => {
  console.log("[DB Pool] New client connected");
});

export const db = drizzle(pool, { schema });
export { pool };

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 50,
  idleTimeoutMillis: 20000,
  connectionTimeoutMillis: 20000,
});

pool.on("error", (err) => {
  console.error("[DB Pool] Unexpected error on idle client:", err.message);
});

pool.on("connect", () => {
  console.log("[DB Pool] New client connected");
});

export const db = drizzle(pool, { schema });
export { pool };

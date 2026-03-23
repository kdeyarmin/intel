import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 50,
  idleTimeoutMillis: 20000,
  connectionTimeoutMillis: 20000,
});

export const db = drizzle(pool, { schema });
export { pool };

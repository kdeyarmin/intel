import { describe, it, expect, vi, beforeEach } from "vitest";

const { migrate } = vi.hoisted(() => ({ migrate: vi.fn(async () => {}) }));
vi.mock("drizzle-orm/node-postgres/migrator", () => ({ migrate }));
vi.mock("drizzle-orm/node-postgres", () => ({ drizzle: () => ({}) }));

import { runMigrations } from "../server/db/migrate";

// A database built with drizzle-kit push: tables exist, no migration history.
function pushedDb({ failInsertAt }: { failInsertAt?: number } = {}) {
  const statements: string[] = [];
  let inserts = 0;
  const client = {
    query: vi.fn(async (sql: string) => {
      statements.push(sql);
      if (sql.includes("to_regclass")) return { rows: [{ t: null }] };
      if (sql.includes("pg_tables")) return { rows: [{ tablename: "users" }, { tablename: "medicare_facilities_raw" }] };
      if (sql.startsWith("INSERT INTO drizzle.__drizzle_migrations")) {
        inserts += 1;
        if (inserts === failInsertAt) throw new Error("connection lost");
      }
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  return { pool: { connect: async () => client }, client, statements };
}
const quiet = { log: vi.fn(), warn: vi.fn() };

beforeEach(() => migrate.mockClear());

describe("runMigrations baseline", () => {
  it("records the whole baseline in one transaction before migrating", async () => {
    const { pool, statements } = pushedDb();
    const status = await runMigrations(pool, quiet);
    expect(status.baselined).toEqual(["0000_cute_nemesis", "0002_medicare_facilities_raw"]);
    const begin = statements.indexOf("BEGIN");
    const commit = statements.indexOf("COMMIT");
    const inserts = statements.flatMap((s, i) => (s.startsWith("INSERT INTO drizzle.__drizzle_migrations") ? [i] : []));
    expect(inserts).toHaveLength(2);
    expect(begin).toBeGreaterThan(-1);
    for (const i of inserts) expect(i > begin && i < commit).toBe(true);
    expect(migrate).toHaveBeenCalledTimes(1);
  });

  it("rolls the baseline back, skips migrating and unlocks when a write fails", async () => {
    const { pool, client, statements } = pushedDb({ failInsertAt: 2 });
    await expect(runMigrations(pool, quiet)).rejects.toThrow("connection lost");
    expect(statements).toContain("ROLLBACK");
    expect(statements).not.toContain("COMMIT");
    expect(migrate).not.toHaveBeenCalled();
    expect(statements.at(-1)).toBe("SELECT pg_advisory_unlock($1)");
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});

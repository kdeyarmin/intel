import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, vi } from "vitest";
import { BOOT_INDEXES, OBSOLETE_INDEXES, runBootIndexes, SWEEP_TABLES } from "../server/lib/bootIndexes";

describe("BOOT_INDEXES", () => {
  it("builds every index concurrently and idempotently", () => {
    for (const { ddl } of BOOT_INDEXES) {
      expect(ddl).toMatch(/^CREATE (UNIQUE )?INDEX CONCURRENTLY IF NOT EXISTS \w+ ON \w+ /);
    }
  });

  it("uses unique names", () => {
    const names = BOOT_INDEXES.map((i) => i.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("sweeps invalid indexes on every table it builds on", () => {
    for (const { ddl } of BOOT_INDEXES) {
      const table = ddl.match(/ ON (\w+) /)?.[1];
      expect(SWEEP_TABLES).toContain(table);
    }
  });

  it("never drops an index it is about to build", () => {
    for (const name of OBSOLETE_INDEXES) expect(BOOT_INDEXES.map((i) => i.name)).not.toContain(name);
  });

  it("is the index set the dedupe script tells an operator to build (it must not name an obsolete one)", () => {
    const sql = fs.readFileSync(path.join(import.meta.dirname, "..", "scripts", "dedupe-existing-imports.sql"), "utf8");
    for (const name of OBSOLETE_INDEXES) expect(sql, name).not.toContain(name);
    // Every unique index the script suggests is one the server builds at boot, under the same name.
    const suggested = [...sql.matchAll(/CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS (\w+)/g)].map((m) => m[1]);
    expect(suggested.length).toBeGreaterThan(0);
    for (const name of suggested) expect(BOOT_INDEXES.map((i) => i.name), name).toContain(name);
  });
});

describe("runBootIndexes", () => {
  function fakePool({ failOn, lockTaken = false }: { failOn?: string; lockTaken?: boolean } = {}) {
    const statements: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        statements.push(sql);
        if (sql.includes("pg_try_advisory_lock")) return { rows: [{ locked: !lockTaken }] };
        if (sql.includes("pg_index")) return { rows: [{ indexname: "uq_psu_natural" }] };
        if (sql.includes("relkind = 'i'")) return { rows: [{ indexname: "uq_cms_referrals_npi_year" }] };
        if (failOn && sql.includes(failOn)) throw new Error("unable to create unique index");
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const pool = { query: vi.fn(), connect: vi.fn(async () => client) };
    return { pool, client, statements };
  }
  const quiet = { log: vi.fn(), warn: vi.fn() };

  it("drops invalid and obsolete indexes concurrently before building, all on one locked connection", async () => {
    const { pool, client, statements } = fakePool();
    await runBootIndexes(pool, quiet);
    expect(pool.connect).toHaveBeenCalledTimes(1);
    expect(pool.query).not.toHaveBeenCalled();
    expect(statements[0]).toContain("pg_try_advisory_lock");
    const drops = statements.filter((s) => s.startsWith("DROP INDEX"));
    expect(drops).toEqual([
      'DROP INDEX CONCURRENTLY IF EXISTS "uq_psu_natural"',
      'DROP INDEX CONCURRENTLY IF EXISTS "uq_cms_referrals_npi_year"',
    ]);
    expect(statements.indexOf(drops[1])).toBeLessThan(statements.indexOf(BOOT_INDEXES[0].ddl));
    for (const { ddl } of BOOT_INDEXES) {
      expect(statements).toContain(ddl);
      // Builds may run for hours: no statement timeout.
      expect(statements[statements.indexOf(ddl) - 1]).toBe("SET statement_timeout = '0'");
    }
    expect(statements.slice(-2)).toEqual(["SELECT pg_advisory_unlock($1)", "RESET statement_timeout"]);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("does nothing while another instance holds the lock", async () => {
    const { client, statements } = fakePool({ lockTaken: true });
    const log = { log: vi.fn(), warn: vi.fn() };
    await runBootIndexes({ connect: async () => client }, log);
    expect(statements.some((s) => s.startsWith("DROP INDEX") || s.startsWith("CREATE"))).toBe(false);
    expect(statements.some((s) => s.includes("pg_advisory_unlock"))).toBe(false);
    expect(log.log).toHaveBeenCalledWith(expect.stringContaining("Another instance"));
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("keeps going when one build fails", async () => {
    const { pool, statements } = fakePool({ failOn: "uq_medfac_type_provider" });
    const log = { log: vi.fn(), warn: vi.fn() };
    await expect(runBootIndexes(pool, log)).resolves.toBeUndefined();
    expect(statements).toContain(BOOT_INDEXES[BOOT_INDEXES.length - 1].ddl);
    expect(log.warn).toHaveBeenCalledWith("[DB Index] uq_medfac_type_provider failed:", expect.any(String));
    expect(statements).toContain("SELECT pg_advisory_unlock($1)");
  });

  it("never throws when no connection is available", async () => {
    const log = { log: vi.fn(), warn: vi.fn() };
    await expect(runBootIndexes({ connect: async () => { throw new Error("too many clients"); } }, log)).resolves.toBeUndefined();
    expect(log.warn).toHaveBeenCalled();
  });
});

describe("runBootIndexes with nothing to drop", () => {
  it("doesn't drop or report indexes that aren't there", async () => {
    const statements: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        statements.push(sql);
        return { rows: sql.includes("pg_try_advisory_lock") ? [{ locked: true }] : [] };
      }),
      release: vi.fn(),
    };
    const log = { log: vi.fn(), warn: vi.fn() };
    await runBootIndexes({ connect: vi.fn(async () => client) }, log);
    expect(statements.some((s) => s.startsWith("DROP INDEX"))).toBe(false);
    expect(log.log).not.toHaveBeenCalledWith(expect.stringContaining("Dropped"));
  });
});

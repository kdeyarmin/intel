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
});

describe("runBootIndexes", () => {
  function fakePool(failOn?: string) {
    const statements: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        statements.push(sql);
        if (failOn && sql.includes(failOn)) throw new Error("could not create unique index");
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const pool = {
      query: vi.fn(async (sql: string) => ({
        rows: [{ indexname: sql.includes("pg_index") ? "uq_psu_natural" : "uq_cms_referrals_npi_year" }],
      })),
      connect: vi.fn(async () => client),
    };
    return { pool, client, statements };
  }
  const quiet = { log: vi.fn(), warn: vi.fn() };

  it("drops invalid and obsolete indexes before building, and resets the timeout", async () => {
    const { pool, client, statements } = fakePool();
    await runBootIndexes(pool, quiet);
    const drops = statements.filter((s) => s.startsWith("DROP INDEX"));
    expect(drops).toEqual(['DROP INDEX IF EXISTS "uq_psu_natural"', 'DROP INDEX IF EXISTS "uq_cms_referrals_npi_year"']);
    expect(statements.indexOf(drops[1])).toBeLessThan(statements.indexOf(BOOT_INDEXES[0].ddl));
    for (const { ddl } of BOOT_INDEXES) expect(statements).toContain(ddl);
    expect(statements.filter((s) => s === "RESET statement_timeout")).toHaveLength(drops.length + BOOT_INDEXES.length);
    expect(client.release).toHaveBeenCalledTimes(drops.length + BOOT_INDEXES.length);
  });

  it("keeps going when one build fails", async () => {
    const { pool, statements } = fakePool("uq_medfac_type_provider");
    const log = { log: vi.fn(), warn: vi.fn() };
    await expect(runBootIndexes(pool, log)).resolves.toBeUndefined();
    expect(statements).toContain(BOOT_INDEXES[BOOT_INDEXES.length - 1].ddl);
    expect(log.warn).toHaveBeenCalledWith("[DB Index] uq_medfac_type_provider failed:", expect.any(String));
  });
});

describe("runBootIndexes with nothing to drop", () => {
  it("doesn't drop or report indexes that aren't there", async () => {
    const statements: string[] = [];
    const client = { query: vi.fn(async (sql: string) => { statements.push(sql); return { rows: [] }; }), release: vi.fn() };
    const pool = { query: vi.fn(async () => ({ rows: [] })), connect: vi.fn(async () => client) };
    const log = { log: vi.fn(), warn: vi.fn() };
    await runBootIndexes(pool, log);
    expect(statements.some((s) => s.startsWith("DROP INDEX"))).toBe(false);
    expect(log.log).not.toHaveBeenCalledWith(expect.stringContaining("Dropped"));
  });
});

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  initialTables,
  journalProblems,
  planBaseline,
  RETIRED_INITIAL_TABLES,
  tablesCreatedBy,
  type JournalEntry,
} from "../server/db/migrationPlan";

const ROOT = path.resolve(import.meta.dirname, "..");
const JOURNAL: JournalEntry[] = [
  { idx: 0, tag: "0000_cute_nemesis", when: 100 },
  { idx: 2, tag: "0002_medicare_facilities_raw", when: 200 },
  { idx: 3, tag: "0003_entity_field_sync", when: 300 },
];
const hashOf = (tag: string) => `hash:${tag}`;
const INITIAL = ["users", "providers", "medicare_facilities"];

describe("planBaseline", () => {
  it("does nothing once the database has migration history", () => {
    expect(planBaseline({ historyCount: 2, existingTables: new Set(["users", "medicare_facilities_raw"]), initialTables: INITIAL, journal: JOURNAL, hashOf })).toEqual([]);
  });

  it("does nothing for an empty database, so every migration runs", () => {
    expect(planBaseline({ historyCount: 0, existingTables: new Set(), initialTables: INITIAL, journal: JOURNAL, hashOf })).toEqual([]);
  });

  it("records the non-idempotent migrations of a pushed database, in journal order", () => {
    const rows = planBaseline({
      historyCount: 0,
      existingTables: new Set([...INITIAL, "medicare_facilities_raw"]),
      initialTables: INITIAL,
      journal: [...JOURNAL].reverse(),
      hashOf,
    });
    expect(rows).toEqual([
      { tag: "0000_cute_nemesis", hash: "hash:0000_cute_nemesis", created_at: 100 },
      { tag: "0002_medicare_facilities_raw", hash: "hash:0002_medicare_facilities_raw", created_at: 200 },
    ]);
  });

  it("stops at the first marker whose table is missing, so that migration still runs", () => {
    const rows = planBaseline({ historyCount: 0, existingTables: new Set(INITIAL), initialTables: INITIAL, journal: JOURNAL, hashOf });
    expect(rows.map((r) => r.tag)).toEqual(["0000_cute_nemesis"]);
  });

  it("refuses to record 0000 for a database with only part of its tables", () => {
    // Recording 0000 here would mean medicare_facilities is never created (and 0002 then fails).
    const plan = () => planBaseline({ historyCount: 0, existingTables: new Set(["users", "providers"]), initialTables: INITIAL, journal: JOURNAL, hashOf });
    expect(plan).toThrow(/Incomplete schema.*missing medicare_facilities\b/);
  });
});

describe("initialTables", () => {
  const sql = fs.readFileSync(path.join(ROOT, "drizzle", "0000_cute_nemesis.sql"), "utf8");
  const schemaTables = new Set(
    [...fs.readFileSync(path.join(ROOT, "server", "db", "schema.ts"), "utf8").matchAll(/pgTable\(\s*"(\w+)"/g)].map((m) => m[1]),
  );

  it("is every table 0000 creates, less the retired ones", () => {
    const created = tablesCreatedBy(sql);
    expect(created.length).toBeGreaterThan(40);
    const tables = initialTables(path.join(ROOT, "drizzle"));
    expect(tables).toContain("users");
    expect(tables).toContain("medicare_facilities");
    expect(tables.length + RETIRED_INITIAL_TABLES.length).toBe(created.length);
  });

  it("matches schema.ts, so a freshly pushed database counts as complete", () => {
    // A table 0000 creates that schema.ts drops must be listed as retired, or
    // every database pushed after that would be refused as incomplete.
    for (const t of initialTables(path.join(ROOT, "drizzle"))) expect(schemaTables, t).toContain(t);
    for (const t of RETIRED_INITIAL_TABLES) expect(schemaTables, t).not.toContain(t);
  });
});

describe("journalProblems", () => {
  const files = JOURNAL.map((e) => `${e.tag}.sql`);

  it("accepts an ordered journal that covers every file", () => {
    expect(journalProblems(JOURNAL, files, [])).toEqual([]);
  });

  it("flags a 'when' that doesn't increase (the migrator would skip it)", () => {
    const journal = [...JOURNAL, { idx: 4, tag: "0004_x", when: 250 }];
    expect(journalProblems(journal, [...files, "0004_x.sql"], [])).toEqual(['0004_x: "when" is not after 0003_entity_field_sync']);
  });

  it("flags unjournaled and missing files, allowing listed legacy ones", () => {
    expect(journalProblems(JOURNAL, [...files.slice(1), "0001_old.sql", "0009_new.sql"], ["0001_old"])).toEqual([
      "0009_new.sql is not in the journal",
      "0000_cute_nemesis.sql is missing",
    ]);
  });
});

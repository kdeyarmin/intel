import { describe, it, expect } from "vitest";
import { journalProblems, planBaseline, type JournalEntry } from "../server/db/migrationPlan";

const JOURNAL: JournalEntry[] = [
  { idx: 0, tag: "0000_cute_nemesis", when: 100 },
  { idx: 2, tag: "0002_medicare_facilities_raw", when: 200 },
  { idx: 3, tag: "0003_entity_field_sync", when: 300 },
];
const hashOf = (tag: string) => `hash:${tag}`;

describe("planBaseline", () => {
  it("does nothing once the database has migration history", () => {
    expect(planBaseline({ historyCount: 2, existingTables: new Set(["users", "medicare_facilities_raw"]), journal: JOURNAL, hashOf })).toEqual([]);
  });

  it("does nothing for an empty database, so every migration runs", () => {
    expect(planBaseline({ historyCount: 0, existingTables: new Set(), journal: JOURNAL, hashOf })).toEqual([]);
  });

  it("records the non-idempotent migrations of a pushed database, in journal order", () => {
    const rows = planBaseline({
      historyCount: 0,
      existingTables: new Set(["users", "providers", "medicare_facilities_raw"]),
      journal: [...JOURNAL].reverse(),
      hashOf,
    });
    expect(rows).toEqual([
      { tag: "0000_cute_nemesis", hash: "hash:0000_cute_nemesis", created_at: 100 },
      { tag: "0002_medicare_facilities_raw", hash: "hash:0002_medicare_facilities_raw", created_at: 200 },
    ]);
  });

  it("stops at the first marker whose table is missing, so that migration still runs", () => {
    const rows = planBaseline({ historyCount: 0, existingTables: new Set(["users"]), journal: JOURNAL, hashOf });
    expect(rows.map((r) => r.tag)).toEqual(["0000_cute_nemesis"]);
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

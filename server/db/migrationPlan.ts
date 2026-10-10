// Pure helpers for applying drizzle migrations safely (see server/db/migrate.ts).
import crypto from "crypto";
import fs from "fs";
import path from "path";

export interface JournalEntry {
  idx: number;
  tag: string;
  when: number;
}

export function readJournal(migrationsFolder: string): JournalEntry[] {
  const journal = JSON.parse(fs.readFileSync(path.join(migrationsFolder, "meta", "_journal.json"), "utf8"));
  return journal.entries.map((e: any) => ({ idx: e.idx, tag: e.tag, when: e.when }));
}

/** The hash drizzle's migrator records for a migration: sha256 of the file text. */
export function migrationHash(migrationsFolder: string, tag: string): string {
  const sql = fs.readFileSync(path.join(migrationsFolder, `${tag}.sql`)).toString();
  return crypto.createHash("sha256").update(sql).digest("hex");
}

/**
 * Migrations that are NOT safe to run twice, and the table whose presence
 * proves each one is already applied. Every later migration is written to be
 * idempotent (IF NOT EXISTS), so these are the only ones a database that was
 * built with `drizzle-kit push` must have recorded before migrating.
 *
 * Baselining 0002 records it without its data backfill (db:push creates the
 * side table empty). Readers fall back to medicare_facilities.raw_data, and
 * `npm run db:backfill-facilities-raw` fills the table in short batches; it
 * isn't run here because copying ~46M rows would hold boot for hours.
 */
export const NON_IDEMPOTENT_MARKERS: Record<string, string> = {
  "0000_cute_nemesis": "users",
  "0002_medicare_facilities_raw": "medicare_facilities_raw",
};

export interface BaselineRow {
  tag: string;
  hash: string;
  created_at: number;
}

/**
 * A database created with `drizzle-kit push` has the schema but no migration
 * history, so the migrator would try to re-create every table. Record the
 * non-idempotent migrations whose objects already exist (in journal order,
 * stopping at the first that is missing); the idempotent ones then simply
 * run and fill any gaps.
 *
 * Returns [] for a database that already has history, or for an empty
 * database (where every migration should run).
 */
export function planBaseline(input: {
  historyCount: number;
  existingTables: Set<string>;
  journal: JournalEntry[];
  hashOf: (tag: string) => string;
}): BaselineRow[] {
  if (input.historyCount > 0) return [];
  if (!input.existingTables.has("users")) return [];
  const rows: BaselineRow[] = [];
  for (const entry of [...input.journal].sort((a, b) => a.when - b.when)) {
    const marker = NON_IDEMPOTENT_MARKERS[entry.tag];
    if (!marker) continue;
    if (!input.existingTables.has(marker)) break;
    rows.push({ tag: entry.tag, hash: input.hashOf(entry.tag), created_at: entry.when });
  }
  return rows;
}

/** Problems that would make drizzle's migrator silently skip or mis-order migrations. */
export function journalProblems(journal: JournalEntry[], sqlFiles: string[], legacyUnjournaled: string[]): string[] {
  const problems: string[] = [];
  for (let i = 1; i < journal.length; i += 1) {
    if (journal[i].idx <= journal[i - 1].idx) problems.push(`${journal[i].tag}: idx ${journal[i].idx} is not after ${journal[i - 1].idx}`);
    // The migrator only runs entries newer than the last recorded one.
    if (journal[i].when <= journal[i - 1].when) problems.push(`${journal[i].tag}: "when" is not after ${journal[i - 1].tag}`);
  }
  const tags = new Set(journal.map((e) => e.tag));
  for (const file of sqlFiles) {
    const tag = file.replace(/\.sql$/, "");
    if (!tags.has(tag) && !legacyUnjournaled.includes(tag)) problems.push(`${file} is not in the journal`);
  }
  for (const e of journal) {
    if (!sqlFiles.includes(`${e.tag}.sql`)) problems.push(`${e.tag}.sql is missing`);
  }
  return problems;
}

/** Unjournaled migration files kept for history; 0007 re-applies their columns idempotently. */
export const LEGACY_UNJOURNALED = ["0001_mute_star_brand", "0002_cynical_hellfire_club"];

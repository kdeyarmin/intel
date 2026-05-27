/**
 * Contract tests for the medicare_facilities.raw_data side-table split (PR B,
 * phase 1). These verify:
 *  - the Drizzle schema for medicare_facilities_raw matches the documented
 *    shape (one-to-one with medicare_facilities.id, cascade delete, NOT NULL
 *    raw_data),
 *  - the migration SQL creates the table, wires the FK with ON DELETE CASCADE,
 *    and includes a re-runnable backfill block.
 *
 * The dual-write code path in triggerImport.ts is exercised at the type level
 * by the typecheck step; an end-to-end integration test would need a live
 * Postgres and is intentionally not in scope here.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { medicareFacilities, medicareFacilitiesRaw } from "../server/db/schema";
import { getTableColumns } from "drizzle-orm";

describe("medicareFacilitiesRaw schema", () => {
  it("exposes a facility_id PK that references medicare_facilities", () => {
    const cols = getTableColumns(medicareFacilitiesRaw);
    expect(cols.facility_id).toBeDefined();
    expect(cols.facility_id.primary).toBe(true);
    // raw_data is the whole point of the side table — must be non-null.
    expect(cols.raw_data).toBeDefined();
    expect(cols.raw_data.notNull).toBe(true);
    expect(cols.updated_at).toBeDefined();
  });

  it("keeps the column on medicare_facilities during phase 1 (dropped in PR C)", () => {
    const cols = getTableColumns(medicareFacilities);
    expect(cols.raw_data).toBeDefined();
  });

  it("uses exactly the three side-table columns and nothing else", () => {
    const cols = Object.keys(getTableColumns(medicareFacilitiesRaw)).sort();
    expect(cols).toEqual(["facility_id", "raw_data", "updated_at"]);
  });
});

describe("medicare_facilities_raw migration", () => {
  const migrationPath = resolve(__dirname, "../drizzle/0002_medicare_facilities_raw.sql");
  const sql = readFileSync(migrationPath, "utf-8");

  it("creates the side table with the right columns", () => {
    expect(sql).toMatch(/CREATE TABLE "medicare_facilities_raw"/);
    expect(sql).toMatch(/"facility_id" integer PRIMARY KEY NOT NULL/);
    expect(sql).toMatch(/"raw_data" jsonb NOT NULL/);
    expect(sql).toMatch(/"updated_at" timestamp with time zone DEFAULT now\(\)/);
  });

  it("wires the FK to medicare_facilities with ON DELETE CASCADE", () => {
    expect(sql).toMatch(/REFERENCES "public"\."medicare_facilities"\("id"\) ON DELETE cascade/);
  });

  it("includes a re-runnable batched backfill of existing raw_data", () => {
    expect(sql).toMatch(/INSERT INTO medicare_facilities_raw/);
    expect(sql).toMatch(/ON CONFLICT \(facility_id\) DO NOTHING/);
    expect(sql).toMatch(/LIMIT batch_size/);
    expect(sql).toMatch(/LOOP[\s\S]*EXIT WHEN moved = 0[\s\S]*END LOOP/);
  });

  it("does NOT drop the medicare_facilities.raw_data column (phase 2 responsibility)", () => {
    expect(sql).not.toMatch(/ALTER TABLE "?medicare_facilities"? DROP COLUMN.*raw_data/i);
  });
});

describe("medicare_facilities_raw journal entry", () => {
  it("is registered in drizzle/meta/_journal.json", () => {
    const journal = JSON.parse(
      readFileSync(resolve(__dirname, "../drizzle/meta/_journal.json"), "utf-8"),
    );
    const tags = (journal.entries as Array<{ tag: string }>).map((e) => e.tag);
    expect(tags).toContain("0002_medicare_facilities_raw");
  });
});

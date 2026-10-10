/**
 * Tests for the drizzle migrations added in this PR:
 *   - drizzle/0001_mute_star_brand.sql   (provider_service_utilization columns)
 *   - drizzle/0002_cynical_hellfire_club.sql (import_schedule_configs columns)
 *
 * These verify that each migration file contains the correct ALTER TABLE
 * statements with the right column names and types, and that the Drizzle
 * TypeScript schema (server/db/schema.ts) reflects those same columns so the
 * ORM and the DB stay in sync.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { journalProblems, LEGACY_UNJOURNALED, readJournal } from "../server/db/migrationPlan";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ROOT = path.resolve(import.meta.dirname, "..");

function readMigration(filename: string): string {
  return fs.readFileSync(path.join(ROOT, "drizzle", filename), "utf8");
}

function readSchema(): string {
  return fs.readFileSync(path.join(ROOT, "server", "db", "schema.ts"), "utf8");
}

// ─── 0001: provider_service_utilization columns ───────────────────────────────

describe("migration 0001_mute_star_brand — provider_service_utilization", () => {
  const sql = readMigration("0001_mute_star_brand.sql");

  it("targets the correct table", () => {
    expect(sql).toContain('"provider_service_utilization"');
  });

  it("adds hcpcs_code as varchar(20)", () => {
    expect(sql).toContain('ADD COLUMN "hcpcs_code" varchar(20)');
  });

  it("adds hcpcs_description as text", () => {
    expect(sql).toContain('ADD COLUMN "hcpcs_description" text');
  });

  it("adds place_of_service as varchar(10)", () => {
    expect(sql).toContain('ADD COLUMN "place_of_service" varchar(10)');
  });

  it("adds average_medicare_payment_amt as varchar(50)", () => {
    expect(sql).toContain('ADD COLUMN "average_medicare_payment_amt" varchar(50)');
  });

  it("contains exactly 4 ALTER TABLE statements", () => {
    const matches = sql.match(/ALTER TABLE/g) ?? [];
    expect(matches).toHaveLength(4);
  });

  it("uses Drizzle statement-breakpoint markers between statements", () => {
    expect(sql).toContain("--> statement-breakpoint");
  });
});

// ─── 0002: import_schedule_configs columns ────────────────────────────────────

describe("migration 0002_cynical_hellfire_club — import_schedule_configs", () => {
  const sql = readMigration("0002_cynical_hellfire_club.sql");

  it("targets the correct table", () => {
    expect(sql).toContain('"import_schedule_configs"');
  });

  it("adds label as varchar(255)", () => {
    expect(sql).toContain('ADD COLUMN "label" varchar(255)');
  });

  it("adds schedule_frequency as varchar(30)", () => {
    expect(sql).toContain('ADD COLUMN "schedule_frequency" varchar(30)');
  });

  it("adds schedule_time as varchar(10)", () => {
    expect(sql).toContain('ADD COLUMN "schedule_time" varchar(10)');
  });

  it("adds nppes_config as jsonb", () => {
    expect(sql).toContain('ADD COLUMN "nppes_config" jsonb');
  });

  it("adds api_url as text", () => {
    expect(sql).toContain('ADD COLUMN "api_url" text');
  });

  it("adds data_year as varchar(10)", () => {
    expect(sql).toContain('ADD COLUMN "data_year" varchar(10)');
  });

  it("adds is_active as boolean with DEFAULT true", () => {
    expect(sql).toContain('ADD COLUMN "is_active" boolean DEFAULT true');
  });

  it("adds last_run_at as timestamp", () => {
    expect(sql).toContain('ADD COLUMN "last_run_at" timestamp');
  });

  it("adds last_run_status as varchar(30)", () => {
    expect(sql).toContain('ADD COLUMN "last_run_status" varchar(30)');
  });

  it("adds last_run_summary as text", () => {
    expect(sql).toContain('ADD COLUMN "last_run_summary" text');
  });

  it("adds last_successful_run_at as timestamp", () => {
    expect(sql).toContain('ADD COLUMN "last_successful_run_at" timestamp');
  });

  it("adds next_run_at as timestamp", () => {
    expect(sql).toContain('ADD COLUMN "next_run_at" timestamp');
  });

  it("adds consecutive_failures as integer with DEFAULT 0", () => {
    expect(sql).toContain('ADD COLUMN "consecutive_failures" integer DEFAULT 0');
  });

  it("contains exactly 13 ALTER TABLE statements", () => {
    const matches = sql.match(/ALTER TABLE/g) ?? [];
    expect(matches).toHaveLength(13);
  });

  it("uses Drizzle statement-breakpoint markers between statements", () => {
    expect(sql).toContain("--> statement-breakpoint");
  });
});

// ─── Schema parity: provider_service_utilization ─────────────────────────────
// Verify that schema.ts reflects every column added by migration 0001, so
// the ORM definition and the DB stay in sync.

describe("schema.ts — providerServiceUtilization parity with migration 0001", () => {
  const schema = readSchema();

  it("declares the providerServiceUtilization table", () => {
    expect(schema).toContain('pgTable("provider_service_utilization"');
  });

  it("defines hcpcs_code with length 20", () => {
    expect(schema).toContain('hcpcs_code: varchar("hcpcs_code", { length: 20 })');
  });

  it("defines hcpcs_description as text", () => {
    expect(schema).toContain('hcpcs_description: text("hcpcs_description")');
  });

  it("defines place_of_service with length 10", () => {
    expect(schema).toContain('place_of_service: varchar("place_of_service", { length: 10 })');
  });

  it("defines average_medicare_payment_amt with length 50", () => {
    expect(schema).toContain('average_medicare_payment_amt: varchar("average_medicare_payment_amt", { length: 50 })');
  });
});

// ─── Schema parity: import_schedule_configs ──────────────────────────────────
// Verify that schema.ts reflects every column added by migration 0002.

describe("schema.ts — importScheduleConfigs parity with migration 0002", () => {
  const schema = readSchema();

  it("declares the importScheduleConfigs table", () => {
    expect(schema).toContain('pgTable("import_schedule_configs"');
  });

  it("defines label with length 255", () => {
    expect(schema).toContain('label: varchar("label", { length: 255 })');
  });

  it("defines schedule_frequency with length 30", () => {
    expect(schema).toContain('schedule_frequency: varchar("schedule_frequency", { length: 30 })');
  });

  it("defines schedule_time with length 10", () => {
    expect(schema).toContain('schedule_time: varchar("schedule_time", { length: 10 })');
  });

  it("defines nppes_config as jsonb", () => {
    expect(schema).toContain('nppes_config: jsonb("nppes_config")');
  });

  it("defines api_url as text", () => {
    expect(schema).toContain('api_url: text("api_url")');
  });

  it("defines data_year with length 10", () => {
    // importScheduleConfigs has data_year; verify it exists in that context
    expect(schema).toContain('"import_schedule_configs"');
    expect(schema).toContain('data_year: varchar("data_year", { length: 10 })');
  });

  it("defines is_active as boolean with default true", () => {
    expect(schema).toContain('is_active: boolean("is_active").default(true)');
  });

  it("defines last_run_at as timestamp", () => {
    expect(schema).toContain('last_run_at: timestamp("last_run_at")');
  });

  it("defines last_run_status with length 30", () => {
    expect(schema).toContain('last_run_status: varchar("last_run_status", { length: 30 })');
  });

  it("defines last_run_summary as text", () => {
    expect(schema).toContain('last_run_summary: text("last_run_summary")');
  });

  it("defines last_successful_run_at as timestamp", () => {
    expect(schema).toContain('last_successful_run_at: timestamp("last_successful_run_at")');
  });

  it("defines next_run_at as timestamp", () => {
    expect(schema).toContain('next_run_at: timestamp("next_run_at")');
  });

  it("defines consecutive_failures as integer with default 0", () => {
    expect(schema).toContain('consecutive_failures: integer("consecutive_failures").default(0)');
  });
});
// ─── 0003: columns the UI wrote but the schema never had ──────────────────────

describe("migration 0003_entity_field_sync", () => {
  const sql = readMigration("0003_entity_field_sync.sql");
  const schema = readSchema();

  it("is registered in the drizzle journal after 0002", () => {
    const journal = JSON.parse(fs.readFileSync(path.join(ROOT, "drizzle", "meta", "_journal.json"), "utf8"));
    const tags = journal.entries.map((e: { tag: string }) => e.tag);
    expect(tags).toContain("0003_entity_field_sync");
    const entry = journal.entries.find((e: { tag: string }) => e.tag === "0003_entity_field_sync");
    const prev = journal.entries.find((e: { tag: string }) => e.tag === "0002_medicare_facilities_raw");
    expect(entry.when).toBeGreaterThan(prev.when);
  });

  it("only adds columns, idempotently", () => {
    const statements = sql.split("--> statement-breakpoint").map((s) => s.replace(/^--.*$/gm, "").trim()).filter(Boolean);
    expect(statements.length).toBeGreaterThan(20);
    for (const stmt of statements) {
      expect(stmt).toMatch(/^ALTER TABLE "\w+" ADD COLUMN IF NOT EXISTS "\w+" [\w()]+( DEFAULT \w+)?;$/);
    }
  });

  it("every added column is declared in the Drizzle schema", () => {
    for (const [, column] of sql.matchAll(/ADD COLUMN IF NOT EXISTS "(\w+)"/g)) {
      expect(schema, column).toMatch(new RegExp(`\\b${column}: \\w+\\("${column}"`));
    }
  });

  it("adds the fields that made saved state disappear", () => {
    expect(sql).toContain('ALTER TABLE "saved_filters" ADD COLUMN IF NOT EXISTS "is_default" boolean');
    expect(sql).toContain('ALTER TABLE "custom_reports" ADD COLUMN IF NOT EXISTS "is_favorite" boolean');
    expect(sql).toContain('ALTER TABLE "import_batches" ADD COLUMN IF NOT EXISTS "paused_at" timestamp');
    expect(sql).toContain('ALTER TABLE "outreach_messages" ADD COLUMN IF NOT EXISTS "recipient_name" varchar(255)');
  });
});

// ─── 0004 / 0005: outreach sending and email verification ─────────────────────

describe.each([
  ["0004_outreach_sending", "0003_entity_field_sync"],
  ["0005_email_verification", "0004_outreach_sending"],
])("migration %s", (tag, previous) => {
  const sql = readMigration(`${tag}.sql`);
  const schema = readSchema();
  const journal = JSON.parse(fs.readFileSync(path.join(ROOT, "drizzle", "meta", "_journal.json"), "utf8"));

  it(`is registered in the drizzle journal after ${previous}`, () => {
    const entry = journal.entries.find((e: { tag: string }) => e.tag === tag);
    const prev = journal.entries.find((e: { tag: string }) => e.tag === previous);
    expect(entry).toBeTruthy();
    expect(entry.idx).toBe(prev.idx + 1);
    expect(entry.when).toBeGreaterThan(prev.when);
  });

  it("is idempotent and only adds nullable columns, new tables or indexes", () => {
    const statements = sql.split("--> statement-breakpoint").map((s) => s.replace(/^--.*$/gm, "").trim()).filter(Boolean);
    for (const stmt of statements) {
      expect(stmt).toMatch(/^(ALTER TABLE "\w+" ADD COLUMN IF NOT EXISTS "\w+" [\w()]+;|CREATE TABLE IF NOT EXISTS |CREATE INDEX IF NOT EXISTS "\w+" ON "\w+" )/);
    }
  });

  it("every index it creates is declared in the Drizzle schema", () => {
    for (const [, name] of sql.matchAll(/CREATE INDEX IF NOT EXISTS "(\w+)"/g)) {
      expect(schema, name).toContain(`index("${name}")`);
    }
  });

  it("every added column is declared in the Drizzle schema", () => {
    for (const [, column] of sql.matchAll(/ADD COLUMN IF NOT EXISTS "(\w+)"/g)) {
      expect(schema, column).toMatch(new RegExp(`\\b${column}: \\w+\\("${column}"`));
    }
  });
});

describe("migration 0006_provider_facility_matches", () => {
  const sql = readMigration("0006_provider_facility_matches.sql");
  const schema = readSchema();
  const journal = JSON.parse(fs.readFileSync(path.join(ROOT, "drizzle", "meta", "_journal.json"), "utf8"));

  it("is registered after 0005", () => {
    const entry = journal.entries.find((e: { tag: string }) => e.tag === "0006_provider_facility_matches");
    const prev = journal.entries.find((e: { tag: string }) => e.tag === "0005_email_verification");
    expect(entry.idx).toBe(prev.idx + 1);
    expect(entry.when).toBeGreaterThan(prev.when);
  });

  it("only touches provider_location_matches, idempotently", () => {
    const statements = sql.split("--> statement-breakpoint").map((s) => s.replace(/^--.*$/gm, "").trim()).filter(Boolean);
    for (const stmt of statements) {
      expect(stmt).toContain('"provider_location_matches"');
      expect(stmt).toMatch(/^(ALTER TABLE "\w+" ADD COLUMN IF NOT EXISTS|ALTER TABLE "\w+" ALTER COLUMN "status" SET DEFAULT|UPDATE |CREATE INDEX IF NOT EXISTS)/);
    }
  });

  it("declares every added column in the Drizzle schema", () => {
    for (const [, column] of sql.matchAll(/ADD COLUMN IF NOT EXISTS "(\w+)"/g)) {
      expect(schema, column).toMatch(new RegExp(`\\b${column}: \\w+\\("${column}"`));
    }
  });
});

describe("migration 0007_schema_catchup", () => {
  const sql = readMigration("0007_schema_catchup.sql");
  const schema = readSchema();

  it("only adds columns, idempotently", () => {
    const statements = sql.split("--> statement-breakpoint").map((s) => s.replace(/^--.*$/gm, "").trim()).filter(Boolean);
    expect(statements).toHaveLength(17);
    for (const stmt of statements) {
      expect(stmt).toMatch(/^ALTER TABLE "(provider_service_utilization|import_schedule_configs)" ADD COLUMN IF NOT EXISTS "\w+" [\w() ]+;$/);
    }
  });

  it("covers every column from the unjournaled 0001 and 0002 files", () => {
    for (const legacy of ["0001_mute_star_brand.sql", "0002_cynical_hellfire_club.sql"]) {
      for (const [, column] of readMigration(legacy).matchAll(/ADD COLUMN "(\w+)"/g)) {
        expect(sql, column).toContain(`ADD COLUMN IF NOT EXISTS "${column}"`);
      }
    }
  });

  it("declares every added column in the Drizzle schema", () => {
    for (const [, column] of sql.matchAll(/ADD COLUMN IF NOT EXISTS "(\w+)"/g)) {
      expect(schema, column).toMatch(new RegExp(`\\b${column}: \\w+\\("${column}"`));
    }
  });
});

describe("migration journal", () => {
  const folder = path.join(ROOT, "drizzle");
  const sqlFiles = fs.readdirSync(folder).filter((f) => f.endsWith(".sql"));

  it("is ordered and journals every migration file", () => {
    expect(journalProblems(readJournal(folder), sqlFiles, LEGACY_UNJOURNALED)).toEqual([]);
  });

  it("only lists legacy files that still exist", () => {
    for (const tag of LEGACY_UNJOURNALED) expect(sqlFiles).toContain(`${tag}.sql`);
  });
});

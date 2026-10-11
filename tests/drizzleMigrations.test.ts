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

// ─── 0004: campaign sending (suppressions, tracking, score details) ───────────

describe("migration 0004_outreach_sending", () => {
  const sql = readMigration("0004_outreach_sending.sql");
  const schema = readSchema();
  const statements = sql.split("--> statement-breakpoint").map((s) => s.replace(/^--.*$/gm, "").trim()).filter(Boolean);

  it("is registered in the drizzle journal after 0003", () => {
    const journal = JSON.parse(fs.readFileSync(path.join(ROOT, "drizzle", "meta", "_journal.json"), "utf8"));
    const entry = journal.entries.find((e: { tag: string }) => e.tag === "0004_outreach_sending");
    const prev = journal.entries.find((e: { tag: string }) => e.tag === "0003_entity_field_sync");
    expect(entry).toBeDefined();
    expect(entry.when).toBeGreaterThan(prev.when);
  });

  it("is idempotent: every statement is IF NOT EXISTS", () => {
    expect(statements.length).toBeGreaterThan(0);
    for (const stmt of statements) {
      expect(stmt).toMatch(/^(CREATE TABLE IF NOT EXISTS|ALTER TABLE "\w+" ADD COLUMN IF NOT EXISTS|CREATE INDEX IF NOT EXISTS) /);
    }
  });

  it("creates email_suppressions as the schema declares it", () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "email_suppressions"');
    expect(sql).toContain('"email" varchar(255) PRIMARY KEY NOT NULL');
    expect(sql).toContain('"reason" varchar(50)');
    expect(sql).toContain('"source" varchar(50)');
    expect(sql).toContain('"created_date" timestamp DEFAULT now()');
    expect(schema).toContain('pgTable("email_suppressions"');
    expect(schema).toContain('email: varchar("email", { length: 255 }).primaryKey()');
    expect(schema).toContain('reason: varchar("reason", { length: 50 })');
    expect(schema).toContain('source: varchar("source", { length: 50 })');
  });

  it("adds the tracking and score columns, each declared in the schema", () => {
    const added = [...sql.matchAll(/ALTER TABLE "(\w+)" ADD COLUMN IF NOT EXISTS "(\w+)" ([\w()]+);/g)]
      .map(([, table, column, type]) => `${table}.${column} ${type}`);
    expect(added).toEqual([
      "outreach_messages.responded_at timestamp",
      "outreach_messages.provider_message_id varchar(255)",
      "providers.ai_outreach_strategy text",
      "providers.ai_engagement_factors jsonb",
      "providers.ai_outreach_scored_at timestamp",
    ]);
    expect(schema).toContain('responded_at: timestamp("responded_at")');
    expect(schema).toContain('provider_message_id: varchar("provider_message_id", { length: 255 })');
    expect(schema).toContain('ai_outreach_strategy: text("ai_outreach_strategy")');
    expect(schema).toContain('ai_engagement_factors: jsonb("ai_engagement_factors")');
    expect(schema).toContain('ai_outreach_scored_at: timestamp("ai_outreach_scored_at")');
  });

  it("adds the partial pending-by-email index, matching the schema", () => {
    expect(sql).toContain(
      `CREATE INDEX IF NOT EXISTS "messages_pending_email_idx" ON "outreach_messages" (lower("recipient_email")) WHERE "status" = 'pending';`,
    );
    expect(schema).toContain(
      'index("messages_pending_email_idx").on(sql`lower(${table.recipient_email})`).where(sql`${table.status} = \'pending\'`)',
    );
  });
});

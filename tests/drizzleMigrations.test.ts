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

describe("migration 0008_accounts", () => {
  const sql = readMigration("0008_accounts.sql");
  const schema = readSchema();

  it("keeps existing accounts working", () => {
    // New column defaults must not lock anyone out.
    expect(sql).toContain(`ADD COLUMN IF NOT EXISTS "status" varchar(20) DEFAULT 'active' NOT NULL`);
    expect(sql).toContain(`ADD COLUMN IF NOT EXISTS "token_version" integer DEFAULT 0 NOT NULL`);
    expect(sql).toMatch(/UPDATE "users" SET "approved_at" = COALESCE\("created_date", now\(\)\) WHERE "approved_at" IS NULL AND "status" = 'active'/);
  });

  it("is idempotent", () => {
    const statements = sql.split("--> statement-breakpoint").map((s) => s.replace(/^--.*$/gm, "").trim()).filter(Boolean);
    for (const stmt of statements) {
      expect(stmt).toMatch(/^(ALTER TABLE "users" ADD COLUMN IF NOT EXISTS|CREATE TABLE IF NOT EXISTS|CREATE INDEX IF NOT EXISTS|UPDATE "users"|DO \$\$)/);
    }
  });

  it("only builds the case-insensitive email index when no emails collide", () => {
    expect(sql).toMatch(/IF NOT EXISTS \(SELECT 1 FROM "users" GROUP BY lower\("email"\) HAVING count\(\*\) > 1\) THEN\s+CREATE UNIQUE INDEX IF NOT EXISTS "users_email_lower_uq"/);
  });

  it("declares every added column and the token table in the Drizzle schema", () => {
    for (const [, column] of sql.matchAll(/ADD COLUMN IF NOT EXISTS "(\w+)"/g)) {
      expect(schema, column).toMatch(new RegExp(`\\b${column}: \\w+\\("${column}"`));
    }
    expect(schema).toContain('export const authTokens = pgTable("auth_tokens"');
    expect(schema).toContain('uniqueIndex("users_email_lower_uq")');
  });

  it("creates the shared login-attempt table and declares it in the schema", () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS "login_attempts" \(/);
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS "login_attempts_window_ends_idx" ON "login_attempts" ("window_ends_at")');
    expect(schema).toContain('export const loginAttempts = pgTable("login_attempts"');
    expect(schema).toContain('index("login_attempts_window_ends_idx")');
    for (const column of ["email", "attempts", "window_ends_at"]) {
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

describe("migration 0009_pg_trgm", () => {
  const sql = readMigration("0009_pg_trgm.sql");

  it("installs pg_trgm without failing where extensions are refused", () => {
    expect(sql).toContain("CREATE EXTENSION IF NOT EXISTS pg_trgm;");
    expect(sql).toMatch(/EXCEPTION\s+WHEN insufficient_privilege OR undefined_file OR feature_not_supported THEN\s+RAISE NOTICE/);
  });

  it("builds no index inside the migration transaction (the trigram index is built at boot, concurrently)", () => {
    expect(sql).not.toMatch(/CREATE (UNIQUE )?INDEX/i);
  });
});

describe("migration 0010_census_geography", () => {
  const sql = readMigration("0010_census_geography.sql");
  const schema = readSchema();

  it("only creates tables and indexes, idempotently", () => {
    const statements = sql.split("--> statement-breakpoint").map((s) => s.replace(/^--.*$/gm, "").trim()).filter(Boolean);
    for (const stmt of statements) expect(stmt).toMatch(/^CREATE (TABLE|INDEX) IF NOT EXISTS "geo_/);
  });

  it("declares every geo table in the Drizzle schema", () => {
    for (const [, table] of sql.matchAll(/CREATE TABLE IF NOT EXISTS "(\w+)"/g)) {
      expect(schema, table).toContain(`pgTable("${table}"`);
    }
  });
});

describe("migration 0011_rollups", () => {
  const sql = readMigration("0011_rollups.sql");
  const schema = readSchema();

  it("only creates tables, idempotently", () => {
    const statements = sql.split("--> statement-breakpoint").map((s) => s.replace(/^--.*$/gm, "").trim()).filter(Boolean);
    for (const stmt of statements) expect(stmt).toMatch(/^CREATE TABLE IF NOT EXISTS "rollup_/);
  });

  it("declares every rollup table in the Drizzle schema", () => {
    for (const [, table] of sql.matchAll(/CREATE TABLE IF NOT EXISTS "(\w+)"/g)) {
      expect(schema, table).toContain(`pgTable("${table}"`);
    }
  });
});

describe("migration 0015_import_completion", () => {
  const sql = readMigration("0015_import_completion.sql");
  const schema = readSchema();

  it("is idempotent: only IF NOT EXISTS column adds and table creates", () => {
    const statements = sql.split("--> statement-breakpoint").map((s) => s.replace(/^--.*$/gm, "").trim()).filter(Boolean);
    expect(statements).toHaveLength(4);
    for (const stmt of statements) {
      expect(stmt).toMatch(/^(ALTER TABLE "\w+" ADD COLUMN IF NOT EXISTS|CREATE TABLE IF NOT EXISTS) /);
    }
  });

  it("links schedules and batches both ways", () => {
    expect(sql).toContain('ALTER TABLE "import_schedule_configs" ADD COLUMN IF NOT EXISTS "last_batch_id" integer');
    expect(sql).toContain('ALTER TABLE "import_batches" ADD COLUMN IF NOT EXISTS "schedule_id" integer');
    expect(schema).toContain('last_batch_id: integer("last_batch_id")');
    expect(schema).toContain('schedule_id: integer("schedule_id")');
  });

  it("declares the registry and Order & Referring tables in the Drizzle schema", () => {
    for (const [, table] of sql.matchAll(/CREATE TABLE IF NOT EXISTS "(\w+)"/g)) {
      expect(schema, table).toContain(`pgTable("${table}"`);
    }
    expect(schema).toContain('status: varchar("status", { length: 20 }).notNull().default("never_imported")');
    expect(schema).toContain('npi: varchar("npi", { length: 10 }).primaryKey()');
  });

  it("is registered in the drizzle journal after 0014", () => {
    const journal = JSON.parse(fs.readFileSync(path.join(ROOT, "drizzle", "meta", "_journal.json"), "utf8"));
    const tags = journal.entries.map((e: { tag: string }) => e.tag);
    expect(tags.indexOf("0015_import_completion")).toBe(tags.indexOf("0014_assistant_actions_user_idx") + 1);
    const whens = journal.entries.map((e: { when: number }) => e.when);
    expect(whens[whens.length - 1]).toBeGreaterThan(whens[whens.length - 2]);
  });
});

describe("migration 0016_cms_typed_tables", () => {
  const sql = readMigration("0016_cms_typed_tables.sql");
  const schema = readSchema();

  it("only creates tables and indexes, idempotently", () => {
    const statements = sql.split("--> statement-breakpoint").map((s) => s.replace(/^--.*$/gm, "").trim()).filter(Boolean);
    expect(statements.length).toBeGreaterThan(20);
    for (const stmt of statements) expect(stmt).toMatch(/^CREATE (TABLE|UNIQUE INDEX|INDEX) IF NOT EXISTS "cms_|^CREATE (UNIQUE INDEX|INDEX) IF NOT EXISTS "(uq|idx)_cms_/);
  });

  it("declares every typed table in the Drizzle schema with its natural-key index", () => {
    const tables = [...sql.matchAll(/CREATE TABLE IF NOT EXISTS "(\w+)"/g)].map((m) => m[1]);
    expect(tables).toHaveLength(11);
    for (const table of tables) {
      expect(schema, table).toContain(`pgTable("${table}"`);
      const uq = new RegExp(`CREATE UNIQUE INDEX IF NOT EXISTS "(\\w+)" ON "${table}"`).exec(sql);
      expect(uq, `${table} unique index`).not.toBeNull();
      expect(schema, `${table} uniqueIndex`).toContain(`uniqueIndex("${uq![1]}")`);
    }
  });

  it("is registered in the drizzle journal after 0015", () => {
    const journal = JSON.parse(fs.readFileSync(path.join(ROOT, "drizzle", "meta", "_journal.json"), "utf8"));
    const tags = journal.entries.map((e: { tag: string }) => e.tag);
    expect(tags.indexOf("0016_cms_typed_tables")).toBe(tags.indexOf("0015_import_completion") + 1);
  });
});

describe("migration 0017_nucc_taxonomies", () => {
  const sql = readMigration("0017_nucc_taxonomies.sql");
  const schema = readSchema();

  it("creates the table and its index idempotently, nothing else", () => {
    const statements = sql.split("--> statement-breakpoint").map((s) => s.replace(/^--.*$/gm, "").trim()).filter(Boolean);
    expect(statements).toHaveLength(2);
    expect(statements[0]).toMatch(/^CREATE TABLE IF NOT EXISTS "nucc_taxonomies"/);
    expect(statements[1]).toMatch(/^CREATE INDEX IF NOT EXISTS "nucc_taxonomies_grouping_idx"/);
    expect(schema).toContain('pgTable("nucc_taxonomies"');
    expect(schema).toContain('index("nucc_taxonomies_grouping_idx")');
  });

  it("is registered in the drizzle journal after 0016", () => {
    const journal = JSON.parse(fs.readFileSync(path.join(ROOT, "drizzle", "meta", "_journal.json"), "utf8"));
    const tags = journal.entries.map((e: { tag: string }) => e.tag);
    expect(tags.indexOf("0017_nucc_taxonomies")).toBe(tags.indexOf("0016_cms_typed_tables") + 1);
    const whens = journal.entries.map((e: { when: number }) => e.when);
    expect(whens[whens.length - 1]).toBeGreaterThan(whens[whens.length - 2]);
  });
});

describe("migration 0018_market_rollups", () => {
  const sql = readMigration("0018_market_rollups.sql");
  const schema = readSchema();

  it("only creates rollup tables and indexes, idempotently", () => {
    const statements = sql.split("--> statement-breakpoint").map((s) => s.replace(/^--.*$/gm, "").trim()).filter(Boolean);
    expect(statements.length).toBeGreaterThan(10);
    for (const stmt of statements) expect(stmt).toMatch(/^CREATE (TABLE|INDEX) IF NOT EXISTS "(rollup_|idx_rollup_)/);
  });

  it("declares every rollup table in the Drizzle schema with a primary key", () => {
    const tables = [...sql.matchAll(/CREATE TABLE IF NOT EXISTS "(\w+)"/g)].map((m) => m[1]);
    expect(tables).toHaveLength(7);
    for (const table of tables) {
      expect(schema, table).toContain(`pgTable("${table}"`);
      expect(sql.slice(sql.indexOf(`"${table}" (`)), `${table} primary key`).toMatch(/PRIMARY KEY/);
    }
  });

  it("indexes the county-keyed reads of the market share and agency coverage tables, in the migration and the schema", () => {
    // County Intel reads these by county (geo_level + geo_code, county_fips), which neither primary key leads with.
    expect(sql).toContain('"idx_rollup_pac_share_geo" ON "rollup_pac_market_share" ("geo_level", "geo_code", "setting", "data_year")');
    expect(sql).toContain('"idx_rollup_agency_cov_county" ON "rollup_agency_coverage" ("county_fips", "setting")');
    expect(schema).toContain('index("idx_rollup_pac_share_geo").on(table.geo_level, table.geo_code, table.setting, table.data_year)');
    expect(schema).toContain('index("idx_rollup_agency_cov_county").on(table.county_fips, table.setting)');
  });

  it("is registered in the drizzle journal after 0017", () => {
    const journal = JSON.parse(fs.readFileSync(path.join(ROOT, "drizzle", "meta", "_journal.json"), "utf8"));
    const tags = journal.entries.map((e: { tag: string }) => e.tag);
    expect(tags.indexOf("0018_market_rollups")).toBe(tags.indexOf("0017_nucc_taxonomies") + 1);
    const whens = journal.entries.map((e: { when: number }) => e.when);
    expect(whens[whens.length - 1]).toBeGreaterThan(whens[whens.length - 2]);
  });
});

describe("migration 0019_acs_and_licensed_facilities", () => {
  const sql = readMigration("0019_acs_and_licensed_facilities.sql");
  const schema = readSchema();

  it("creates the ACS and licensing tables and adds the profile columns, all idempotently", () => {
    const statements = sql.split("--> statement-breakpoint").map((s) => s.replace(/^--.*$/gm, "").trim()).filter(Boolean);
    for (const stmt of statements) {
      expect(stmt).toMatch(/^(CREATE (TABLE|UNIQUE INDEX|INDEX) IF NOT EXISTS "|ALTER TABLE "rollup_county_market_profile" ADD COLUMN IF NOT EXISTS ")/);
    }
    const tables = [...sql.matchAll(/CREATE TABLE IF NOT EXISTS "(\w+)"/g)].map((m) => m[1]);
    expect(tables).toEqual(["census_acs_county", "census_acs_zcta", "licensed_facilities"]);
    for (const table of tables) expect(schema, table).toContain(`pgTable("${table}"`);
    expect(schema).toContain('uniqueIndex("uq_licensed_facilities")');
    for (const [, col] of sql.matchAll(/ADD COLUMN IF NOT EXISTS "(\w+)"/g)) expect(schema, col).toContain(`${col}: integer("${col}")`);
  });

  it("is registered in the drizzle journal after 0018", () => {
    const journal = JSON.parse(fs.readFileSync(path.join(ROOT, "drizzle", "meta", "_journal.json"), "utf8"));
    const tags = journal.entries.map((e: { tag: string }) => e.tag);
    expect(tags.indexOf("0019_acs_and_licensed_facilities")).toBe(tags.indexOf("0018_market_rollups") + 1);
    const whens = journal.entries.map((e: { when: number }) => e.when);
    expect(whens[whens.length - 1]).toBeGreaterThan(whens[whens.length - 2]);
  });
});

describe("migration 0020_organizations", () => {
  const sql = readMigration("0020_organizations.sql");
  const schema = readSchema();
  const statements = sql.split("--> statement-breakpoint").map((s) => s.replace(/^--.*$/gm, "").trim()).filter(Boolean);

  it("creates the organization tables, adds org_id columns and backfills, all idempotently", () => {
    for (const stmt of statements) {
      expect(stmt).toMatch(/^(CREATE (TABLE|INDEX) IF NOT EXISTS "|ALTER TABLE "\w+" ADD COLUMN IF NOT EXISTS "|INSERT INTO "(plans|organizations|organization_members)" [\s\S]*ON CONFLICT[\s\S]*DO NOTHING|SELECT setval\('organizations_id_seq'|UPDATE "\w+" SET "(org_id|is_platform_admin)" = (1|true) WHERE)/);
    }
    const tables = [...sql.matchAll(/CREATE TABLE IF NOT EXISTS "(\w+)"/g)].map((m) => m[1]);
    expect(tables).toEqual(["organizations", "organization_members", "plans", "org_usage"]);
    for (const table of tables) expect(schema, table).toContain(`pgTable("${table}"`);
  });

  it("gives every customer-owned table an org_id, backfilled to the legacy organization, with an index", () => {
    const added = [...sql.matchAll(/ALTER TABLE "(\w+)" ADD COLUMN IF NOT EXISTS "org_id"/g)].map((m) => m[1]);
    expect(added).toEqual([
      "lead_lists", "saved_filters", "custom_reports", "scheduled_reports", "scheduled_exports", "analytics_dashboards", "scoring_rules",
      "outreach_campaigns", "outreach_messages", "campaign_templates", "campaign_tasks", "data_quality_alerts", "audit_events",
      "assistant_conversations", "assistant_actions", "assistant_usage",
    ]);
    // The assistant's actions and usage are read per user, never per organization, so they carry no org index.
    const unindexed = new Set(["assistant_actions", "assistant_usage"]);
    for (const table of added) {
      expect(sql, table).toContain(`UPDATE "${table}" SET "org_id" = 1 WHERE "org_id" IS NULL`);
      if (!unindexed.has(table)) expect(sql, table).toMatch(new RegExp(`CREATE INDEX IF NOT EXISTS "${table}_org_idx" ON "${table}" \\("org_id"`));
      // The schema declares the column on the same table.
      const start = schema.indexOf(`pgTable("${table}"`);
      expect(start, table).toBeGreaterThan(-1);
      expect(schema.slice(start, schema.indexOf("});", start)), table).toContain('org_id: integer("org_id")');
    }
    for (const col of ["is_platform_admin", "terms_accepted_at", "terms_version"]) expect(sql).toContain(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "${col}"`);
    expect(sql).toContain(`UPDATE "users" SET "is_platform_admin" = true WHERE "role" = 'admin'`);
  });

  it("keeps constraint and index names within Postgres's 63-character limit", () => {
    for (const [, name] of sql.matchAll(/(?:CONSTRAINT|INDEX IF NOT EXISTS)\s+"([^"]+)"/g)) expect(name.length, name).toBeLessThanOrEqual(63);
  });

  it("is registered in the drizzle journal after 0019", () => {
    const journal = JSON.parse(fs.readFileSync(path.join(ROOT, "drizzle", "meta", "_journal.json"), "utf8"));
    const tags = journal.entries.map((e: { tag: string }) => e.tag);
    expect(tags.indexOf("0020_organizations")).toBe(tags.indexOf("0019_acs_and_licensed_facilities") + 1);
    const whens = journal.entries.map((e: { when: number }) => e.when);
    expect(whens[whens.length - 1]).toBeGreaterThan(whens[whens.length - 2]);
  });
});

describe("migration 0021_billing_event_guard", () => {
  const sql = readMigration("0021_billing_event_guard.sql");

  it("adds the Stripe event time to organizations, idempotently, and the schema declares it", () => {
    const statements = sql.replace(/^--.*$/gm, "").split(";").map((x) => x.trim()).filter(Boolean);
    expect(statements).toEqual(['ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "stripe_event_at" timestamp']);
    const schema = readSchema();
    const start = schema.indexOf('pgTable("organizations"');
    expect(schema.slice(start, schema.indexOf("});", start))).toContain('stripe_event_at: timestamp("stripe_event_at")');
  });

  it("is registered in the drizzle journal after 0020, later than it", () => {
    const journal = JSON.parse(fs.readFileSync(path.join(ROOT, "drizzle", "meta", "_journal.json"), "utf8"));
    const tags = journal.entries.map((e: { tag: string }) => e.tag);
    expect(tags.indexOf("0021_billing_event_guard")).toBe(tags.indexOf("0020_organizations") + 1);
    const at = (tag: string) => journal.entries.find((e: { tag: string }) => e.tag === tag).when;
    expect(at("0021_billing_event_guard")).toBeGreaterThan(at("0020_organizations"));
  });
});

describe("migration 0022_physician_certifications", () => {
  const sql = readMigration("0022_physician_certifications.sql");

  it("creates the certifications table and adds the three rollup columns, idempotently, and the schema declares them", () => {
    const statements = sql.replace(/^--.*$/gm, "").split(";").map((x) => x.trim()).filter(Boolean);
    expect(statements.map((x) => x.split("\n")[0])).toEqual([
      'CREATE TABLE IF NOT EXISTS "cms_physician_certifications" (',
      'CREATE UNIQUE INDEX IF NOT EXISTS "uq_cms_phys_cert" ON "cms_physician_certifications" ("npi", "hcpcs_code", "place_of_service", "data_year")',
      'ALTER TABLE "rollup_referral_sources" ADD COLUMN IF NOT EXISTS "hh_cert_benes" integer',
      'ALTER TABLE "rollup_referral_sources" ADD COLUMN IF NOT EXISTS "hospice_oversight_benes" integer',
      'ALTER TABLE "rollup_referral_sources" ADD COLUMN IF NOT EXISTS "hh_cert_year" varchar(10)',
    ]);
    const schema = readSchema();
    const table = schema.slice(schema.indexOf('pgTable("cms_physician_certifications"'));
    expect(table.slice(0, table.indexOf("});"))).toContain('uniqueIndex("uq_cms_phys_cert").on(table.npi, table.hcpcs_code, table.place_of_service, table.data_year)');
    const rollup = schema.slice(schema.indexOf('pgTable("rollup_referral_sources"'));
    expect(rollup.slice(0, rollup.indexOf("}, (table)"))).toMatch(/rank_in_county: integer\("rank_in_county"\),\s+hh_cert_benes: integer\("hh_cert_benes"\),\s+hospice_oversight_benes: integer\("hospice_oversight_benes"\),\s+hh_cert_year: varchar\("hh_cert_year", \{ length: 10 \}\),/);
  });

  it("is registered in the drizzle journal after 0021, later than it", () => {
    const journal = JSON.parse(fs.readFileSync(path.join(ROOT, "drizzle", "meta", "_journal.json"), "utf8"));
    const tags = journal.entries.map((e: { tag: string }) => e.tag);
    expect(tags.indexOf("0022_physician_certifications")).toBe(tags.indexOf("0021_billing_event_guard") + 1);
    const at = (tag: string) => journal.entries.find((e: { tag: string }) => e.tag === tag).when;
    expect(at("0022_physician_certifications")).toBeGreaterThan(at("0021_billing_event_guard"));
  });
});

describe("migration 0023_remaining_data_fixes", () => {
  const sql = readMigration("0023_remaining_data_fixes.sql");

  it("widens star ratings, stores DRG rows, and adds the hospice and county columns", () => {
    expect(sql).toMatch(/ALTER COLUMN "quality_rating" TYPE double precision/);
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "cms_inpatient_drg"');
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "uq_cms_inpatient_drg"');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "hospice_index" integer');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "hospice_rank_in_county" integer');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "avg_hcc_source" varchar(40)');
    const schema = readSchema();
    expect(schema).toContain('pgTable("cms_inpatient_drg"');
    const facilities = schema.slice(schema.indexOf('pgTable("medicare_facilities"'));
    expect(facilities.slice(0, facilities.indexOf("});"))).toContain('quality_rating: doublePrecision("quality_rating")');
    const rollup = schema.slice(schema.indexOf('pgTable("rollup_referral_sources"'));
    expect(rollup.slice(0, rollup.indexOf("}, (table)"))).toMatch(/hh_cert_year: varchar\("hh_cert_year", \{ length: 10 \}\),\s+hospice_index: integer\("hospice_index"\),\s+hospice_rank_in_county: integer\("hospice_rank_in_county"\),/);
  });

  it("is registered in the drizzle journal after 0022, later than it", () => {
    const journal = JSON.parse(fs.readFileSync(path.join(ROOT, "drizzle", "meta", "_journal.json"), "utf8"));
    const tags = journal.entries.map((e: { tag: string }) => e.tag);
    expect(tags.indexOf("0023_remaining_data_fixes")).toBe(tags.indexOf("0022_physician_certifications") + 1);
    const at = (tag: string) => journal.entries.find((e: { tag: string }) => e.tag === tag).when;
    expect(at("0023_remaining_data_fixes")).toBeGreaterThan(at("0022_physician_certifications"));
  });
});

describe("migration 0012_assistant", () => {
  const sql = readMigration("0012_assistant.sql");
  const schema = readSchema();

  it("only creates assistant tables and indexes, idempotently", () => {
    const statements = sql.split("--> statement-breakpoint").map((s) => s.replace(/^--.*$/gm, "").trim()).filter(Boolean);
    for (const stmt of statements) expect(stmt).toMatch(/^CREATE (UNIQUE )?(TABLE|INDEX) IF NOT EXISTS "assistant_/);
  });

  it("declares every assistant table in the Drizzle schema", () => {
    for (const [, table] of sql.matchAll(/CREATE TABLE IF NOT EXISTS "(\w+)"/g)) {
      expect(schema, table).toContain(`pgTable("${table}"`);
    }
  });

  it("keeps constraint and index names within Postgres's 63-character limit", () => {
    // A longer name is silently truncated, so drizzle-kit would see drift forever.
    for (const [, name] of sql.matchAll(/(?:CONSTRAINT|INDEX IF NOT EXISTS)\s+"([^"]+)"/g)) {
      expect(name.length, name).toBeLessThanOrEqual(63);
    }
  });

  it("removes a user's conversations, proposals and usage with the user", () => {
    for (const table of ["assistant_conversations", "assistant_actions", "assistant_usage"]) {
      expect(sql).toContain(`CONSTRAINT "${table}_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade`);
    }
  });
});

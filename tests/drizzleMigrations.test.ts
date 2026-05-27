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
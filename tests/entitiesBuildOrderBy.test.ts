/**
 * Tests for the buildOrderBy function and the LARGE_ENTITIES_REMAP_CREATED set
 * introduced in server/routes/entities.ts.
 *
 * buildOrderBy is module-private, so we replicate it here with the same logic.
 * desc/asc from drizzle-orm are replaced with lightweight test stubs that return
 * tagged objects — this lets us inspect the choice (which column, which
 * direction) without depending on Drizzle internals.
 *
 * If buildOrderBy is changed in production, update this test accordingly.
 */
import { describe, it, expect } from "vitest";

// ─── Minimal stubs for drizzle-orm's desc / asc ──────────────────────────────

type OrderSpec = { dir: "asc" | "desc"; col: any };

function desc(col: any): OrderSpec { return { dir: "desc", col }; }
function asc(col: any): OrderSpec { return { dir: "asc", col }; }

// ─── LARGE_ENTITIES_REMAP_CREATED (replicated from entities.ts) ──────────────

const LARGE_ENTITIES_REMAP_CREATED = new Set([
  "Provider",
  "ProviderLocation",
  "ProviderTaxonomy",
  "MedicareFacility",
  "MedicareMAInpatient",
  "CMSHHAStats",
  "CMSSNFStats",
  "CMSReferral",
  "CMSUtilization",
  "ProviderServiceUtilization",
]);

// ─── camelToSnake (replicated from entities.ts) ──────────────────────────────

function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

// ─── buildOrderBy (replicated from entities.ts) ──────────────────────────────

function buildOrderBy(table: any, sortField?: string, entityName?: string): OrderSpec[] {
  const pk = (table as any).id;
  if (!sortField) return pk ? [desc(pk)] : [desc(table.created_date)];
  const descending = sortField.startsWith("-");
  const field = descending ? sortField.slice(1) : sortField;
  if (
    (field === "created_date" || field === "createdDate") &&
    pk &&
    entityName &&
    LARGE_ENTITIES_REMAP_CREATED.has(entityName)
  ) {
    return [descending ? desc(pk) : asc(pk)];
  }
  const col = (table as any)[field] || (table as any)[camelToSnake(field)];
  if (!col) return pk ? [desc(pk)] : [desc(table.created_date)];
  return [descending ? desc(col) : asc(col)];
}

// ─── Mock table fixtures ──────────────────────────────────────────────────────

const colId = Symbol("id");
const colCreatedDate = Symbol("created_date");
const colFirstName = Symbol("first_name");

/** Table with id + created_date + first_name */
const fullTable = { id: colId, created_date: colCreatedDate, first_name: colFirstName };

/** Table with no id column (edge case) */
const noIdTable = { created_date: colCreatedDate };

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("buildOrderBy — default sort (no sortField)", () => {
  it("defaults to DESC id when table has a pk", () => {
    const [order] = buildOrderBy(fullTable);
    expect(order).toEqual({ dir: "desc", col: colId });
  });

  it("falls back to DESC created_date when table has no id", () => {
    const [order] = buildOrderBy(noIdTable);
    expect(order).toEqual({ dir: "desc", col: colCreatedDate });
  });
});

describe("buildOrderBy — created_date remap for large entities", () => {
  it("remaps created_date ASC to id ASC for a large entity", () => {
    const [order] = buildOrderBy(fullTable, "created_date", "Provider");
    expect(order).toEqual({ dir: "asc", col: colId });
  });

  it("remaps -created_date (DESC) to DESC id for a large entity", () => {
    const [order] = buildOrderBy(fullTable, "-created_date", "Provider");
    expect(order).toEqual({ dir: "desc", col: colId });
  });

  it("remaps camelCase createdDate ASC to id ASC for a large entity", () => {
    const [order] = buildOrderBy(fullTable, "createdDate", "MedicareFacility");
    expect(order).toEqual({ dir: "asc", col: colId });
  });

  it("remaps -createdDate (DESC) to DESC id for a large entity", () => {
    const [order] = buildOrderBy(fullTable, "-createdDate", "ProviderLocation");
    expect(order).toEqual({ dir: "desc", col: colId });
  });

  it("does NOT remap created_date for entities not in the large-entity set", () => {
    // A small entity like "User" should honor the actual created_date column
    const [order] = buildOrderBy(fullTable, "created_date", "User");
    expect(order).toEqual({ dir: "asc", col: colCreatedDate });
  });

  it("does NOT remap when entityName is undefined", () => {
    const [order] = buildOrderBy(fullTable, "created_date", undefined);
    expect(order).toEqual({ dir: "asc", col: colCreatedDate });
  });

  it("does NOT remap when table has no pk (no id column)", () => {
    const [order] = buildOrderBy(noIdTable, "created_date", "Provider");
    // No pk -> can't remap to pk -> uses created_date column
    expect(order).toEqual({ dir: "asc", col: colCreatedDate });
  });

  it("covers all expected large entity names", () => {
    const expected = [
      "Provider",
      "ProviderLocation",
      "ProviderTaxonomy",
      "MedicareFacility",
      "MedicareMAInpatient",
      "CMSHHAStats",
      "CMSSNFStats",
      "CMSReferral",
      "CMSUtilization",
      "ProviderServiceUtilization",
    ];
    for (const name of expected) {
      const [order] = buildOrderBy(fullTable, "created_date", name);
      expect(order.col, `Expected ${name} to remap created_date to id`).toBe(colId);
    }
  });
});

describe("buildOrderBy — explicit non-date sort fields", () => {
  it("returns ASC on a known column when sortField is plain (no leading -)", () => {
    const [order] = buildOrderBy(fullTable, "first_name");
    expect(order).toEqual({ dir: "asc", col: colFirstName });
  });

  it("returns DESC on a known column when sortField is prefixed with -", () => {
    const [order] = buildOrderBy(fullTable, "-first_name");
    expect(order).toEqual({ dir: "desc", col: colFirstName });
  });

  it("falls back to DESC id when requested column does not exist on the table", () => {
    const [order] = buildOrderBy(fullTable, "nonexistent_col");
    expect(order).toEqual({ dir: "desc", col: colId });
  });

  it("falls back to DESC created_date when unknown column and no pk", () => {
    const [order] = buildOrderBy(noIdTable, "nonexistent_col");
    expect(order).toEqual({ dir: "desc", col: colCreatedDate });
  });
});

describe("buildOrderBy — returns a single-element array", () => {
  it("always returns exactly one ordering spec", () => {
    expect(buildOrderBy(fullTable)).toHaveLength(1);
    expect(buildOrderBy(fullTable, "created_date", "Provider")).toHaveLength(1);
    expect(buildOrderBy(fullTable, "first_name")).toHaveLength(1);
    expect(buildOrderBy(noIdTable)).toHaveLength(1);
  });
});

describe("LARGE_ENTITIES_REMAP_CREATED set membership", () => {
  it("contains exactly the 10 documented large-table entity names", () => {
    expect(LARGE_ENTITIES_REMAP_CREATED.size).toBe(10);
  });

  it("does not contain common small-table entity names", () => {
    expect(LARGE_ENTITIES_REMAP_CREATED.has("User")).toBe(false);
    expect(LARGE_ENTITIES_REMAP_CREATED.has("LeadList")).toBe(false);
    expect(LARGE_ENTITIES_REMAP_CREATED.has("OutreachCampaign")).toBe(false);
  });
});
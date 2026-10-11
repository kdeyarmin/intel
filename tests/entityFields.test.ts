/**
 * The generic entity API used to drop unknown filter keys and write fields
 * silently (a filter on a misspelled column matched every row). These cover
 * the explicit handling in server/lib/entityFields.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  InvalidFieldValueError,
  InvalidFilterError,
  JSONB_OVERFLOW,
  UnknownFieldError,
  coerceRowValues,
  _resetReportedDropsForTests,
  buildWhereClause,
  decorateRow,
  expandOverflow,
  reportDroppedFields,
  sanitizeWriteData,
  splitWriteData,
} from "../server/lib/entityFields";
import { customReports, importBatches, leadListMembers, providerLocations, scheduledReports, tableMap } from "../server/db/schema";

const dialect = new PgDialect();
const render = (cond: any) => dialect.sqlToQuery(cond);
const cols = (table: any) => new Set(Object.keys(getTableColumns(table)));

describe("buildWhereClause", () => {
  it("rejects a field that isn't a column instead of matching every row", () => {
    expect(() => buildWhereClause(leadListMembers, { lead_list_id: 4 }, "LeadListMember"))
      .toThrow(UnknownFieldError);
    expect(() => buildWhereClause(leadListMembers, { lead_list_id: 4 }, "LeadListMember"))
      .toThrow("Unknown filter field 'lead_list_id' on LeadListMember");
  });

  it("rejects unknown fields nested in $or / $and", () => {
    expect(() => buildWhereClause(leadListMembers, { $or: [{ npi: "1" }, { nope: 1 }] }, "LeadListMember"))
      .toThrow(UnknownFieldError);
  });

  it("filters on real columns", () => {
    const q = render(buildWhereClause(leadListMembers, { list_id: 4, npi: { $in: ["1", "2"] } }, "LeadListMember"));
    expect(q.sql).toContain('"lead_list_members"."list_id" = $1');
    expect(q.sql).toContain('"lead_list_members"."npi" in ($2, $3)');
    expect(q.params).toEqual([4, "1", "2"]);
  });

  it("accepts camelCase keys for snake_case columns", () => {
    const q = render(buildWhereClause(leadListMembers, { listId: 7 }, "LeadListMember"));
    expect(q.sql).toContain('"list_id" = $1');
  });

  it("allows equality on settings-bag keys stored in the overflow jsonb column", () => {
    const q = render(buildWhereClause(scheduledReports, { is_active: true }, "ScheduledReport"));
    expect(q.sql).toBe('"scheduled_reports"."config"->>$1 = $2');
    expect(q.params).toEqual(["is_active", "true"]);
  });

  it("still rejects operator objects on overflow keys", () => {
    expect(() => buildWhereClause(scheduledReports, { frequency: { $in: ["daily"] } }, "ScheduledReport"))
      .toThrow(UnknownFieldError);
  });

  it("returns undefined for an empty filter", () => {
    expect(buildWhereClause(leadListMembers, {}, "LeadListMember")).toBeUndefined();
  });

  it("matches nothing for an empty $in or an empty $or", () => {
    expect(render(buildWhereClause(leadListMembers, { npi: { $in: [] } }, "LeadListMember")).sql).toBe("false");
    expect(render(buildWhereClause(leadListMembers, { $or: [] }, "LeadListMember")).sql).toBe("false");
  });

  it("treats an $or with a match-everything branch as matching everything", () => {
    expect(buildWhereClause(leadListMembers, { $or: [{}, { npi: "1" }] }, "LeadListMember")).toBeUndefined();
  });

  it("rejects malformed and unsupported operators instead of dropping them", () => {
    for (const bad of [{ $in: "1" }, { $nin: 1 }, { $typo: 1 }, {}, { $regex: "x" }]) {
      expect(() => buildWhereClause(leadListMembers, { npi: bad }, "LeadListMember"), JSON.stringify(bad))
        .toThrow(InvalidFilterError);
    }
  });
});

describe("splitWriteData", () => {
  it("drops and reports unknown keys for ordinary entities", () => {
    const out = splitWriteData("LeadListMember", cols(leadListMembers), { list_id: 1, npi: "1", lead_list_id: 1 });
    expect(out.data).toEqual({ list_id: 1, npi: "1" });
    expect(out.dropped).toEqual(["lead_list_id"]);
    expect(out.overflow).toBeNull();
  });

  it("keeps a settings-bag entity's extra keys in its jsonb column", () => {
    const out = splitWriteData("CustomReport", cols(customReports), {
      name: "Top HHAs",
      dataset: "home_health",
      metrics: ["count"],
      group_by: "state",
    });
    expect(out.data).toEqual({ name: "Top HHAs" });
    expect(out.overflow).toEqual({ dataset: "home_health", metrics: ["count"], group_by: "state" });
    expect(out.dropped).toEqual([]);
  });

  it("merges an explicit overflow-column value under the loose keys", () => {
    const out = splitWriteData("CustomReport", cols(customReports), {
      query_config: { dataset: "old", limit: 50 },
      dataset: "new",
    });
    expect(out.overflow).toEqual({ dataset: "new", limit: 50 });
  });

  it("every overflow column exists on its table", () => {
    for (const [entity, col] of Object.entries(JSONB_OVERFLOW)) {
      expect(cols((tableMap as any)[entity]).has(col), `${entity}.${col}`).toBe(true);
    }
  });
});

describe("reading rows", () => {
  it("spreads overflow keys onto the row without overriding real columns", () => {
    const row = { id: 1, name: "Real", query_config: { name: "shadow", dataset: "hha" } };
    expect(expandOverflow("CustomReport", row)).toMatchObject({ id: 1, name: "Real", dataset: "hha" });
  });

  it("derives is_primary for provider locations from the NPPES address purpose", () => {
    expect(decorateRow("ProviderLocation", { id: 1, location_type: "Practice" }).is_primary).toBe(true);
    expect(decorateRow("ProviderLocation", { id: 2, location_type: "Mailing" }).is_primary).toBe(false);
    expect(cols(providerLocations).has("is_primary")).toBe(false);
  });

  it("leaves other entities untouched", () => {
    const row = { id: 1, npi: "1" };
    expect(decorateRow("LeadListMember", row)).toBe(row);
  });
});

describe("reportDroppedFields", () => {
  beforeEach(() => _resetReportedDropsForTests());

  it("logs each entity/field pair once", () => {
    const log = vi.fn();
    reportDroppedFields("LeadList", ["filters"], log);
    reportDroppedFields("LeadList", ["filters", "other"], log);
    expect(log).toHaveBeenCalledTimes(2);
    expect(log.mock.calls[1][0]).toContain("other");
    expect(log.mock.calls[1][0]).not.toContain("filters");
  });
});

describe("timestamp coercion", () => {
  it("turns ISO strings into Dates for timestamp columns (drizzle needs Date objects)", () => {
    const out = coerceRowValues(importBatches, {
      status: "cancelled",
      cancelled_at: "2026-10-10T05:00:00.000Z",
      paused_at: "",
    });
    expect(out.cancelled_at).toBeInstanceOf(Date);
    expect((out.cancelled_at as Date).toISOString()).toBe("2026-10-10T05:00:00.000Z");
    expect(out.paused_at).toBeNull();
    expect(out.status).toBe("cancelled");
  });

  it("rejects unparseable dates with a 400-style error", () => {
    expect(() => coerceRowValues(importBatches, { cancelled_at: "yesterday-ish" })).toThrow(InvalidFieldValueError);
  });

  it("coerces date comparisons in filters", () => {
    const q = render(buildWhereClause(importBatches, { created_date: { $gte: "2026-01-01T00:00:00.000Z" } }, "ImportBatch"));
    expect(q.sql).toContain('"import_batches"."created_date" >= $1');
    expect(q.params[0]).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("sanitizeWriteData", () => {
  it("strips account roles and password hashes from ordinary entities", () => {
    expect(sanitizeWriteData("LeadList", { name: "x", role: "admin", password_hash: "h" })).toEqual({ name: "x" });
  });

  it("keeps ProviderAffiliation.role, which is a provider's role at an organization", () => {
    expect(sanitizeWriteData("ProviderAffiliation", { npi: "1", role: "Medical Director", password_hash: "h" }))
      .toEqual({ npi: "1", role: "Medical Director" });
  });
});

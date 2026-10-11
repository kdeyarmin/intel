/**
 * getLeadListMemberDetails: one row per requested NPI from each detail table,
 * so a provider with many rows can't crowd the others out of a shared limit.
 */
import { describe, it, expect } from "vitest";
import { getTableName } from "drizzle-orm";
import {
  MAX_MEMBER_DETAIL_NPIS,
  MEMBER_DETAIL_SOURCES,
  memberDetailIdsSql,
  normalizeMemberNpis,
} from "../server/functions/leadListDetails";

describe("normalizeMemberNpis", () => {
  it("keeps each NPI once, as a trimmed string", () => {
    expect(normalizeMemberNpis([" 1234567890", 1234567890, "", null, { npi: 1 }, "2222222222"]))
      .toEqual(["1234567890", "2222222222"]);
  });

  it("rejects a non-list and an oversized list with a 400", () => {
    expect(() => normalizeMemberNpis("1234567890")).toThrow(expect.objectContaining({ status: 400 }));
    const tooMany = Array.from({ length: MAX_MEMBER_DETAIL_NPIS + 1 }, (_, i) => String(i));
    expect(() => normalizeMemberNpis(tooMany)).toThrow(expect.objectContaining({ status: 400 }));
    expect(normalizeMemberNpis(tooMany.slice(1))).toHaveLength(MAX_MEMBER_DETAIL_NPIS);
  });
});

describe("member detail lookups", () => {
  it("covers every table the list dialog shows", () => {
    expect(MEMBER_DETAIL_SOURCES.map((s) => s.key)).toEqual(
      ["providers", "scores", "locations", "utilizations", "referrals", "taxonomies"],
    );
  });

  it("limits each NPI separately, through the npi column", () => {
    for (const source of MEMBER_DETAIL_SOURCES) {
      const sql = memberDetailIdsSql(getTableName(source.table), source.order).replace(/\s+/g, " ");
      expect(sql).toContain("FROM unnest($1::text[]) AS k(npi) CROSS JOIN LATERAL (");
      expect(sql).toContain(`FROM ${getTableName(source.table)} WHERE npi = k.npi ORDER BY ${source.order} LIMIT 1 )`);
    }
  });

  it("prefers the practice address and the primary taxonomy", () => {
    const order = Object.fromEntries(MEMBER_DETAIL_SOURCES.map((s) => [s.key, s.order]));
    expect(order.locations).toMatch(/^\(location_type = 'Practice'\) DESC NULLS LAST, id DESC$/);
    expect(order.taxonomies).toMatch(/^is_primary DESC NULLS LAST, id DESC$/);
  });
});

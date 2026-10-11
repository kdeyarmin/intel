/**
 * getFacilityDetail's row filter. It used sql`= ANY(${groupTypes})`, which
 * drizzle renders as `= ANY(($2, $3, …))` (a row, not an array), so Postgres
 * failed every grouped lookup and the detail page said "No facility data found".
 */
import { describe, it, expect, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

vi.mock("../server/db", () => ({ db: {}, pool: {} }));

import { facilityRowsWhere } from "../server/functions/facilityDetail";

const render = (where: ReturnType<typeof facilityRowsWhere>) => new PgDialect().sqlToQuery(where!.getSQL());

describe("facilityRowsWhere", () => {
  it("filters a group's facility types with IN, never ANY over a row", () => {
    const { sql, params } = render(facilityRowsWhere("010001", ["hospital_general_info", "hospital_enrollments"]));
    expect(sql).toContain('"medicare_facilities"."facility_type" in ($2, $3)');
    expect(sql).not.toMatch(/ANY\s*\(\s*\(/i);
    expect(params).toEqual(["010001", "hospital_general_info", "hospital_enrollments"]);
  });

  it("matches on the provider id alone without a group", () => {
    const { sql, params } = render(facilityRowsWhere("010001", null));
    expect(sql).toBe('"medicare_facilities"."provider_id" = $1');
    expect(params).toEqual(["010001"]);
  });
});

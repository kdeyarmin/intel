/**
 * CMS Order & Referring rows map to cms_order_referring (one row per NPI
 * with boolean eligibility flags), not to cms_referrals.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../server/db", () => ({ db: {}, pool: {} }));

import { mapCMSOrderReferringRow, rowDataYear } from "../server/functions/triggerImport";

describe("mapCMSOrderReferringRow", () => {
  it("maps the CMS columns to booleans and keeps the release date", () => {
    const row = { NPI: "1234567893", LAST_NAME: "SMITH", FIRST_NAME: "JANE", PARTB: "Y", DME: "N", HHA: "Y", PMD: "N", HOSPICE: "Y" };
    expect(mapCMSOrderReferringRow(row, 42, "2026-10-03")).toMatchObject({
      npi: "1234567893", last_name: "SMITH", first_name: "JANE",
      partb: true, dme: false, hha: true, pmd: false, hospice: true,
      as_of: "2026-10-03", import_batch_id: 42,
    });
  });

  it("drops rows without a 10-digit NPI and leaves unknown flags null", () => {
    expect(mapCMSOrderReferringRow({ NPI: "abc", PARTB: "Y" }, 1, null).npi).toBeNull();
    expect(mapCMSOrderReferringRow({ npi: "1234567893" }, 1, null)).toMatchObject({ partb: null, dme: null, hha: null, pmd: null, hospice: null, as_of: null });
  });
});

describe("rowDataYear", () => {
  it("prefers the row's own year column, then the resolved year", () => {
    expect(rowDataYear({ YEAR: "2024", ZIP: "15213" }, 2022)).toBe("2024");
    expect(rowDataYear({ Rpt_Year: 2023 }, 2022)).toBe("2023");
    expect(rowDataYear({ fiscal_year: "2024-01-01" }, null)).toBe("2024");
    expect(rowDataYear({ ZIP: "15213" }, 2025)).toBe("2025");
    expect(rowDataYear({}, null)).toBeNull();
    expect(rowDataYear({ YEAR: "n/a" }, "")).toBeNull();
  });
});

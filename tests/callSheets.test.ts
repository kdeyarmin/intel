import { describe, expect, it } from "vitest";
import { filterAccounts, newAccounts, sortAccounts } from "../src/lib/callSheet.js";
import { handleGetMarketRoster, rosterStatements } from "../server/functions/callSheets";

describe("call sheet accounts", () => {
  const rows = [
    { account_type: "hha", account_key: "1", name: "Beta", status: "account", next_date: null },
    { account_type: "clinician", account_key: "2", name: "Ann", status: "call", next_date: "2026-11-02" },
    { account_type: "hha", account_key: "3", name: "Ada", status: "new", next_date: "2026-10-01" },
  ];

  it("skips accounts already on the sheet", () => {
    const fresh = newAccounts(rows, [
      { account_type: "hha", account_key: "1", name: "Beta" },
      { account_type: "snf", account_key: "9", name: "Kane" },
      { account_type: "snf", account_key: "9", name: "Kane again" },
      { account_type: "hha", account_key: "" },
    ]);
    expect(fresh.map((r) => r.name)).toEqual(["Kane"]);
  });

  it("splits the schedule from the chart of accounts without dropping notes", () => {
    expect(filterAccounts(rows, "schedule").map((r) => r.name)).toEqual(["Ann", "Ada"]);
    expect(filterAccounts(rows, "accounts").map((r) => r.name)).toEqual(["Beta"]);
    expect(sortAccounts(filterAccounts(rows, "schedule"), "schedule").map((r) => r.name)).toEqual(["Ada", "Ann"]);
  });
});

describe("market roster", () => {
  it("asks for a county's clinicians with a phone when one is on file", () => {
    const sql = rosterStatements("clinician");
    expect(sql.count).toMatch(/rollup_referral_sources WHERE county_fips = \$1/);
    expect(sql.page).toMatch(/provider_locations/);
    expect(sql.page).toMatch(/phone/);
  });

  it("ranks post-acute providers located in the county", () => {
    expect(rosterStatements("hha").page).toMatch(/geo_level = 'county'/);
    expect(rosterStatements("licensed").page).toMatch(/licensed_facilities WHERE county_fips = \$1/);
  });

  it("rejects a kind that is not a roster", async () => {
    await expect(handleGetMarketRoster({ state: "PA", kind: "payer" })).rejects.toMatchObject({ status: 400 });
    await expect(handleGetMarketRoster({})).rejects.toMatchObject({ status: 400 });
  });
});

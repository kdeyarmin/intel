import { describe, expect, it } from "vitest";
import { countyGrowthRows, growthFacts, leaderFacts, median, REPORT_CATALOG } from "../src/lib/marketBriefs.js";

const counties = [
  {
    fips: "42003", name: "Allegheny County",
    values: { benes: 200000, ma_penetration: 0.55, hha_users_pct: 9.1, hha_providers: 80, hha_agencies: 30, std_per_capita_hha: 400, living_alone_65_plus: 50000, benes_85_plus: 20000 },
    volume: { hha_users: 12000, hha_users_change_pct: 2, hha_providers_change_pct: 4 },
  },
  {
    fips: "42019", name: "Butler County",
    values: { benes: 40000, ma_penetration: 0.4, hha_users_pct: 11, hha_providers: 4, hha_agencies: 2, std_per_capita_hha: 520, living_alone_65_plus: 4000, benes_85_plus: 1800 },
    volume: { hha_users: 2000, hha_users_change_pct: 8, hha_providers_change_pct: 0 },
  },
  {
    fips: "42001", name: "Tiny County",
    values: { benes: 3000, hha_users_pct: 20, hha_providers: 1, hha_agencies: 1 },
    volume: { hha_users: 40, hha_users_change_pct: 50, hha_providers_change_pct: -100 },
  },
  {
    fips: "42005", name: "Blank County",
    values: { benes: 1000 },
    volume: {},
  },
];

describe("county growth rows", () => {
  it("ranks by published users and only flags demand that outpaced billing providers", () => {
    const rows = countyGrowthRows(counties, "hha");
    expect(rows.find((r) => r.fips === "42019")).toMatchObject({
      users: 2000, billing: 4, usersPerProvider: 500, demandOutpacedSupply: true,
    });

    expect(rows.find((r) => r.fips === "42003")!.demandOutpacedSupply).toBe(false);
    expect(rows.find((r) => r.fips === "42001")!.usersPerProvider).toBe(40);
    expect(rows.find((r) => r.fips === "42005")!.users).toBeNull();

    const facts = growthFacts(rows);
    expect(facts.top!.name).toBe("Allegheny County");
    expect(facts.countiesWithUsers).toBe(3);
    expect(facts.medianUsers).toBe(2000);
    // Tiny County is under the median, so its one agency does not win "busiest."
    expect(facts.busiest!.name).toBe("Butler County");
    expect(facts.rising.map((r) => r.name)).toEqual(["Tiny County", "Butler County"]);
  });

  it("median of an even list is the average of the two middle values", () => {
    expect(median([1, 100, null, 3])).toBe(3);
    expect(median([10, 30])).toBe(20);
    expect(median([])).toBeNull();
  });
});

describe("named reports", () => {
  it("gives each decision its own report and does not invent a score", () => {
    const ids = REPORT_CATALOG.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(REPORT_CATALOG.filter((r) => r.purpose === "Expansion").map((r) => r.setting)).toEqual(["hha", "hospice", "snf"]);
    expect(REPORT_CATALOG.filter((r) => r.purpose === "Acquisition").map((r) => r.audience)).toEqual(["Home health", "Hospice", "Nursing homes"]);
    expect(REPORT_CATALOG.find((r) => r.id === "hospital-partners")!.needs).toBe("county");
    const facts = leaderFacts([{ share: 0.2, name: "A" }, { share: 0.1, name: "B" }, { share: null, name: "C" }]);
    expect(facts.top!.name).toBe("A");
    expect(facts.listedShare).toBeCloseTo(0.3);
    expect(facts.listed).toBe(3);
  });

  describe("report catalog copy", () => {
    it("uses concise, audience-appropriate report titles and descriptions", () => {
      expect(REPORT_CATALOG.every((report) => report.title.trim() && report.reason.trim())).toBe(true);
      expect(REPORT_CATALOG.find((report) => report.id === "calls-hha")?.title).toBe("Home health outreach prospects");
      expect(REPORT_CATALOG.find((report) => report.id === "calls-hospice")?.title).toBe("Hospice outreach prospects");
      expect(REPORT_CATALOG.some((report) => /to call/i.test(report.title))).toBe(false);
    });
  });
});

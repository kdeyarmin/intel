/** The dashboard's Data Quality tile shows the latest completed scan's overall score, not a ratio that is ~100% for any data. */
import { beforeEach, describe, expect, it, vi } from "vitest";

let scanRows: any[] = [];
const sqls: string[] = [];

vi.mock("../server/db", () => {
  const client = {
    async query(sql: string) {
      sqls.push(sql);
      if (/^SET |^RESET /.test(sql)) return { rows: [] };
      if (sql.includes("FROM pg_class")) return { rows: [{ providers: 1000, locations: 2000, referrals: 0, utilization: 0, taxonomies: 0, facilities: 0 }] };
      if (sql.includes("FROM data_quality_scans")) return { rows: scanRows };
      return { rows: [] };
    },
    release() {},
  };
  return { pool: { connect: async () => client, query: client.query }, db: {} };
});

async function stats() {
  vi.resetModules();
  const { getDashboardStats } = await import("../server/lib/dashboardStats");
  return getDashboardStats();
}

beforeEach(() => {
  scanRows = [];
  sqls.length = 0;
});

describe("getDashboardStats dataQuality", () => {
  it("is the scan's overall score, whatever the record and issue counts are", async () => {
    // total_records in the millions with a dozen issues would have read as ~100%.
    scanRows = [{ results_summary: { scores: { completeness: 71, accuracy: 96, timeliness: 40, consistency: 100, overall: 77.6 }, rule_results: [] }, total_records: 24_000_000, issues_found: 13 }];
    expect((await stats()).dataQuality).toEqual({ score: 78 });
  });

  it("asks only for a scan that finished", async () => {
    await stats();
    expect(sqls.find((s) => s.includes("FROM data_quality_scans"))).toMatch(/WHERE status = 'completed'/);
  });

  it("is null, shown as \"No scan\", when no scan has finished or its results have no score", async () => {
    expect((await stats()).dataQuality).toBeNull();
    scanRows = [{ results_summary: null }];
    expect((await stats()).dataQuality).toBeNull();
    scanRows = [{ results_summary: { summary: "Scan complete." } }];
    expect((await stats()).dataQuality).toBeNull();
  });
});

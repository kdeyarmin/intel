import { describe, expect, it, vi } from "vitest";
import {
  ALL_SERVICE_TYPES,
  cmsServiceTypes,
  cmsTopReferred,
  facilityTypes,
  memoryStaging,
  parseMoney,
  planChunks,
  zipLocationCounts,
} from "../server/lib/rollups/core";
import { dueJobs, jobByName, ROLLUP_JOBS, runRollupJob, setDrainRetryMs, startDueRollups, waitForRollups } from "../server/lib/rollups/runner";
import { AGGREGATE_DATASETS, clearCmsAnalyticsCache, handleGetCMSAnalytics } from "../server/functions/cmsAnalytics";
import { FANOUT_WORKERS } from "../server/lib/maintenance";

describe("parseMoney", () => {
  it("reads money and counts stored as text", () => {
    expect(parseMoney("$1,234.56")).toBe(1234.56);
    expect(parseMoney(" 42 ")).toBe(42);
    expect(parseMoney(17)).toBe(17);
    expect(parseMoney("-3.5")).toBe(-3.5);
    for (const bad of [null, undefined, "", "N/A", "12abc", "1.2.3", NaN]) expect(parseMoney(bad), String(bad)).toBeNull();
  });
});

describe("planChunks", () => {
  it("covers min..max in [lo, hi) ranges", () => {
    expect(planChunks(1, 25, 10)).toEqual([{ lo: 1, hi: 11 }, { lo: 11, hi: 21 }, { lo: 21, hi: 26 }]);
    expect(planChunks(5, 5, 10)).toEqual([{ lo: 5, hi: 6 }]);
    expect(planChunks(null, null, 10)).toEqual([]);
  });
});

describe("accumulators", () => {
  it("counts practice and all locations per ZIP5", () => {
    const acc = zipLocationCounts();
    acc.add([
      { zip: "15213-1234", location_type: "Practice" },
      { zip: "152131234", location_type: "Mailing" },
      { zip: "15213", location_type: "Practice" },
      { zip: "ABCDE", location_type: "Practice" },
      { zip: null, location_type: "Practice" },
    ]);
    expect(acc.results()).toEqual([{ zip5: "15213", practice_locations: 2, all_locations: 3 }]);
    expect(acc.skipped()).toBe(2);
  });

  it("sums utilization per year and service type, counting each provider once", async () => {
    const acc = cmsServiceTypes();
    acc.add([
      { npi: "1000000001", service_type: "Cardiology", data_year: "2023", total_services: "10", total_unique_benes: "5", total_medicare_payment_amt: "$1,000.00", average_medicare_payment_amt: null },
      { npi: "1000000001", service_type: "Cardiology", data_year: "2023", total_services: "4", total_unique_benes: "2", total_medicare_payment_amt: null, average_medicare_payment_amt: "25.5" },
      { npi: "1000000002", service_type: "Cardiology", data_year: "2023", total_services: "x", total_unique_benes: "1", total_medicare_payment_amt: "oops", average_medicare_payment_amt: null },
      { npi: "1000000002", service_type: "Cardiology", data_year: "2022", total_services: "1", total_unique_benes: "1", total_medicare_payment_amt: "1", average_medicare_payment_amt: null },
      { npi: "1000000003", service_type: "", data_year: "2023", total_services: "1", total_unique_benes: "1", total_medicare_payment_amt: "1", average_medicare_payment_amt: null },
    ]);
    const results = await acc.results();
    const r = results.find((x) => x.data_year === "2023" && x.service_type === "Cardiology")!;
    // 1000 + 25.5 × 4; the unparseable payment adds nothing.
    expect(r).toEqual({ data_year: "2023", service_type: "Cardiology", provider_count: 2, total_services: 14, total_payments: 1102, total_beneficiaries: 8 });
    // Two service types per year plus one all-types row per year.
    expect(results.filter((x) => x.service_type !== ALL_SERVICE_TYPES)).toHaveLength(2);
    expect(results.filter((x) => x.service_type === ALL_SERVICE_TYPES).map((x) => x.data_year).sort()).toEqual(["2022", "2023"]);
    expect(acc.skipped()).toBe(2);
  });

  it("counts a provider once per year across service types", async () => {
    const acc = cmsServiceTypes();
    acc.add([
      { npi: "1000000001", service_type: "Cardiology", data_year: "2023", total_services: "1", total_unique_benes: "1", total_medicare_payment_amt: "10", average_medicare_payment_amt: null },
      { npi: "1000000001", service_type: "Imaging", data_year: "2023", total_services: "2", total_unique_benes: "1", total_medicare_payment_amt: "20", average_medicare_payment_amt: null },
      { npi: "1000000002", service_type: "Imaging", data_year: "2023", total_services: "3", total_unique_benes: "1", total_medicare_payment_amt: "30", average_medicare_payment_amt: null },
    ]);
    const results = await acc.results();
    const perType = results.filter((x) => x.service_type !== ALL_SERVICE_TYPES).reduce((n, x) => n + x.provider_count, 0);
    const all = results.find((x) => x.service_type === ALL_SERVICE_TYPES)!;
    expect(perType).toBe(3); // what summing the types would report
    expect(all).toMatchObject({ provider_count: 2, total_services: 6, total_payments: 60 });
  });

  it("keeps the most-referred-to providers per year", async () => {
    const acc = cmsTopReferred(2);
    acc.add([
      { npi: "1", referred_to_npi: "2000000001", total_referrals: 50, data_year: "2023" },
      { npi: "3", referred_to_npi: "2000000001", total_referrals: "25", data_year: "2023" },
      { npi: "1", referred_to_npi: "2000000002", total_referrals: 70, data_year: "2023" },
      { npi: "1", referred_to_npi: "2000000003", total_referrals: 1, data_year: "2023" },
      { npi: "1", referred_to_npi: null, total_referrals: 999, data_year: "2023" },
      { npi: "1", referred_to_npi: "2000000003", total_referrals: 5, data_year: "2022" },
    ]);
    expect((await acc.results()).filter((r) => r.data_year === "2023")).toEqual([
      { data_year: "2023", referred_to_npi: "2000000001", total_referrals: 75, referring_providers: 2 },
      { data_year: "2023", referred_to_npi: "2000000002", total_referrals: 70, referring_providers: 1 },
    ]);
    expect(acc.skipped()).toBe(1);
  });

  it("keeps only one chunk in memory: totals across chunks come from staging", async () => {
    const staging = memoryStaging();
    const spy = vi.spyOn(staging, "addDistinct");
    const acc = cmsServiceTypes(staging);
    const row = (npi: string) => ({ npi, service_type: "Cardiology", data_year: "2023", total_services: "1", total_unique_benes: "1", total_medicare_payment_amt: "1", average_medicare_payment_amt: null });
    acc.add([row("1000000001"), row("1000000002")]);
    await acc.flush!();
    acc.add([row("1000000002"), row("1000000003")]);
    await acc.flush!();
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[1][0]).toEqual([
      ["2023|Cardiology", 1000000002], ["2023|Cardiology", 1000000003],
      [`2023|${ALL_SERVICE_TYPES}`, 1000000002], [`2023|${ALL_SERVICE_TYPES}`, 1000000003],
    ]);
    expect((await acc.results())[0]).toMatchObject({ provider_count: 3, total_services: 4 });

    const top = cmsTopReferred(1, memoryStaging());
    top.add([{ npi: "1", referred_to_npi: "2000000001", total_referrals: 5, data_year: "2023" }]);
    await top.flush!();
    top.add([{ npi: "2", referred_to_npi: "2000000001", total_referrals: 5, data_year: "2023" }, { npi: "3", referred_to_npi: "2000000002", total_referrals: 8, data_year: "2023" }]);
    expect(await top.results()).toEqual([{ data_year: "2023", referred_to_npi: "2000000001", total_referrals: 10, referring_providers: 2 }]);
  });

  it("counts facility records, states and the latest year per dataset", () => {
    const acc = facilityTypes();
    acc.add([
      { facility_type: "hospital_general_info", state: "pa", data_year: "2022" },
      { facility_type: "hospital_general_info", state: "PA", data_year: "2023" },
      { facility_type: "hospital_general_info", state: "OH", data_year: null },
      { facility_type: "", state: "OH", data_year: "2023" },
    ]);
    expect(acc.results()).toEqual([{ facility_type: "hospital_general_info", record_count: 3, state_count: 2, latest_year: "2023" }]);
  });
});

describe("dueJobs", () => {
  const now = Date.parse("2026-10-10T12:00:00Z");
  const ago = (h: number) => new Date(now - h * 3600_000);

  it("runs jobs that never ran or are older than their interval, skipping live runs", () => {
    const due = dueJobs([
      { job: "geo_zip_location_counts", status: "success", started_at: ago(2), last_success_at: ago(2) },
      { job: "cms_service_types", status: "success", started_at: ago(30), last_success_at: ago(30) },
      { job: "cms_top_referred", status: "running", started_at: ago(1), last_success_at: null },
    ], now).map((j) => j.name);
    expect(due).toEqual(["cms_service_types", "facility_types"]);
  });

  it("treats a run that has been 'running' for hours as dead", () => {
    const due = dueJobs([{ job: "facility_types", status: "running", started_at: ago(5), last_success_at: null }], now, [jobByName("facility_types")!]);
    expect(due.map((j) => j.name)).toEqual(["facility_types"]);
  });
});

function fakeDb(sourceRows: any[], opts: { failOn?: RegExp } = {}) {
  const statements: Array<{ sql: string; params: any[] }> = [];
  const client = {
    async query(sql: string, params: any[] = []) {
      statements.push({ sql, params });
      if (opts.failOn?.test(sql)) throw new Error("boom");
      if (sql.startsWith("SELECT pg_try_advisory_lock")) return { rows: [{ ok: true }] };
      if (sql.startsWith("SELECT min(id)")) return { rows: [{ lo: sourceRows.length ? 1 : null, hi: sourceRows.length || null }] };
      if (/^SELECT .* WHERE id >= \$1 AND id < \$2/.test(sql)) return { rows: sourceRows.slice(params[0] - 1, params[1] - 1) };
      if (sql.startsWith("SELECT job, status")) return { rows: [] };
      return { rows: [] };
    },
    release() {},
  };
  return { statements, pool: { connect: async () => client, query: client.query } };
}

describe("runRollupJob", () => {
  it("scans in id ranges under a timeout and swaps the result table in one transaction", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ zip: `1521${i}`, location_type: "Practice" }));
    const { pool, statements } = fakeDb(rows);
    const r = await runRollupJob(pool, jobByName("geo_zip_location_counts")!, { log() {}, warn() {} });
    expect(r).toMatchObject({ status: "success", rows_scanned: 5, result_rows: 5 });
    const sqls = statements.map((s) => s.sql);
    expect(sqls).toContain("SET statement_timeout = '30s'");
    expect(sqls.some((s) => s.startsWith("SELECT zip, location_type FROM provider_locations WHERE id >= $1 AND id < $2"))).toBe(true);
    const begin = sqls.indexOf("BEGIN");
    expect(sqls.slice(begin, begin + 3)).toEqual(["BEGIN", "DELETE FROM rollup_zip_locations", expect.stringMatching(/^INSERT INTO rollup_zip_locations/)]);
    expect(sqls.indexOf("COMMIT")).toBeGreaterThan(sqls.findIndex((s) => s.includes("status = 'success'")));
    expect(sqls.at(-1)).toMatch(/pg_advisory_unlock/);
  });

  it("rolls back, records the failure and keeps the previous results", async () => {
    const { pool, statements } = fakeDb([{ zip: "15213", location_type: "Practice" }], { failOn: /^INSERT INTO rollup_zip_locations/ });
    const r = await runRollupJob(pool, jobByName("geo_zip_location_counts")!, { log() {}, warn() {} });
    expect(r).toMatchObject({ status: "failed", error: "boom" });
    const sqls = statements.map((s) => s.sql);
    expect(sqls).toContain("ROLLBACK");
    expect(sqls.some((s) => s.includes("status = 'failed'"))).toBe(true);
    expect(sqls).not.toContain("COMMIT");
  });
});

describe("startDueRollups", () => {
  it("queues due jobs, runs them one at a time, and doesn't queue a job twice", async () => {
    const { pool, statements } = fakeDb([]);
    const first = await startDueRollups(pool);
    const second = await startDueRollups(pool);
    expect(first.started).toEqual(ROLLUP_JOBS.map((j) => j.name));
    expect(second.started).toEqual([]);
    expect(second.running).toEqual(ROLLUP_JOBS.map((j) => j.name));
    await waitForRollups();
    // One drain lock around the queue; inside it each job's lock is released
    // before the next one's is taken.
    const locks = statements.filter((s) => /advisory_(un)?lock/.test(s.sql)).map((s) => (s.sql.includes("unlock") ? "unlock" : "lock"));
    expect(locks).toEqual(["lock", ...ROLLUP_JOBS.flatMap(() => ["lock", "unlock"]), "unlock"]);
  });

  it("waits for another instance's drain, then skips jobs that ran meanwhile", async () => {
    setDrainRetryMs(5);
    let busy = true;
    const ran: string[] = [];
    const client = {
      async query(sql: string, params: any[] = []) {
        if (sql.startsWith("SELECT pg_try_advisory_lock")) {
          // The first call is the drain lock: busy once, then free.
          if (busy) { busy = false; return { rows: [{ ok: false }] }; }
          return { rows: [{ ok: true }] };
        }
        if (sql.startsWith("SELECT job, status, started_at, last_success_at FROM rollup_runs WHERE job")) {
          // The other instance finished everything but the first job meanwhile.
          return { rows: params[0] === ROLLUP_JOBS[0].name ? [] : [{ job: params[0], status: "success", last_success_at: new Date() }] };
        }
        if (sql.startsWith("SELECT min(id)")) { ran.push("scan"); return { rows: [{ lo: null, hi: null }] }; }
        return { rows: [] };
      },
      release() {},
    };
    const pool = { connect: async () => client, query: client.query };
    await startDueRollups(pool, { force: false });
    await waitForRollups();
    expect(ran).toHaveLength(1);
    setDrainRetryMs(30_000);
  });

  it("keeps draining when a connection can't be had", async () => {
    let calls = 0;
    const client = { async query(sql: string) { return sql.startsWith("SELECT pg_try") ? { rows: [{ ok: true }] } : { rows: [] }; }, release() {} };
    const pool = {
      connect: async () => { calls += 1; if (calls === 2) throw new Error("pool exhausted"); return client; },
      query: client.query,
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await runRollupJob({ connect: async () => { throw new Error("pool exhausted"); } }, ROLLUP_JOBS[0], { log() {}, warn() {} });
    expect(r).toMatchObject({ status: "failed", error: expect.stringMatching(/pool exhausted/) });
    const out = await startDueRollups(pool);
    await waitForRollups();
    expect(out.started).toHaveLength(ROLLUP_JOBS.length);
    // Every job left the queue, so the next tick can queue them again.
    expect((await startDueRollups(pool)).started).toHaveLength(ROLLUP_JOBS.length);
    await waitForRollups();
    warn.mockRestore();
  });

  it("is part of the maintenance fan-out", () => {
    expect(FANOUT_WORKERS.map((w) => w.name)).toContain("refreshRollups");
  });
});

describe("getCMSAnalytics from rollups", () => {
  it("reads the latest year, splits aggregate datasets out, names referral targets and reports freshness", async () => {
    clearCmsAnalyticsCache();
    const answers: Array<[RegExp, any[]]> = [
      [/FROM rollup_runs/, [{ job: "cms_service_types", status: "success", last_success_at: "2026-10-10T10:00:00Z" }]],
      [/FROM pg_class/, [{ relname: "cms_referrals", est: "1000" }, { relname: "medicare_facilities", est: "-1" }]],
      [/max\(data_year\) AS year FROM rollup_cms_service_types/, [{ year: "2023" }]],
      [/max\(data_year\) AS year FROM rollup_cms_top_referred/, [{ year: null }]],
      [/FROM rollup_facility_types/, [
        { facility_type: "hospital_general_info", record_count: "6", state_count: 3, latest_year: "2023" },
        { facility_type: AGGREGATE_DATASETS[0], record_count: "9", state_count: 50, latest_year: "2024" },
      ]],
      [/SELECT service_type, provider_count/, [{ service_type: "Cardiology", provider_count: 2, total_services: 14, total_payments: 1102, total_beneficiaries: 8 }]],
      [/SELECT count\(\*\) FILTER \(WHERE service_type <> \$2\)::int AS types/, [{ types: 1, providers: "2", payments: 1102, services: 14 }]],
    ];
    const queries: string[] = [];
    const pool = {
      async query(sql: string) {
        queries.push(sql);
        return { rows: answers.find(([re]) => re.test(sql))?.[1] ?? [] };
      },
    };
    const body = await handleGetCMSAnalytics(pool);
    expect(body.utilization).toMatchObject({ data_year: "2023", rollup: { status: "success", refreshed_at: "2026-10-10T10:00:00Z" } });
    expect(body.utilization.summary).toEqual({ unique_service_types: 1, unique_providers: 2, total_payments: 1102, total_services: 14 });
    expect(body.referrals).toMatchObject({ data_year: null, topReferred: [], totalRecords: 1000, rollup: { status: "never_run", refreshed_at: null } });
    expect(body.facilities.byType).toEqual([{ type: "hospital_general_info", count: 6 }]);
    expect(body.aggregateDatasets).toEqual([{ facility_type: AGGREGATE_DATASETS[0], record_count: 9, state_count: 50, latest_year: "2024" }]);
    expect(body.tableCounts.medicare_facilities).toBe(0);
    // Never touches the big tables directly.
    expect(queries.some((q) => /FROM (medicare_facilities|cms_referrals|provider_service_utilization)\b/.test(q))).toBe(false);
  });

  it("serves the cache until a rollup's state changes", async () => {
    clearCmsAnalyticsCache();
    let version = "cms_service_types:success:2026-10-10";
    let built = 0;
    const pool = {
      async query(sql: string) {
        if (sql.includes("AS v FROM rollup_runs")) return { rows: [{ v: version }] };
        if (sql.includes("FROM rollup_facility_types")) built += 1;
        return { rows: [] };
      },
    };
    await handleGetCMSAnalytics(pool);
    await handleGetCMSAnalytics(pool);
    expect(built).toBe(1);
    version = "cms_service_types:success:2026-10-11";
    await handleGetCMSAnalytics(pool);
    expect(built).toBe(2);
  });
});

describe("refreshRollups", () => {
  it("refuses unknown job names instead of running every job", async () => {
    const { handleRefreshRollups } = await import("../server/functions/rollups");
    await expect(handleRefreshRollups({ jobs: ["typo"] })).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/typo/) });
    await expect(handleRefreshRollups({ jobs: [] })).rejects.toMatchObject({ status: 400 });
  });
});

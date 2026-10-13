// Operations alerts: datasets behind a newer release, failing schedules, a
// stale heartbeat and stale rollups, evaluated from a snapshot of the tables
// the maintenance workers keep; and the emailed digest.
import { describe, expect, it } from "vitest";
import { DEFAULT_THRESHOLDS, evaluateOperationsAlerts, formatAlertDigest, loadOperationsSnapshot, type OperationsSnapshot } from "../server/lib/operationsAlerts";
import { FANOUT_WORKERS } from "../server/lib/maintenance";

const now = new Date("2026-10-11T12:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
const hoursAgo = (n: number) => new Date(now.getTime() - n * 60 * 60 * 1000);

const healthy: OperationsSnapshot = {
  datasets: [
    { import_type: "hospital_service_area", source_title: "Hospital Service Area", status: "current", catalog_modified: daysAgo(30), imported_modified: daysAgo(30), imported_at: daysAgo(29) },
    { import_type: "market_saturation_county", source_title: "Market Saturation", status: "update_available", catalog_modified: daysAgo(2), imported_modified: daysAgo(200), imported_at: daysAgo(199) },
    { import_type: "pbj_daily", source_title: "PBJ", status: "never_imported", catalog_modified: daysAgo(90), imported_modified: null, imported_at: null },
  ],
  schedules: [
    { id: 1, label: "Weekly NPPES", import_type: "nppes_weekly_incremental", is_active: true, last_run_status: "success", last_run_at: daysAgo(1), consecutive_failures: 0, last_run_summary: null },
    { id: 2, label: "Old thing", import_type: "x", is_active: false, last_run_status: "failed", last_run_at: daysAgo(1), consecutive_failures: 9, last_run_summary: "boom" },
  ],
  heartbeat: { at: hoursAgo(0.2), failed: [] },
  rollups: [
    { job: "county_market_profile", status: "idle", last_success_at: hoursAgo(20), error: null },
    { job: "new_job", status: "idle", last_success_at: null, error: null },
  ],
};

describe("evaluateOperationsAlerts", () => {
  it("is quiet for a healthy pipeline (a release two days old is still within the grace period)", () => {
    expect(evaluateOperationsAlerts(healthy, now)).toEqual([]);
  });

  it("flags a newer release not imported within a week, critical after a month", () => {
    const snap: OperationsSnapshot = {
      ...healthy,
      datasets: [
        { import_type: "a", source_title: "Dataset A", status: "update_available", catalog_modified: daysAgo(8), imported_modified: daysAgo(400), imported_at: daysAgo(399) },
        { import_type: "b", source_title: null, status: "current", catalog_modified: daysAgo(40), imported_modified: daysAgo(400), imported_at: daysAgo(399) },
        { import_type: "c", source_title: "Importing now", status: "importing", catalog_modified: daysAgo(40), imported_modified: daysAgo(400), imported_at: null },
      ],
    };
    const alerts = evaluateOperationsAlerts(snap, now);
    expect(alerts.map((a) => [a.key, a.severity])).toEqual([["dataset_behind:b", "critical"], ["dataset_behind:a", "warning"]]);
    expect(alerts[1].subject).toBe("Dataset A");
    expect(alerts[1].message).toMatch(/8 days ago/);
    expect(alerts[1].message).toMatch(/loaded version is from/);
  });

  it("flags a dataset left 'importing' whose import is gone or has stopped moving, not one that is running", () => {
    const row = (over: object) => ({ import_type: "x", source_title: "Dataset X", status: "importing", catalog_modified: daysAgo(1), imported_modified: null, imported_at: null, updated_date: hoursAgo(10), batch_status: "failed", batch_updated: hoursAgo(9), ...over });
    const alerts = (datasets: object[]) => evaluateOperationsAlerts({ ...healthy, datasets: datasets as any }, now);
    // The batch ended (failed, cancelled, completed) or can't be found: nothing will ever mark the dataset finished.
    expect(alerts([row({})])).toMatchObject([{ kind: "dataset_stuck", key: "dataset_stuck:x", severity: "warning", subject: "Dataset X" }]);
    expect(alerts([row({ batch_status: "cancelled" })])).toHaveLength(1);
    expect(alerts([row({ batch_status: null, batch_updated: null })])[0].message).toMatch(/can't be found/);
    // Still working, or only just started: not stuck.
    expect(alerts([row({ batch_status: "processing", batch_updated: hoursAgo(0.2) })])).toEqual([]);
    expect(alerts([row({ updated_date: hoursAgo(2), batch_status: "failed" })])).toEqual([]);
    // 'Processing' but silent for longer than the threshold is stuck too.
    const silent = alerts([row({ batch_status: "processing", batch_updated: hoursAgo(9) })]);
    expect(silent).toHaveLength(1);
    expect(silent[0].message).toMatch(/is processing and has made no progress/);
    // A day on, it is critical; and rows without a timestamp (unknown age) are left alone.
    expect(alerts([row({ updated_date: hoursAgo(30) })])[0].severity).toBe("critical");
    expect(alerts([row({ updated_date: null })])).toEqual([]);
    // A dataset that isn't importing never raises it.
    expect(alerts([row({ status: "failed" })])).toEqual([]);
  });

  it("flags active schedules with repeated failures only", () => {
    const snap: OperationsSnapshot = {
      ...healthy,
      schedules: [
        { id: 3, label: "Hospice zips", import_type: "hospice_zip_data", is_active: true, last_run_status: "failed", last_run_at: daysAgo(1), consecutive_failures: 3, last_run_summary: "HTTP 503 from data.cms.gov" },
        { id: 4, label: "Once", import_type: "x", is_active: true, last_run_status: "failed", last_run_at: daysAgo(1), consecutive_failures: 1, last_run_summary: null },
        { id: 5, label: "Chronic", import_type: "y", is_active: true, last_run_status: "failed", last_run_at: daysAgo(6), consecutive_failures: 6, last_run_summary: null },
      ],
    };
    const alerts = evaluateOperationsAlerts(snap, now);
    expect(alerts.map((a) => [a.key, a.severity])).toEqual([["schedule_failing:5", "critical"], ["schedule_failing:3", "warning"]]);
    expect(alerts[1].message).toContain("3 consecutive failed runs; last: HTTP 503");
    expect(alerts[1].since).toBe(daysAgo(1).toISOString());
  });

  it("flags a missing, stale or partly failed heartbeat", () => {
    expect(evaluateOperationsAlerts({ ...healthy, heartbeat: null }, now)).toMatchObject([{ key: "heartbeat_stale", severity: "critical" }]);
    expect(evaluateOperationsAlerts({ ...healthy, heartbeat: { at: hoursAgo(3), failed: [] } }, now)).toMatchObject([{ key: "heartbeat_stale", severity: "warning" }]);
    expect(evaluateOperationsAlerts({ ...healthy, heartbeat: { at: hoursAgo(30), failed: [] } }, now)).toMatchObject([{ key: "heartbeat_stale", severity: "critical" }]);
    const failed = evaluateOperationsAlerts({ ...healthy, heartbeat: { at: hoursAgo(0.5), failed: ["refreshRollups"] } }, now);
    expect(failed).toMatchObject([{ key: "heartbeat_failed_workers", severity: "warning" }]);
    expect(failed[0].message).toContain("refreshRollups");
    // A custom threshold moves the line.
    expect(evaluateOperationsAlerts({ ...healthy, heartbeat: { at: hoursAgo(3), failed: [] } }, now, { ...DEFAULT_THRESHOLDS, heartbeatStaleMs: 4 * 3_600_000 })).toEqual([]);
  });

  it("flags rollups older than two days or that never succeeded and failed, not ones running or new", () => {
    const snap: OperationsSnapshot = {
      ...healthy,
      rollups: [
        { job: "stale", status: "idle", last_success_at: daysAgo(3), error: null },
        { job: "broken", status: "failed", last_success_at: null, error: "statement timeout" },
        { job: "running", status: "running", last_success_at: daysAgo(5), error: null },
        { job: "fresh", status: "idle", last_success_at: hoursAgo(1), error: null },
      ],
    };
    const alerts = evaluateOperationsAlerts(snap, now);
    expect(alerts.map((a) => a.key).sort()).toEqual(["rollup_stale:broken", "rollup_stale:stale"]);
    expect(alerts.find((a) => a.key === "rollup_stale:broken")!.message).toContain("Never succeeded: statement timeout");
    expect(alerts.find((a) => a.key === "rollup_stale:stale")!.message).toContain("3 days ago");
  });

  it("gives the weekly lead scoring refresh a weekly cadence instead of the two-day line", () => {
    const snap = (days: number): OperationsSnapshot => ({ ...healthy, rollups: [{ job: "lead_scores", status: "idle", last_success_at: daysAgo(days), error: null }, { job: "county_market_profile", status: "idle", last_success_at: daysAgo(days), error: null }] });
    // Five days after a weekly run is normal for scores, but a daily rollup is long overdue.
    expect(evaluateOperationsAlerts(snap(5), now).map((a) => a.key)).toEqual(["rollup_stale:county_market_profile"]);
    // A missed week (nine days and over) is overdue for both.
    expect(evaluateOperationsAlerts(snap(10), now).map((a) => a.key).sort()).toEqual(["rollup_stale:county_market_profile", "rollup_stale:lead_scores"]);
    // A job that never succeeded and failed is flagged whatever its cadence.
    expect(evaluateOperationsAlerts({ ...healthy, rollups: [{ job: "lead_scores", status: "failed", last_success_at: null, error: "boom" }] }, now)).toMatchObject([{ key: "rollup_stale:lead_scores" }]);
    expect(DEFAULT_THRESHOLDS.rollupStaleByJobMs.lead_scores).toBeGreaterThan(7 * 24 * 60 * 60 * 1000);
  });

  it("orders critical first and formats a digest with a link to the Health tab", () => {
    const alerts = evaluateOperationsAlerts({ ...healthy, heartbeat: null, rollups: [{ job: "stale", status: "idle", last_success_at: daysAgo(3), error: null }] }, now);
    expect(alerts.map((a) => a.severity)).toEqual(["critical", "warning"]);
    const digest = formatAlertDigest(alerts, "https://app.example.com");
    expect(digest.subject).toBe("CareMetric Intel operations: 2 items need attention (1 critical)");
    expect(digest.text).toContain("- [critical] Maintenance: No maintenance run has ever been recorded");
    expect(digest.text).toContain("- [warning] Rollup stale: Last refreshed 3 days ago.");
    expect(digest.text).toContain("https://app.example.com/ImportMonitoring?importsTab=health");
    expect(formatAlertDigest(alerts.slice(0, 1), null).text).toContain("Open Data Center");
  });
});

describe("loadOperationsSnapshot", () => {
  it("reads the four sources and tolerates a table that doesn't exist yet", async () => {
    const pool = {
      async query(sql: string) {
        if (sql.includes("FROM dataset_versions")) return { rows: [{ import_type: "a", source_title: "A", status: "current", catalog_modified: null, imported_modified: null, imported_at: null }] };
        // SQLSTATE 42P01: the code can ship before the migration that creates the table.
        if (sql.includes("FROM import_schedule_configs")) throw Object.assign(new Error('relation "import_schedule_configs" does not exist'), { code: "42P01" });
        if (sql.includes("maintenance_fanout")) return { rows: [{ created_date: now, details: { workers: [{ worker: "ok", ok: true }, { worker: "bad", ok: false }] } }] };
        if (sql.includes("FROM rollup_runs")) return { rows: [] };
        throw new Error(`unexpected ${sql}`);
      },
    };
    const snap = await loadOperationsSnapshot(pool);
    expect(snap.datasets).toHaveLength(1);
    expect(snap.schedules).toEqual([]);
    expect(snap.heartbeat).toEqual({ at: now, failed: ["bad"] });
    expect(snap.rollups).toEqual([]);
  });
});

describe("loadOperationsSnapshot when a source can't be read", () => {
  // A monitor that answers "nothing open" because a query timed out is worse than one that says it is blind:
  // every failure but a missing table has to reach the caller.
  const sources: Array<[string, string]> = [
    ["datasets", "FROM dataset_versions"],
    ["schedules", "FROM import_schedule_configs"],
    ["the heartbeat", "maintenance_fanout"],
    ["rollups", "FROM rollup_runs"],
  ];
  for (const [name, needle] of sources) {
    it(`fails, rather than reporting none, when ${name} time out`, async () => {
      const pool = {
        async query(sql: string) {
          if (sql.includes(needle)) throw Object.assign(new Error("canceling statement due to statement timeout"), { code: "57014" });
          return { rows: [] };
        },
      };
      await expect(loadOperationsSnapshot(pool)).rejects.toThrow(/statement timeout/);
    });
  }

  it("fails on a plain error with no database code, too (a dropped connection is not a missing table)", async () => {
    const pool = { async query() { throw new Error("Connection terminated unexpectedly"); } };
    await expect(loadOperationsSnapshot(pool)).rejects.toThrow(/Connection terminated/);
  });
});

describe("loadOperationsSnapshot and the import behind each dataset", () => {
  it("joins each dataset to the batch it points at, so a vanished batch can be told from a running one", async () => {
    const seen: string[] = [];
    const pool = {
      async query(sql: string) {
        seen.push(sql);
        return { rows: [] };
      },
    };
    await loadOperationsSnapshot(pool);
    const datasets = seen.find((q) => q.includes("FROM dataset_versions"))!;
    expect(datasets).toMatch(/LEFT JOIN import_batches b ON b\.id = d\.imported_batch_id/);
    expect(datasets).toMatch(/b\.status AS batch_status/);
    expect(datasets).toMatch(/d\.updated_date/);
  });
});

describe("maintenance fan-out", () => {
  // The fan-out starts every worker at once, so the list's order is the order they are reported in the heartbeat,
  // not an order of execution: the alerts worker judges what earlier ticks left (its thresholds are hours and days).
  it("lists the operations alerts worker after the workers whose results it reports on", () => {
    const names = FANOUT_WORKERS.map((w) => w.name);
    expect(names).toContain("operationsAlerts");
    expect(names).toContain("refreshLeadScores");
    expect(names.at(-1)).toBe("operationsAlerts");
  });
});

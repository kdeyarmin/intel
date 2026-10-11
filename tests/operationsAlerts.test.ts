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

  it("orders critical first and formats a digest with a link to the Health tab", () => {
    const alerts = evaluateOperationsAlerts({ ...healthy, heartbeat: null, rollups: [{ job: "stale", status: "idle", last_success_at: daysAgo(3), error: null }] }, now);
    expect(alerts.map((a) => a.severity)).toEqual(["critical", "warning"]);
    const digest = formatAlertDigest(alerts, "https://app.example.com");
    expect(digest.subject).toBe("CareMetric operations: 2 items need attention (1 critical)");
    expect(digest.text).toContain("- [critical] Maintenance: No maintenance run has ever been recorded");
    expect(digest.text).toContain("- [warning] Rollup stale: Last refreshed 3 days ago.");
    expect(digest.text).toContain("https://app.example.com/ImportMonitoring?importsTab=health");
    expect(formatAlertDigest(alerts.slice(0, 1), null).text).toContain("Open Data Center");
  });
});

describe("loadOperationsSnapshot", () => {
  it("reads the four sources and tolerates a missing table", async () => {
    const pool = {
      async query(sql: string) {
        if (sql.includes("FROM dataset_versions")) return { rows: [{ import_type: "a", source_title: "A", status: "current", catalog_modified: null, imported_modified: null, imported_at: null }] };
        if (sql.includes("FROM import_schedule_configs")) throw new Error("relation does not exist");
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

describe("maintenance fan-out", () => {
  it("runs the operations alerts worker", () => {
    expect(FANOUT_WORKERS.map((w) => w.name)).toContain("operationsAlerts");
  });
});

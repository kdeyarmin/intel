// Operations alerts (plan phase 5): what an operator must look at so the
// data keeps refreshing. Four conditions, each read from tables the
// maintenance workers already keep:
//   - a dataset whose newer release has not been imported within a week
//   - an import schedule that keeps failing
//   - no maintenance heartbeat for a while (the cron isn't ticking)
//   - an analytics rollup whose last success is too old
// `evaluateOperationsAlerts` is pure so it can be unit-tested; the worker in
// maintenance.ts loads a snapshot, evaluates it and emails platform admins at
// most once a day while anything is open.

export type AlertSeverity = "warning" | "critical";

export interface OperationsAlert {
  kind: "dataset_behind" | "schedule_failing" | "heartbeat_stale" | "rollup_stale";
  severity: AlertSeverity;
  /** Stable id for de-duplication across digests (kind + subject). */
  key: string;
  subject: string;
  message: string;
  since: string | null;
}

export interface OperationsSnapshot {
  datasets: Array<{ import_type: string; source_title: string | null; status: string; catalog_modified: Date | string | null; imported_modified: Date | string | null; imported_at: Date | string | null }>;
  schedules: Array<{ id: number; label: string | null; import_type: string | null; is_active: boolean | null; last_run_status: string | null; last_run_at: Date | string | null; consecutive_failures: number | null; last_run_summary: string | null }>;
  /** When the last maintenance fan-out heartbeat was written, and how many workers failed in it. */
  heartbeat: { at: Date | string | null; failed: string[] } | null;
  rollups: Array<{ job: string; status: string; last_success_at: Date | string | null; error: string | null }>;
}

export interface AlertThresholds {
  datasetBehindMs: number;
  scheduleFailures: number;
  heartbeatStaleMs: number;
  rollupStaleMs: number;
}

export const DEFAULT_THRESHOLDS: AlertThresholds = {
  datasetBehindMs: 7 * 24 * 60 * 60 * 1000,
  scheduleFailures: 3,
  heartbeatStaleMs: 2 * 60 * 60 * 1000,
  rollupStaleMs: 2 * 24 * 60 * 60 * 1000,
};

/** Digests go out at most this often while alerts stay open. */
export const DIGEST_INTERVAL_MS = 24 * 60 * 60 * 1000;

const toMs = (v: Date | string | null | undefined): number | null => {
  if (!v) return null;
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
};
const iso = (v: Date | string | null | undefined): string | null => {
  const t = toMs(v);
  return t === null ? null : new Date(t).toISOString();
};
const days = (ms: number) => Math.floor(ms / (24 * 60 * 60 * 1000));

export function evaluateOperationsAlerts(snapshot: OperationsSnapshot, now: Date = new Date(), t: AlertThresholds = DEFAULT_THRESHOLDS): OperationsAlert[] {
  const alerts: OperationsAlert[] = [];
  const nowMs = now.getTime();

  // Datasets: the catalog shows a newer release than what is loaded, and that
  // release is older than the grace period (the on-release schedule should
  // have imported it by then).
  for (const d of snapshot.datasets) {
    const catalogMs = toMs(d.catalog_modified);
    const importedMs = toMs(d.imported_modified);
    if (catalogMs === null) continue;
    const behind = d.status === "update_available" || (importedMs !== null && catalogMs > importedMs) || (importedMs === null && d.status !== "never_imported" && d.status !== "importing");
    if (!behind || d.status === "importing") continue;
    const age = nowMs - catalogMs;
    if (age < t.datasetBehindMs) continue;
    alerts.push({
      kind: "dataset_behind",
      severity: age >= 4 * t.datasetBehindMs ? "critical" : "warning",
      key: `dataset_behind:${d.import_type}`,
      subject: d.source_title || d.import_type,
      message: `A newer release (published ${new Date(catalogMs).toISOString().slice(0, 10)}, ${days(age)} days ago) hasn't been imported${importedMs ? `; loaded version is from ${new Date(importedMs).toISOString().slice(0, 10)}` : ""}.`,
      since: new Date(catalogMs).toISOString(),
    });
  }

  for (const s of snapshot.schedules) {
    if (s.is_active === false) continue;
    const failures = s.consecutive_failures ?? 0;
    const failing = failures >= t.scheduleFailures || (s.last_run_status === "failed" && failures >= 1 && failures >= t.scheduleFailures);
    if (!failing) continue;
    alerts.push({
      kind: "schedule_failing",
      severity: failures >= 2 * t.scheduleFailures ? "critical" : "warning",
      key: `schedule_failing:${s.id}`,
      subject: s.label || s.import_type || `schedule ${s.id}`,
      message: `${failures} consecutive failed runs${s.last_run_summary ? `; last: ${String(s.last_run_summary).slice(0, 160)}` : ""}.`,
      since: iso(s.last_run_at),
    });
  }

  const hb = snapshot.heartbeat;
  const hbMs = toMs(hb?.at);
  if (hbMs === null) {
    alerts.push({ kind: "heartbeat_stale", severity: "critical", key: "heartbeat_stale", subject: "Maintenance", message: "No maintenance run has ever been recorded: the cron isn't wired, so nothing imports or refreshes.", since: null });
  } else if (nowMs - hbMs >= t.heartbeatStaleMs) {
    const hours = Math.round((nowMs - hbMs) / 3_600_000);
    alerts.push({ kind: "heartbeat_stale", severity: hours >= 24 ? "critical" : "warning", key: "heartbeat_stale", subject: "Maintenance", message: `The last maintenance run was ${hours} hours ago; the cron may have stopped.`, since: new Date(hbMs).toISOString() });
  } else if (hb && hb.failed.length > 0) {
    alerts.push({ kind: "heartbeat_stale", severity: "warning", key: "heartbeat_failed_workers", subject: "Maintenance", message: `The last run had failing workers: ${hb.failed.join(", ")}.`, since: new Date(hbMs).toISOString() });
  }

  for (const r of snapshot.rollups) {
    const lastMs = toMs(r.last_success_at);
    if (r.status === "running") continue;
    if (lastMs !== null && nowMs - lastMs < t.rollupStaleMs) continue;
    if (lastMs === null && r.status !== "failed") continue; // never run yet: the next tick will start it
    alerts.push({
      kind: "rollup_stale",
      severity: r.status === "failed" ? "warning" : "warning",
      key: `rollup_stale:${r.job}`,
      subject: `Rollup ${r.job}`,
      message: lastMs === null ? `Never succeeded${r.error ? `: ${String(r.error).slice(0, 160)}` : ""}.` : `Last refreshed ${days(nowMs - lastMs)} days ago${r.error ? `; last error: ${String(r.error).slice(0, 160)}` : ""}.`,
      since: lastMs === null ? null : new Date(lastMs).toISOString(),
    });
  }

  const order: Record<AlertSeverity, number> = { critical: 0, warning: 1 };
  return alerts.sort((a, b) => order[a.severity] - order[b.severity] || a.subject.localeCompare(b.subject));
}

/** Reads everything the evaluation needs from the database. */
export async function loadOperationsSnapshot(pool: { query(sql: string, params?: unknown[]): Promise<{ rows: any[] }> }): Promise<OperationsSnapshot> {
  const [datasets, schedules, heartbeat, rollups] = await Promise.all([
    pool.query("SELECT import_type, source_title, status, catalog_modified, imported_modified, imported_at FROM dataset_versions").catch(() => ({ rows: [] })),
    pool.query("SELECT id, label, import_type, is_active, last_run_status, last_run_at, consecutive_failures, last_run_summary FROM import_schedule_configs").catch(() => ({ rows: [] })),
    pool.query("SELECT created_date, details FROM audit_events WHERE event_type = 'maintenance_fanout' ORDER BY created_date DESC LIMIT 1").catch(() => ({ rows: [] })),
    pool.query("SELECT job, status, last_success_at, error FROM rollup_runs").catch(() => ({ rows: [] })),
  ]);
  const hb = heartbeat.rows[0];
  const workers = Array.isArray(hb?.details?.workers) ? hb.details.workers : [];
  return {
    datasets: datasets.rows,
    schedules: schedules.rows,
    heartbeat: hb ? { at: hb.created_date, failed: workers.filter((w: any) => w && w.ok === false).map((w: any) => String(w.worker)) } : null,
    rollups: rollups.rows,
  };
}

/** The emailed digest: one line per alert, worst first, with a link to the Health tab. */
export function formatAlertDigest(alerts: OperationsAlert[], baseUrl: string | null): { subject: string; text: string } {
  const critical = alerts.filter((a) => a.severity === "critical").length;
  const subject = `CareMetric operations: ${alerts.length} item${alerts.length === 1 ? "" : "s"} need attention${critical ? ` (${critical} critical)` : ""}`;
  const lines = [
    "These are open on the CareMetric data pipeline:",
    "",
    ...alerts.map((a) => `- [${a.severity}] ${a.subject}: ${a.message}`),
    "",
    baseUrl ? `Details and manual controls: ${baseUrl}/ImportMonitoring?importsTab=health` : "Open Data Center → Import monitor → Health for details and manual controls.",
    "",
    "You get this at most once a day while something is open.",
  ];
  return { subject, text: lines.join("\n") };
}

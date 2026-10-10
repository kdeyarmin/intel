// Scheduled reports, pure parts: which tables a report may read, the
// aggregation (a port of the browser's aggregateData in
// src/components/customReports/ReportChart.jsx), when the next run is due
// (schedules are entered in US Eastern time), and the email body.

export interface ReportDataset {
  /** Entity name in server/db/schema.ts tableMap. */
  entity: string;
  label: string;
  yearField?: string;
  /** Metrics that mean "how many rows" rather than a value to sum. */
  countMetrics?: string[];
}

// Datasets offered by the report builder and the schedule form. Only these
// tables can be read, and only columns that exist on them.
export const REPORT_DATASETS: Record<string, ReportDataset> = {
  cms_utilization: { entity: "ProviderServiceUtilization", label: "Provider Service Utilization", yearField: "data_year" },
  cms_referrals: { entity: "CMSReferral", label: "CMS Referrals", yearField: "data_year" },
  ma_inpatient: { entity: "MedicareFacility", label: "MA Inpatient Hospitals", yearField: "data_year" },
  hha_stats: { entity: "MedicareFacility", label: "Home Health Agency Stats", yearField: "data_year" },
  inpatient_drg: { entity: "MedicareFacility", label: "Inpatient DRG", yearField: "data_year" },
  snf_stats: { entity: "MedicareFacility", label: "SNF Stats", yearField: "data_year" },
  providers: { entity: "Provider", label: "Providers", countMetrics: ["npi"] },
  locations: { entity: "ProviderLocation", label: "Provider Locations", countMetrics: ["npi"] },
  outreach_metrics: { entity: "OutreachCampaign", label: "Outreach Campaigns" },
};

export interface ReportConfig {
  dataset?: string;
  metrics?: string[];
  group_by?: string;
  filters?: Record<string, any>;
}

export type ReportRow = { group: string } & Record<string, number | string>;

/**
 * Same rules as the browser: filter, then total each metric per group, sort
 * by the first metric and keep the top 25. Two corrections: years compare as
 * strings (data_year is text; the browser compared it to a number), and
 * count metrics count rows instead of summing an NPI.
 */
export function aggregateReport(rows: Record<string, any>[], config: ReportConfig, ds: ReportDataset): ReportRow[] {
  const metrics = config.metrics || [];
  const counts = new Set(ds.countMetrics || []);
  const f = config.filters || {};
  let data = rows;
  if (f.year && ds.yearField) data = data.filter((r) => String(r[ds.yearField!]) === String(f.year));
  if (f.state) data = data.filter((r) => String(r.state || "").toUpperCase() === String(f.state).toUpperCase());
  if (f.hospital_type) data = data.filter((r) => String(r.hospital_type || "").toLowerCase().includes(String(f.hospital_type).toLowerCase()));
  if (f.table_name) data = data.filter((r) => r.table_name === f.table_name);
  if (data.length === 0) return [];

  const add = (target: Record<string, any>, row: Record<string, any>) => {
    for (const m of metrics) target[m] = (target[m] || 0) + (counts.has(m) ? 1 : Number(row[m]) || 0);
  };
  const groupKey = config.group_by;
  if (!groupKey) {
    const total: Record<string, any> = { group: "Total" };
    for (const m of metrics) total[m] = 0;
    for (const r of data) add(total, r);
    return [total as ReportRow];
  }
  const groups = new Map<string, Record<string, any>>();
  for (const r of data) {
    const g = String(r[groupKey] || "Unknown").substring(0, 30);
    if (!g || g === "Unknown" || g === "undefined") continue;
    if (!groups.has(g)) groups.set(g, Object.fromEntries([["group", g], ...metrics.map((m) => [m, 0])]));
    add(groups.get(g)!, r);
  }
  const first = metrics[0];
  return [...groups.values()]
    .sort((a, b) => (Number(b[first]) || 0) - (Number(a[first]) || 0))
    .slice(0, 25) as ReportRow[];
}

// ─── Scheduling (US Eastern) ─────────────────────────────────────────────────

export const REPORT_TIMEZONE = "America/New_York";
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export interface ScheduleFields {
  frequency?: string;
  schedule_day?: string | number | null;
  schedule_time?: string | null;
}

/** Offset (ms) of the zone from UTC at an instant: wall-clock time minus UTC. */
function zoneOffset(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - Math.floor(instant / 1000) * 1000;
}

/** The UTC instant for a wall-clock time in a zone (DST-aware). */
export function zonedTime(y: number, m: number, d: number, hh: number, mm: number, timeZone = REPORT_TIMEZONE): Date {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let t = guess - zoneOffset(guess, timeZone);
  t = guess - zoneOffset(t, timeZone); // second pass settles DST transitions
  return new Date(t);
}

function zonedDate(instant: Date, timeZone = REPORT_TIMEZONE) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "long" }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  return { y: Number(get("year")), m: Number(get("month")), d: Number(get("day")) };
}

/** Signature of the fields that decide when a schedule runs; a change means "recompute the next run". */
export function scheduleSignature(s: ScheduleFields): string {
  return `${s.frequency || "weekly"}|${s.schedule_day ?? ""}|${s.schedule_time || "08:00"}`;
}

/** The first scheduled time strictly after `after`, interpreting the schedule in US Eastern time. */
export function computeNextReportRun(s: ScheduleFields, after: Date): Date {
  const freq = ["daily", "weekly", "monthly"].includes(String(s.frequency)) ? String(s.frequency) : "weekly";
  const [hh, mm] = /^\d{1,2}:\d{2}$/.test(String(s.schedule_time || "")) ? String(s.schedule_time).split(":").map(Number) : [8, 0];
  const hour = Math.min(23, Math.max(0, hh));
  const minute = Math.min(59, Math.max(0, mm));
  // Stale values from switching frequency fall back to sensible defaults.
  const weekday = DAYS.indexOf(String(s.schedule_day));
  const wantWeekday = weekday >= 0 ? weekday : 1; // Monday
  const dom = Number.parseInt(String(s.schedule_day), 10);
  const wantDom = Number.isInteger(dom) && dom >= 1 && dom <= 28 ? dom : 1;

  const start = zonedDate(after);
  for (let i = 0; i < 70; i += 1) {
    // Walk calendar days in the zone (UTC date arithmetic is safe for whole days).
    const day = new Date(Date.UTC(start.y, start.m - 1, start.d + i));
    const y = day.getUTCFullYear();
    const m = day.getUTCMonth() + 1;
    const d = day.getUTCDate();
    if (freq === "weekly" && day.getUTCDay() !== wantWeekday) continue;
    if (freq === "monthly" && d !== wantDom) continue;
    const at = zonedTime(y, m, d, hour, minute);
    if (at.getTime() > after.getTime()) return at;
  }
  throw new Error("Could not compute the next report run");
}

// ─── Email ───────────────────────────────────────────────────────────────────

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export const humanize = (key: string) => key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const formatNumber = (v: unknown) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v ?? "");
  return n.toLocaleString("en-US", { maximumFractionDigits: Number.isInteger(n) ? 0 : 2 });
};

function csvCell(v: unknown): string {
  const s = String(v ?? "");
  // Neutralise spreadsheet formulas, then quote when needed.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export interface ReportEmailInput {
  name: string;
  description?: string;
  datasetLabel: string;
  groupLabel: string;
  metrics: Array<{ key: string; label: string }>;
  rows: ReportRow[];
  sourceRowCount: number;
  summary?: string | null;
  manageUrl?: string | null;
}

export function buildReportCsv(input: Pick<ReportEmailInput, "groupLabel" | "metrics" | "rows">): string {
  const header = [input.groupLabel, ...input.metrics.map((m) => m.label)].map(csvCell).join(",");
  const lines = input.rows.map((r) => [r.group, ...input.metrics.map((m) => r[m.key] ?? 0)].map(csvCell).join(","));
  return [header, ...lines].join("\r\n") + "\r\n";
}

export function buildReportEmail(input: ReportEmailInput): { subject: string; html: string; text: string } {
  const subject = `${input.name}: ${input.datasetLabel} report`;
  const basis = `Based on the latest ${input.sourceRowCount.toLocaleString("en-US")} ${input.datasetLabel} records.`;
  const head = `<tr><th style="text-align:left;padding:6px 10px;border-bottom:2px solid #ccc">${esc(input.groupLabel)}</th>${input.metrics
    .map((m) => `<th style="text-align:right;padding:6px 10px;border-bottom:2px solid #ccc">${esc(m.label)}</th>`).join("")}</tr>`;
  const body = input.rows.map((r) => `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${esc(r.group)}</td>${input.metrics
    .map((m) => `<td style="text-align:right;padding:6px 10px;border-bottom:1px solid #eee">${esc(formatNumber(r[m.key]))}</td>`).join("")}</tr>`).join("");
  const table = input.rows.length
    ? `<table style="border-collapse:collapse;font-size:14px">${head}${body}</table>`
    : `<p>No records matched this report's filters.</p>`;
  const html = `<div style="font-family:system-ui,sans-serif;color:#1f2937">
<h2 style="margin:0 0 4px">${esc(input.name)}</h2>
${input.description ? `<p style="margin:0 0 12px;color:#4b5563">${esc(input.description)}</p>` : ""}
${input.summary ? `<p style="margin:0 0 12px">${esc(input.summary)}</p>` : ""}
${table}
<p style="font-size:12px;color:#6b7280;margin-top:16px">${esc(basis)}${input.manageUrl ? ` Manage this schedule: <a href="${esc(input.manageUrl)}">${esc(input.manageUrl)}</a>` : ""}</p>
</div>`;
  const textRows = input.rows.map((r) => `${r.group}: ${input.metrics.map((m) => `${m.label} ${formatNumber(r[m.key])}`).join(", ")}`);
  const text = [input.name, input.description, input.summary, "", ...(textRows.length ? textRows : ["No records matched this report's filters."]), "", basis,
    input.manageUrl ? `Manage this schedule: ${input.manageUrl}` : ""].filter((l) => l !== undefined && l !== null).join("\n").trim();
  return { subject, html, text };
}

/** A one-paragraph summary computed from the numbers (used when AI isn't configured). */
export function summarizeReport(rows: ReportRow[], metrics: Array<{ key: string; label: string }>, groupLabel: string): string | null {
  const first = metrics[0];
  if (!first || rows.length === 0) return null;
  const total = rows.reduce((s, r) => s + (Number(r[first.key]) || 0), 0);
  if (rows.length === 1) return `${first.label}: ${formatNumber(total)}.`;
  const top = rows[0];
  const share = total > 0 ? Math.round((100 * (Number(top[first.key]) || 0)) / total) : 0;
  return `${top.group} leads ${rows.length} ${groupLabel.toLowerCase()} groups on ${first.label.toLowerCase()} with ${formatNumber(top[first.key])} (${share}% of ${formatNumber(total)}).`;
}

/** Recipients a report may go to: app users, or addresses on an allowed domain. */
export function partitionRecipients(recipients: unknown, userEmails: Set<string>, allowedDomains: string[]) {
  const list = (Array.isArray(recipients) ? recipients : []).map((e) => String(e).trim().toLowerCase()).filter((e) => e.includes("@"));
  const allowed: string[] = [];
  const blocked: string[] = [];
  for (const email of [...new Set(list)]) {
    const domain = email.split("@")[1];
    (userEmails.has(email) || allowedDomains.includes(domain) ? allowed : blocked).push(email);
  }
  return { allowed: allowed.slice(0, 25), blocked };
}

// generateScheduledReport: run a saved schedule now ("run_single"), show it
// without sending ("preview"), or run every schedule that is due
// ("run_all_due", also called each maintenance tick). Schedule settings live
// in scheduled_reports.config (the entity's overflow bag), which is also
// where the list reads last_run_at / last_run_status / last_run_summary.
import { getTableColumns, getTableName } from "drizzle-orm";
import { pool } from "../db";
import { tableMap } from "../db/schema";
import { getMailerStatus, sendMail } from "../lib/mailer";
import { CLAUDE_MODELS } from "../lib/aiModels";
import {
  aggregateReport,
  buildReportCsv,
  buildReportEmail,
  computeNextReportRun,
  humanize,
  MAX_REPORT_RECIPIENTS,
  partitionRecipients,
  REPORT_DATASETS,
  reportFields,
  scheduleSignature,
  summarizeReport,
  type ReportRow,
} from "../lib/reportAggregate";

const DEFAULT_ROWS = 500;
const MAX_ROWS = 5000;
const RUN_LEASE_MS = 10 * 60 * 1000;
// Reports one maintenance tick builds and sends, most overdue first; the rest
// stay due and go out on the next tick.
export const MAX_RUNS_PER_TICK = 20;

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const settings = (row: any) => ({ ...(row?.config || {}), name: row.name, recipients: row.recipients });

async function loadRows(entity: string, fields: string[], limit: number): Promise<Record<string, any>[]> {
  const table = tableMap[entity];
  if (!table) throw new HttpError(400, `Unknown dataset table ${entity}`);
  const columns = getTableColumns(table) as Record<string, { name: string }>;
  const missing = fields.filter((f) => !columns[f]);
  if (missing.length) throw new HttpError(400, `This dataset has no ${missing.join(", ")} column.`);
  const wanted = fields.map((f) => columns[f].name);
  const tableName = getTableName(table);
  // Same basis as the report page: the newest rows (by id, which is indexed on every table).
  const client = await pool.connect();
  try {
    await client.query("SET statement_timeout = '15s'");
    const { rows } = await client.query(
      `SELECT ${wanted.map((c) => `"${c}"`).join(", ")} FROM "${tableName}" ORDER BY id DESC LIMIT $1`,
      [limit],
    );
    return rows;
  } finally {
    await client.query("RESET statement_timeout").catch(() => {});
    client.release();
  }
}

async function aiSummary(name: string, rows: ReportRow[], metrics: Array<{ key: string; label: string }>, groupLabel: string): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY || rows.length === 0) return null;
  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const res = await anthropic.messages.create({
      model: CLAUDE_MODELS.HAIKU,
      max_tokens: 200,
      messages: [{
        role: "user",
        content: `Summarize this report table in two plain sentences for a busy reader. Use only these numbers; don't speculate.\nReport: ${name}\nGrouped by: ${groupLabel}\nColumns: ${metrics.map((m) => m.label).join(", ")}\nRows: ${JSON.stringify(rows.slice(0, 15))}`,
      }],
    });
    return ((res.content.find((b: any) => b.type === "text") as any)?.text || "").trim() || null;
  } catch (e: any) {
    console.warn("[scheduledReports] AI summary failed:", e?.message);
    return null;
  }
}

/** Build the report for one schedule: rows, email content and CSV. */
async function buildReport(row: any) {
  const cfg = settings(row);
  const ds = REPORT_DATASETS[cfg.dataset];
  if (!ds) throw new HttpError(400, `This schedule's dataset "${cfg.dataset || "none"}" can't be emailed. Edit the schedule and pick a dataset.`);
  const metricKeys: string[] = Array.isArray(cfg.metrics) ? cfg.metrics.filter((m: unknown) => typeof m === "string") : [];
  const limit = Math.min(Math.max(Number(cfg.max_rows) || DEFAULT_ROWS, 1), MAX_ROWS);
  const filters = cfg.filters && typeof cfg.filters === "object" ? cfg.filters : {};
  const config = { metrics: metricKeys, group_by: cfg.group_by || undefined, filters };
  let fields: string[];
  try {
    fields = reportFields(ds, config);
  } catch (e: any) {
    throw new HttpError(400, e.message);
  }
  const source = await loadRows(ds.entity, fields, limit);
  const rows = aggregateReport(source, config, ds);
  const metrics = metricKeys.map((key) => ({ key, label: ds.metrics.find((m) => m.key === key)?.label || humanize(key) }));
  const groupLabel = cfg.group_by ? ds.groupOptions.find((g) => g.key === cfg.group_by)?.label || humanize(cfg.group_by) : "Group";
  const summary = cfg.include_summary === false
    ? null
    : (await aiSummary(row.name, rows, metrics, groupLabel)) || summarizeReport(rows, metrics, groupLabel);
  const appUrl = (process.env.PUBLIC_APP_URL || "").replace(/\/+$/, "");
  const email = buildReportEmail({
    name: row.name || "Scheduled report",
    description: cfg.description,
    datasetLabel: ds.label,
    groupLabel,
    metrics,
    rows,
    sourceRowCount: source.length,
    summary,
    manageUrl: appUrl ? `${appUrl}/CustomReports` : null,
  });
  return { cfg, rows, metrics, groupLabel, summary, email, csv: cfg.include_csv === false ? null : buildReportCsv({ groupLabel, metrics, rows }), sourceRowCount: source.length };
}

// Why a recipient was skipped: reports go to active app users, plus any
// address on a REPORT_RECIPIENT_DOMAINS domain.
const BLOCKED_REASON = () => (process.env.REPORT_RECIPIENT_DOMAINS ? "not active app users or on an approved domain" : "not active app users");
const OVERFLOW_REASON = `a report goes to at most ${MAX_REPORT_RECIPIENTS} recipients`;

async function allowedRecipients(recipients: unknown) {
  const list = (Array.isArray(recipients) ? recipients : []).map((e) => String(e).trim().toLowerCase());
  // Only active accounts: not someone awaiting approval, or a disabled account
  // (who stays blocked even on an allowed domain).
  const { rows } = await pool.query("SELECT lower(email) AS email, status FROM users WHERE lower(email) = ANY($1)", [list]);
  const domains = (process.env.REPORT_RECIPIENT_DOMAINS || "").split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
  const active = new Set<string>(rows.filter((r: any) => r.status === "active").map((r: any) => r.email));
  const inactive = new Set<string>(rows.filter((r: any) => r.status !== "active").map((r: any) => r.email));
  return partitionRecipients(recipients, active, domains, inactive);
}

async function saveRunState(id: number, patch: Record<string, unknown>) {
  await pool.query(
    "UPDATE scheduled_reports SET config = COALESCE(config, '{}'::jsonb) || $2::jsonb, updated_date = now() WHERE id = $1",
    [id, JSON.stringify(patch)],
  );
}

/**
 * Run one schedule and email it. Records the outcome on the schedule either
 * way. Only a scheduled run moves next_run_at on: "Send now" (advance: false)
 * leaves the next scheduled delivery where it was.
 */
async function runAndSend(row: any, { advance = true }: { advance?: boolean } = {}) {
  const now = new Date();
  const nextRun = (cfg: any) => (advance
    ? { next_run_at: computeNextReportRun(cfg, now).toISOString(), schedule_signature: scheduleSignature(cfg) }
    : {});
  try {
    const report = await buildReport(row);
    const { allowed, blocked, overflow } = await allowedRecipients(row.recipients);
    if (!allowed.length) {
      throw new HttpError(400, blocked.length
        ? `None of the recipients can receive reports (${BLOCKED_REASON()}): ${blocked.join(", ")}.`
        : "Add at least one recipient.");
    }
    let sent = 0;
    const failures: string[] = [];
    for (const to of allowed) {
      try {
        await sendMail({
          to,
          subject: report.email.subject,
          text: report.email.text,
          html: report.email.html,
          attachments: report.csv
            ? [{ filename: `${String(row.name || "report").replace(/[^\w-]+/g, "_").slice(0, 60)}.csv`, content: report.csv, type: "text/csv" }]
            : undefined,
        });
        sent += 1;
      } catch (e: any) {
        failures.push(`${to}: ${e?.response?.body?.errors?.[0]?.message || e?.message || "send failed"}`);
      }
    }
    const parts = [`Sent to ${sent} of ${allowed.length} recipient${allowed.length === 1 ? "" : "s"}`, `${report.rows.length} rows from ${report.sourceRowCount} records`];
    if (blocked.length) parts.push(`skipped ${blocked.join(", ")} (${BLOCKED_REASON()})`);
    if (overflow.length) parts.push(`skipped ${overflow.join(", ")} (${OVERFLOW_REASON})`);
    if (failures.length) parts.push(`failed: ${failures.join("; ")}`);
    const status = sent > 0 ? "success" : "failed";
    await saveRunState(row.id, {
      last_run_at: now.toISOString(),
      last_run_status: status,
      last_run_summary: parts.join("; ").slice(0, 500),
      ...nextRun(report.cfg),
    });
    return { status, emails_sent: sent, skipped_recipients: blocked, overflow_recipients: overflow, failures, rows: report.rows.length };
  } catch (e: any) {
    const cfg = settings(row);
    await saveRunState(row.id, {
      last_run_at: now.toISOString(),
      last_run_status: "failed",
      last_run_summary: String(e?.message || e).slice(0, 500),
      ...nextRun(cfg),
    });
    throw e;
  }
}

async function loadSchedule(id: unknown) {
  const reportId = Number(id);
  if (!Number.isInteger(reportId)) throw new HttpError(400, "report_id is required.");
  const { rows } = await pool.query("SELECT * FROM scheduled_reports WHERE id = $1", [reportId]);
  if (!rows[0]) throw new HttpError(404, "Scheduled report not found.");
  return rows[0];
}

function mailerMissing() {
  const status = getMailerStatus();
  return status.configured ? null : {
    success: false as const,
    notConfigured: true as const,
    missing: status.missing,
    error: `Email isn't configured yet (missing ${status.missing.join(", ")}). Use Preview to see the report in the meantime.`,
  };
}

/**
 * Run the active schedules that are due, at most MAX_RUNS_PER_TICK of them,
 * most overdue first. A compare-and-set claims each one so overlapping ticks
 * can't send it twice, and a schedule edited or switched off since it was
 * read isn't claimed; the claimed row is what gets sent.
 */
export async function handleRunDueScheduledReports() {
  if (!getMailerStatus().configured) return { success: true, details: { checked: 0, ran: 0, skipped: "email not configured" } };
  // Every active schedule, a page at a time (keyset on id), so none is starved.
  const rows: any[] = [];
  for (let lastId = 0; ;) {
    const page = await pool.query(
      "SELECT *, updated_date::text AS updated_stamp FROM scheduled_reports WHERE COALESCE(config->>'is_active', 'true') <> 'false' AND id > $1 ORDER BY id LIMIT 500",
      [lastId],
    );
    rows.push(...page.rows);
    if (page.rows.length < 500) break;
    lastId = page.rows[page.rows.length - 1].id;
  }
  const now = new Date();
  const due: Array<{ row: any; cfg: any; next: Date }> = [];
  for (const row of rows) {
    const cfg = settings(row);
    const signatureChanged = cfg.schedule_signature && cfg.schedule_signature !== scheduleSignature(cfg);
    // An edited timing starts counting from now: counting from the last run
    // could land on a time that has already passed and send straight away.
    const anchor = signatureChanged ? now : new Date(cfg.last_run_at || row.created_date || now);
    const recompute = !cfg.next_run_at || signatureChanged;
    const next = recompute ? computeNextReportRun(cfg, anchor) : new Date(cfg.next_run_at);
    if (Number.isNaN(next.getTime())) continue;
    if (next > now) {
      // A new or edited schedule: store its next run so the list shows it.
      if (recompute) {
        await pool.query(
          `UPDATE scheduled_reports SET config = COALESCE(config, '{}'::jsonb) || jsonb_build_object('next_run_at', $2::text, 'schedule_signature', $3::text)
            WHERE id = $1 AND (config->>'next_run_at') IS NOT DISTINCT FROM $4::text`,
          [row.id, next.toISOString(), scheduleSignature(cfg), cfg.next_run_at ?? null],
        );
      }
      continue;
    }
    due.push({ row, cfg, next });
  }

  due.sort((a, b) => a.next.getTime() - b.next.getTime() || a.row.id - b.row.id);
  const results: Array<{ id: number; status: string; error?: string }> = [];
  for (const { row, cfg } of due.slice(0, MAX_RUNS_PER_TICK)) {
    const lease = new Date(now.getTime() + RUN_LEASE_MS).toISOString();
    const claimed = await pool.query(
      `UPDATE scheduled_reports SET config = COALESCE(config, '{}'::jsonb) || jsonb_build_object('next_run_at', $2::text)
        WHERE id = $1 AND (config->>'next_run_at') IS NOT DISTINCT FROM $3::text
          AND updated_date::text IS NOT DISTINCT FROM $4::text
          AND COALESCE(config->>'is_active', 'true') <> 'false'
        RETURNING *`,
      [row.id, lease, cfg.next_run_at ?? null, row.updated_stamp ?? null],
    );
    if (!claimed.rowCount) continue;
    try {
      const r = await runAndSend(claimed.rows[0]);
      results.push({ id: row.id, status: r.status });
    } catch (e: any) {
      results.push({ id: row.id, status: "failed", error: String(e?.message || e).slice(0, 200) });
    }
  }
  return {
    success: true,
    details: {
      checked: rows.length,
      ran: results.length,
      failed: results.filter((r) => r.status === "failed").length,
      deferred: Math.max(due.length - MAX_RUNS_PER_TICK, 0),
      results,
    },
  };
}

export async function handleGenerateScheduledReport(payload: any, user?: { role?: string }) {
  const action = String(payload?.action || "run_single");
  if (action === "run_all_due") {
    if (!(user?.role === "admin" || user?.isPlatformAdmin)) throw new HttpError(403, "Only platform admins can run all due reports.");
    return handleRunDueScheduledReports();
  }
  if (action === "preview") {
    const row = await loadSchedule(payload?.report_id);
    const report = await buildReport(row);
    const { allowed, blocked, overflow } = await allowedRecipients(row.recipients);
    return {
      success: true,
      preview: {
        subject: report.email.subject,
        summary: report.summary,
        group_label: report.groupLabel,
        metrics: report.metrics,
        rows: report.rows,
        source_row_count: report.sourceRowCount,
        recipients: allowed,
        blocked_recipients: blocked,
        blocked_reason: BLOCKED_REASON(),
        overflow_recipients: overflow,
        overflow_reason: OVERFLOW_REASON,
        next_run_at: computeNextReportRun(report.cfg, new Date()).toISOString(),
      },
    };
  }
  if (action === "run_single") {
    const missing = mailerMissing();
    if (missing) return missing;
    const row = await loadSchedule(payload?.report_id);
    const r = await runAndSend(row, { advance: false });
    if (r.emails_sent === 0) {
      return { success: false, error: `The report ran but no email was delivered. ${r.failures.join("; ")}`.trim() };
    }
    const skipped = [
      r.skipped_recipients.length ? `Skipped ${r.skipped_recipients.join(", ")} (${BLOCKED_REASON()}).` : "",
      r.overflow_recipients.length ? `Skipped ${r.overflow_recipients.join(", ")} (${OVERFLOW_REASON}).` : "",
    ].filter(Boolean).join(" ");
    return { success: true, emails_sent: r.emails_sent, message: skipped || undefined };
  }
  throw new HttpError(400, `Unknown action '${action}'.`);
}

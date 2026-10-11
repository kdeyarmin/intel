import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { query, sendMail } = vi.hoisted(() => ({ query: vi.fn(), sendMail: vi.fn(async () => ({})) }));
// Report rows come through a checked-out client; these tests need none.
vi.mock("../server/db", () => ({ pool: { query, connect: vi.fn(async () => ({ query: async () => ({ rows: [] }), release: () => {} })) } }));
vi.mock("../server/lib/mailer", () => ({ getMailerStatus: () => ({ configured: true, missing: [] }), sendMail }));

import { handleGenerateScheduledReport, handleRunDueScheduledReports, MAX_RUNS_PER_TICK } from "../server/functions/scheduledReports";

const SCAN = "SELECT *, updated_date::text AS updated_stamp FROM scheduled_reports";
import { scheduleSignature } from "../server/lib/reportAggregate";

const created = new Date("2026-01-01T00:00:00Z");
const weekly = { frequency: "weekly", schedule_day: "Monday", schedule_time: "08:00", is_active: true };

beforeEach(() => {
  query.mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-02T12:00:00Z")); // a Friday: the next Monday run is in the future
});
afterEach(() => {
  vi.useRealTimers();
  delete process.env.REPORT_RECIPIENT_DOMAINS;
  sendMail.mockClear();
});

describe("runDueScheduledReports", () => {
  it("pages through every active schedule instead of the first 500", async () => {
    const page1 = Array.from({ length: 500 }, (_, i) => ({ id: i + 1, name: `r${i}`, created_date: created, config: { ...weekly } }));
    const page2 = [{ id: 501, name: "late", created_date: created, config: { ...weekly } }];
    query.mockImplementation(async (sql: string, params: any[]) => {
      if (sql.startsWith(SCAN)) return { rows: params[0] === 0 ? page1 : params[0] === 500 ? page2 : [] };
      return { rows: [], rowCount: 1 };
    });
    const out = await handleRunDueScheduledReports();
    expect(out.details.checked).toBe(501);
    const selects = query.mock.calls.filter(([sql]) => String(sql).startsWith(SCAN));
    expect(selects.map(([, p]) => p[0])).toEqual([0, 500]);
  });

  it("stores the next run of a new or edited schedule that isn't due yet", async () => {
    const edited = { ...weekly, schedule_day: "Tuesday", next_run_at: "2026-01-05T13:00:00.000Z", schedule_signature: scheduleSignature(weekly) };
    query.mockImplementation(async (sql: string, params: any[]) => {
      if (sql.startsWith(SCAN)) return { rows: params[0] === 0 ? [{ id: 7, name: "x", created_date: created, config: edited }] : [] };
      return { rows: [], rowCount: 1 };
    });
    await handleRunDueScheduledReports();
    const update = query.mock.calls.find(([sql]) => String(sql).startsWith("UPDATE scheduled_reports"));
    expect(update?.[1]).toEqual([7, "2026-01-06T13:00:00.000Z", scheduleSignature({ ...weekly, schedule_day: "Tuesday" }), "2026-01-05T13:00:00.000Z"]);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("counts an edited timing from now, so it doesn't fire for a day that already passed", async () => {
    vi.setSystemTime(new Date("2026-01-07T12:00:00Z")); // Wednesday, after Monday's run
    const edited = {
      ...weekly,
      schedule_day: "Tuesday",
      last_run_at: "2026-01-05T13:00:00.000Z",
      next_run_at: "2026-01-12T13:00:00.000Z",
      schedule_signature: scheduleSignature(weekly),
    };
    query.mockImplementation(async (sql: string, params: any[]) => {
      if (sql.startsWith(SCAN)) return { rows: params[0] === 0 ? [{ id: 8, name: "x", created_date: created, config: edited }] : [] };
      return { rows: [], rowCount: 1 };
    });
    await handleRunDueScheduledReports();
    const update = query.mock.calls.find(([sql]) => String(sql).startsWith("UPDATE scheduled_reports"));
    // Next Tuesday, not yesterday's Tuesday (which would have sent immediately).
    expect(update?.[1]?.[1]).toBe("2026-01-13T13:00:00.000Z");
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("runs at most MAX_RUNS_PER_TICK reports a tick, most overdue first, and leaves the rest due", async () => {
    // 25 due schedules, the oldest due date on the highest id.
    const due = Array.from({ length: 25 }, (_, i) => ({
      id: i + 1, name: `r${i}`, created_date: created, updated_stamp: "2026-01-01 00:00:00",
      config: { ...weekly, next_run_at: new Date(Date.UTC(2026, 0, 1, 23 - i)).toISOString(), schedule_signature: scheduleSignature(weekly) },
    }));
    query.mockImplementation(async (sql: string, params: any[]) => {
      if (sql.startsWith(SCAN)) return { rows: params[0] === 0 ? due : [] };
      return { rows: [], rowCount: 0 }; // claim lost: nothing is sent
    });
    const out = await handleRunDueScheduledReports();
    const claims = query.mock.calls.filter(([sql]) => String(sql).includes("RETURNING *"));
    expect(claims).toHaveLength(MAX_RUNS_PER_TICK);
    expect(claims.map(([, p]) => p[0])).toEqual(Array.from({ length: MAX_RUNS_PER_TICK }, (_, i) => 25 - i));
    expect(out.details.deferred).toBe(5);
  });

  it("claims a schedule only if it wasn't edited or switched off, and sends the claimed version", async () => {
    process.env.REPORT_RECIPIENT_DOMAINS = "example.com";
    const cfg = { ...weekly, dataset: "providers", metrics: ["npi"], include_summary: false, include_csv: false, next_run_at: "2026-01-01T08:00:00.000Z", schedule_signature: scheduleSignature(weekly) };
    const scanned = { id: 3, name: "weekly", created_date: created, updated_stamp: "2026-01-01 09:00:00.123456", recipients: ["old@example.com"], config: cfg };
    const fresh = { id: 3, name: "weekly", created_date: created, recipients: ["new@example.com"], config: { ...cfg, next_run_at: "lease" } };
    query.mockImplementation(async (sql: string, params: any[]) => {
      if (sql.startsWith(SCAN)) return { rows: params[0] === 0 ? [scanned] : [] };
      if (sql.includes("RETURNING *")) return { rows: [fresh], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    await handleRunDueScheduledReports();
    const [claimSql, claimParams] = query.mock.calls.find(([sql]) => String(sql).includes("RETURNING *"))!;
    expect(claimSql).toMatch(/updated_date::text IS NOT DISTINCT FROM \$4::text/);
    expect(claimSql).toMatch(/is_active/);
    expect(claimParams[3]).toBe("2026-01-01 09:00:00.123456");
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0]).toMatchObject({ to: "new@example.com" });
  });

  it("Send now leaves the next scheduled run where it was", async () => {
    process.env.REPORT_RECIPIENT_DOMAINS = "example.com";
    const cfg = { ...weekly, dataset: "providers", metrics: ["npi"], include_summary: false, include_csv: false, next_run_at: "2026-01-05T13:00:00.000Z", schedule_signature: scheduleSignature(weekly) };
    query.mockImplementation(async (sql: string) => {
      if (sql.startsWith("SELECT * FROM scheduled_reports WHERE id")) return { rows: [{ id: 4, name: "weekly", created_date: created, recipients: ["a@example.com"], config: cfg }] };
      return { rows: [], rowCount: 1 };
    });
    const out: any = await handleGenerateScheduledReport({ action: "run_single", report_id: 4 }, { role: "admin" });
    expect(out.success).toBe(true);
    const saved = query.mock.calls.find(([sql]) => String(sql).startsWith("UPDATE scheduled_reports SET config = COALESCE(config, '{}'::jsonb) || $2"));
    const patch = JSON.parse(saved![1][1]);
    expect(patch.last_run_status).toBe("success");
    expect(patch).not.toHaveProperty("next_run_at");
    expect(patch).not.toHaveProperty("schedule_signature");
  });

  it("previews the report's own summary, not the first lines of the email", async () => {
    process.env.REPORT_RECIPIENT_DOMAINS = "example.com";
    const cfg = { ...weekly, dataset: "providers", metrics: ["npi"], include_summary: false };
    query.mockImplementation(async (sql: string) => {
      if (sql.startsWith("SELECT * FROM scheduled_reports WHERE id")) return { rows: [{ id: 6, name: "weekly", created_date: created, recipients: ["a@example.com"], config: cfg }] };
      return { rows: [], rowCount: 1 };
    });
    const out: any = await handleGenerateScheduledReport({ action: "preview", report_id: 6 });
    expect(out.preview.summary).toBeNull();
  });
});

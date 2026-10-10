import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { query, sendMail } = vi.hoisted(() => ({ query: vi.fn(), sendMail: vi.fn(async () => ({})) }));
vi.mock("../server/db", () => ({ pool: { query, connect: vi.fn() } }));
vi.mock("../server/lib/mailer", () => ({ getMailerStatus: () => ({ configured: true, missing: [] }), sendMail }));

import { handleRunDueScheduledReports } from "../server/functions/scheduledReports";
import { scheduleSignature } from "../server/lib/reportAggregate";

const created = new Date("2026-01-01T00:00:00Z");
const weekly = { frequency: "weekly", schedule_day: "Monday", schedule_time: "08:00", is_active: true };

beforeEach(() => {
  query.mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-02T12:00:00Z")); // a Friday: the next Monday run is in the future
});
afterEach(() => vi.useRealTimers());

describe("runDueScheduledReports", () => {
  it("pages through every active schedule instead of the first 500", async () => {
    const page1 = Array.from({ length: 500 }, (_, i) => ({ id: i + 1, name: `r${i}`, created_date: created, config: { ...weekly } }));
    const page2 = [{ id: 501, name: "late", created_date: created, config: { ...weekly } }];
    query.mockImplementation(async (sql: string, params: any[]) => {
      if (sql.startsWith("SELECT * FROM scheduled_reports")) return { rows: params[0] === 0 ? page1 : params[0] === 500 ? page2 : [] };
      return { rows: [], rowCount: 1 };
    });
    const out = await handleRunDueScheduledReports();
    expect(out.details.checked).toBe(501);
    const selects = query.mock.calls.filter(([sql]) => String(sql).startsWith("SELECT * FROM scheduled_reports"));
    expect(selects.map(([, p]) => p[0])).toEqual([0, 500]);
  });

  it("stores the next run of a new or edited schedule that isn't due yet", async () => {
    const edited = { ...weekly, schedule_day: "Tuesday", next_run_at: "2026-01-05T13:00:00.000Z", schedule_signature: scheduleSignature(weekly) };
    query.mockImplementation(async (sql: string, params: any[]) => {
      if (sql.startsWith("SELECT * FROM scheduled_reports")) return { rows: params[0] === 0 ? [{ id: 7, name: "x", created_date: created, config: edited }] : [] };
      return { rows: [], rowCount: 1 };
    });
    await handleRunDueScheduledReports();
    const update = query.mock.calls.find(([sql]) => String(sql).startsWith("UPDATE scheduled_reports"));
    expect(update?.[1]).toEqual([7, "2026-01-06T13:00:00.000Z", scheduleSignature({ ...weekly, schedule_day: "Tuesday" }), "2026-01-05T13:00:00.000Z"]);
    expect(sendMail).not.toHaveBeenCalled();
  });
});

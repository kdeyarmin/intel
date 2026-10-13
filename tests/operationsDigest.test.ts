/**
 * The operations digest worker and the stall sweep, against a faked database
 * and mailer: a digest nobody received isn't recorded as sent, platform admins
 * are found by the role or the flag, two overlapping runs can't both send the
 * day's digest, an alert source that can't be read is a failed worker (never
 * "nothing open"), and a batch the sweep fails also settles its dataset's
 * registry row, unless the batch made progress since the sweep looked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  answers: [] as Array<[RegExp, any]>,
  queries: [] as Array<{ sql: string; params?: unknown[] }>,
  inserts: [] as any[],
  updates: [] as any[],
  stalled: [] as any[],
  updateRows: [] as any[][],
  events: [] as string[],
  configured: true,
  sendMail: vi.fn(),
  ended: vi.fn(async () => undefined),
}));

vi.mock("../server/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => h.stalled }) }) }),
    // The sweep updates a batch only while it is still stalled, and learns from RETURNING whether it did.
    update: () => ({ set: (v: unknown) => ({ where: () => ({ returning: async () => {
      const rows = h.updateRows.length ? h.updateRows.shift()! : [{ id: 1 }];
      if (rows.length) h.updates.push(v);
      return rows;
    } }) }) }),
    insert: () => ({ values: async (v: unknown) => { h.events.push("insert"); h.inserts.push(v); } }),
  },
  pool: {
    async query(sql: string, params?: unknown[]) {
      h.queries.push({ sql, params });
      if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql)) h.events.push(sql.split(" ")[0]);
      else if (/pg_try_advisory_xact_lock/.test(sql)) h.events.push("lock");
      else if (/event_type = 'operations_alert'/.test(sql)) h.events.push("check");
      const hit = h.answers.find(([re]) => re.test(sql));
      if (hit && typeof hit[1] === "function") return { rows: hit[1](params) };
      if (hit && hit[1] instanceof Error) throw hit[1];
      return { rows: hit ? hit[1] : [] };
    },
    // The digest check, send and record run on one connection, under a transaction-scoped advisory lock.
    async connect() {
      return { query: (sql: string, params?: unknown[]) => (this as any).query(sql, params), release() {} };
    },
  },
}));
vi.mock("../server/lib/mailer", () => ({ getMailerStatus: () => ({ configured: h.configured, missing: [] }), sendMail: (...a: unknown[]) => { h.events.push("send"); return h.sendMail(...a); } }));
vi.mock("../server/lib/accounts", () => ({ appBaseUrl: () => "https://app.example.com" }));
vi.mock("../server/lib/importProgress", () => ({ endedWithoutFinishing: (...a: unknown[]) => (h.ended as any)(...a), mergeRetryParams: () => ({}) }));

import { runCancelStalledImports, runOperationsAlerts } from "../server/lib/maintenance";

const longAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

beforeEach(() => {
  h.queries.length = 0;
  h.inserts.length = 0;
  h.updates.length = 0;
  h.stalled = [];
  h.updateRows = [];
  h.events.length = 0;
  h.configured = true;
  h.sendMail.mockReset().mockResolvedValue(undefined);
  h.ended.mockClear();
  h.answers = [
    // One open alert: a dataset marked importing for days whose batch is gone.
    [/FROM dataset_versions d/, [{ import_type: "hospital_service_area", source_title: "Hospital Service Area", status: "importing", catalog_modified: null, imported_modified: null, imported_at: null, updated_date: longAgo, batch_status: null, batch_updated: null }]],
    [/maintenance_fanout/, [{ created_date: new Date(), details: { workers: [] } }]],
    [/FROM users/, [{ email: "boss@example.com" }, { email: "second@example.com" }]],
    [/pg_try_advisory_xact_lock/, [{ ok: true }]],
  ];
});

describe("runOperationsAlerts", () => {
  it("emails platform admins (the admin role or the flag) and records the digest once somebody got it", async () => {
    const r = await runOperationsAlerts();
    expect(r).toMatchObject({ ok: true, details: { alerts: 1, recipients: 2, emailed: true } });
    expect(h.sendMail).toHaveBeenCalledTimes(2);
    expect(h.queries.find((q) => /FROM users/.test(q.sql))!.sql).toMatch(/is_platform_admin = true OR role = 'admin'/);
    expect(h.inserts).toHaveLength(1);
    expect(h.inserts[0]).toMatchObject({ event_type: "operations_alert", details: { emailed: 2 } });
  });

  it("records nothing when the digest unable to be emailed to anyone, so the next tick tries again", async () => {
    h.sendMail.mockRejectedValue(new Error("SMTP down"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await runOperationsAlerts();
    warn.mockRestore();
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Unable to email the digest to any recipients: SMTP down/);
    expect(h.inserts).toHaveLength(0);
  });

  it("records it when only some recipients got it", async () => {
    h.sendMail.mockRejectedValueOnce(new Error("mailbox full")).mockResolvedValue(undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await runOperationsAlerts();
    warn.mockRestore();
    expect(r.ok).toBe(true);
    expect(h.inserts[0]).toMatchObject({ details: { emailed: 1 } });
  });

  it("records nothing, and says why, when email isn't configured or nobody is there to receive it", async () => {
    h.configured = false;
    expect(await runOperationsAlerts()).toMatchObject({ ok: true, details: { emailed: false, reason: "email isn't configured" } });
    h.configured = true;
    h.answers = h.answers.filter(([re]) => !re.test("FROM users"));
    expect(await runOperationsAlerts()).toMatchObject({ ok: true, details: { emailed: false, reason: "no platform admin to email" } });
    expect(h.sendMail).not.toHaveBeenCalled();
    expect(h.inserts).toHaveLength(0);
  });

  it("sends at most one digest a day", async () => {
    h.answers.push([/event_type = 'operations_alert'/, [{ created_date: new Date(Date.now() - 3_600_000) }]]);
    const r = await runOperationsAlerts();
    expect(r.details).toMatchObject({ emailed: false, reason: "digest sent today" });
    expect(h.sendMail).not.toHaveBeenCalled();
  });

  it("checks the day's throttle, sends and records under one advisory lock, so overlapping runs can't both send", async () => {
    const r = await runOperationsAlerts();
    expect(r).toMatchObject({ ok: true, details: { emailed: true } });
    // The record is written before the lock is released: a run that gets the lock next sees it.
    expect(h.events).toEqual(["BEGIN", "lock", "check", "send", "send", "insert", "COMMIT"]);
  });

  it("stands down when another run holds the digest lock: nothing sent, nothing recorded, the transaction ended", async () => {
    h.answers = h.answers.filter(([re]) => !/pg_try_advisory_xact_lock/.test(String(re)));
    h.answers.push([/pg_try_advisory_xact_lock/, [{ ok: false }]]);
    const r = await runOperationsAlerts();
    expect(r).toMatchObject({ ok: true, details: { emailed: false, reason: "another run is sending the digest" } });
    expect(h.sendMail).not.toHaveBeenCalled();
    expect(h.inserts).toHaveLength(0);
    expect(h.events).toEqual(["BEGIN", "lock", "ROLLBACK"]);
  });

  it("ends the transaction when the send fails for everyone, and records nothing", async () => {
    h.sendMail.mockRejectedValue(new Error("SMTP down"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await runOperationsAlerts();
    warn.mockRestore();
    expect(h.events.at(-1)).toBe("ROLLBACK");
    expect(h.events).not.toContain("insert");
  });

  it("is a failed worker, not 'nothing open', when an alert source can't be read", async () => {
    // A statement timeout (or any error but a missing table) must not read as "no datasets, no schedules".
    h.answers.unshift([/FROM dataset_versions d/, Object.assign(new Error("canceling statement due to statement timeout"), { code: "57014" })]);
    const r = await runOperationsAlerts();
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/statement timeout/);
    expect(h.sendMail).not.toHaveBeenCalled();
    expect(h.inserts).toHaveLength(0);
  });

  it("is quiet when nothing is open", async () => {
    h.answers = [[/maintenance_fanout/, [{ created_date: new Date(), details: { workers: [] } }]]];
    expect(await runOperationsAlerts()).toMatchObject({ ok: true, details: { alerts: 0, emailed: false } });
  });
});

describe("runCancelStalledImports", () => {
  it("fails a stalled batch and tells the dataset registry and the schedule that started it", async () => {
    h.stalled = [
      { id: 5, import_type: "hospital_service_area", status: "processing", file_name: "hsa.csv" },
      { id: 6, import_type: "nppes_registry", status: "processing", file_name: "crawler_2026" },
    ];
    const r = await runCancelStalledImports();
    expect(r).toMatchObject({ ok: true, details: { scanned: 2, cancelled: 1, skipped_crawler: 1 } });
    // Two intermediate-state settles (pausing->paused, cancelling->cancelled)
    // run before the stall sweep; only the stalled batch fails.
    expect(h.updates).toHaveLength(3);
    const failed = h.updates.filter((u: any) => u.status === "failed");
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({ status: "failed" });
    // The registry would otherwise stay "importing" and hide newer releases of the dataset.
    expect(h.ended).toHaveBeenCalledTimes(1);
    expect(h.ended).toHaveBeenCalledWith("hospital_service_area", 5, "failed", expect.stringMatching(/stalled/));
  });

  it("leaves alone a batch that made progress, finished or was stopped since the sweep looked", async () => {
    h.stalled = [
      { id: 5, import_type: "hospital_service_area", status: "processing", file_name: "hsa.csv" },
      { id: 7, import_type: "cms_order_referring", status: "processing", file_name: "oi.csv" },
    ];
    // The first batch resumed between the scan and its update (the update is conditional on it still being stalled).
    // Two leading entries for the intermediate-state settles, which find nothing.
    h.updateRows = [[], [], [], [{ id: 7 }]];
    const r = await runCancelStalledImports();
    expect(r).toMatchObject({ ok: true, details: { scanned: 2, cancelled: 1, cancelled_batches: [{ id: 7, type: "cms_order_referring" }] } });
    // Its dataset and schedule are not told it failed.
    expect(h.ended).toHaveBeenCalledTimes(1);
    expect(h.ended).toHaveBeenCalledWith("cms_order_referring", 7, "failed", expect.stringMatching(/stalled/));
  });
});

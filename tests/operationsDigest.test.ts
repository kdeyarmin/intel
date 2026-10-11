/**
 * The operations digest worker and the stall sweep, against a faked database
 * and mailer: a digest nobody received isn't recorded as sent, platform admins
 * are found by the role or the flag, and a batch the sweep fails also settles
 * its dataset's registry row.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  answers: [] as Array<[RegExp, any]>,
  queries: [] as Array<{ sql: string; params?: unknown[] }>,
  inserts: [] as any[],
  updates: [] as any[],
  stalled: [] as any[],
  configured: true,
  sendMail: vi.fn(),
  ended: vi.fn(async () => undefined),
}));

vi.mock("../server/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => h.stalled }) }) }),
    update: () => ({ set: (v: unknown) => ({ where: async () => { h.updates.push(v); } }) }),
    insert: () => ({ values: async (v: unknown) => { h.inserts.push(v); } }),
  },
  pool: {
    async query(sql: string, params?: unknown[]) {
      h.queries.push({ sql, params });
      const hit = h.answers.find(([re]) => re.test(sql));
      return { rows: hit ? (typeof hit[1] === "function" ? hit[1](params) : hit[1]) : [] };
    },
  },
}));
vi.mock("../server/lib/mailer", () => ({ getMailerStatus: () => ({ configured: h.configured, missing: [] }), sendMail: (...a: unknown[]) => h.sendMail(...a) }));
vi.mock("../server/lib/accounts", () => ({ appBaseUrl: () => "https://app.example.com" }));
vi.mock("../server/lib/importProgress", () => ({ endedWithoutFinishing: (...a: unknown[]) => (h.ended as any)(...a), mergeRetryParams: () => ({}) }));

import { runCancelStalledImports, runOperationsAlerts } from "../server/lib/maintenance";

const longAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

beforeEach(() => {
  h.queries.length = 0;
  h.inserts.length = 0;
  h.updates.length = 0;
  h.stalled = [];
  h.configured = true;
  h.sendMail.mockReset().mockResolvedValue(undefined);
  h.ended.mockClear();
  h.answers = [
    // One open alert: a dataset marked importing for days whose batch is gone.
    [/FROM dataset_versions d/, [{ import_type: "hospital_service_area", source_title: "Hospital Service Area", status: "importing", catalog_modified: null, imported_modified: null, imported_at: null, updated_date: longAgo, batch_status: null, batch_updated: null }]],
    [/maintenance_fanout/, [{ created_date: new Date(), details: { workers: [] } }]],
    [/FROM users/, [{ email: "boss@example.com" }, { email: "second@example.com" }]],
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

  it("records nothing when the digest couldn't be emailed to anyone, so the next tick tries again", async () => {
    h.sendMail.mockRejectedValue(new Error("SMTP down"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await runOperationsAlerts();
    warn.mockRestore();
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/couldn't be emailed to anyone: SMTP down/);
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
    expect(h.updates).toHaveLength(1);
    expect(h.updates[0]).toMatchObject({ status: "failed" });
    // The registry would otherwise stay "importing" and hide newer releases of the dataset.
    expect(h.ended).toHaveBeenCalledTimes(1);
    expect(h.ended).toHaveBeenCalledWith("hospital_service_area", 5, "failed", expect.stringMatching(/stalled/));
  });
});

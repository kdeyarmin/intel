/**
 * Asking for an import of a type that already has one running fails the running one only when it has been
 * quiet for as long as the stall sweep waits (two hours), not at one: a healthy import can be silent that
 * long while a very large page is written.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ active: [] as any[], updates: [] as any[] }));

vi.mock("../server/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: async () => h.active }) }),
    update: () => ({ set: (v: unknown) => ({ where: async () => { h.updates.push(v); } }) }),
    // Past the guard the import would insert its batch; the test stops there.
    transaction: async () => { throw new Error("past the guard"); },
  },
  pool: {},
}));
vi.mock("../server/lib/datasetRegistry", () => ({
  resolveImportVersion: async () => null,
  markImportStarted: async () => undefined,
  markImportFinished: async () => undefined,
}));

import { handleTriggerImport } from "../server/functions/triggerImport";

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);
const running = (quietMinutes: number) => [{ id: 5, status: "processing", file_name: "cms_cms_order_referring_2024", updated_date: minutesAgo(quietMinutes), created_date: minutesAgo(600) }];

beforeEach(() => {
  h.active = [];
  h.updates.length = 0;
});

describe("the active-import guard", () => {
  it("leaves an import that has been quiet for 90 minutes alone, and answers that it is in progress", async () => {
    h.active = running(90);
    await expect(handleTriggerImport({ import_type: "cms_order_referring" }, { role: "admin" })).rejects.toMatchObject({ status: 409, conflict: true, existing_batch_id: 5 });
    expect(h.updates).toHaveLength(0);
  });

  it("fails one that has been quiet for three hours, as the sweep would, and carries on", async () => {
    h.active = running(180);
    await expect(handleTriggerImport({ import_type: "cms_order_referring" }, { role: "admin" })).rejects.toThrow("past the guard");
    expect(h.updates).toHaveLength(1);
    expect(h.updates[0]).toMatchObject({ status: "failed", cancel_reason: expect.stringMatching(/stuck in "processing"/) });
  });
});

/** recordAudit writes the organization an event belongs to (owners read their organization's events). */
import { beforeEach, describe, expect, it, vi } from "vitest";

const values = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("../server/db", () => ({ db: { insert: () => ({ values }) }, pool: {} }));

import { recordAudit } from "../server/lib/audit";

beforeEach(() => values.mockClear());

describe("recordAudit", () => {
  it("stores the organization of the event", async () => {
    await recordAudit({ event_type: "billing", action: "plan_changed", user_email: "owner@riverbend.org", entity_type: "Organization", entity_id: 2, details: { to: "state" }, org_id: 2 });
    expect(values).toHaveBeenCalledTimes(1);
    expect((values.mock.calls[0] as unknown[])[0]).toMatchObject({ event_type: "billing", action: "plan_changed", entity_id: "2", org_id: 2, details: { to: "state" } });
  });

  it("stores no organization for a platform event, never undefined", async () => {
    await recordAudit({ event_type: "maintenance_fanout", user_email: null });
    const row = (values.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(row.org_id).toBeNull();
    expect(row.user_email).toBe("anonymous");
  });

  it("never throws when the insert fails", async () => {
    values.mockRejectedValueOnce(new Error("db down"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(recordAudit({ event_type: "x", user_email: "a@b.c", org_id: 1 })).resolves.toBeUndefined();
    warn.mockRestore();
  });
});

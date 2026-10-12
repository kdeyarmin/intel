/**
 * The NPPES file import checks for a pause or cancel only every few pages, so completing the batch has to be
 * conditional on it still not being paused or cancelled: "completed" must never overwrite a stop.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ matched: [{ id: 5 }] as any[], sets: [] as any[], wheres: 0 }));

vi.mock("../server/db", () => ({
  db: {
    update: () => ({ set: (v: unknown) => { h.sets.push(v); return { where: () => { h.wheres += 1; return { returning: async () => h.matched }; } }; } }),
  },
  pool: {},
}));

import { completeUnlessStopped } from "../server/functions/importNPPESFile";

beforeEach(() => { h.matched = [{ id: 5 }]; h.sets.length = 0; h.wheres = 0; });

describe("completeUnlessStopped", () => {
  it("marks the batch completed with the values it is given", async () => {
    expect(await completeUnlessStopped(5, { imported_rows: 100, skipped_rows: 2 })).toBe(true);
    expect(h.sets[0]).toMatchObject({ imported_rows: 100, skipped_rows: 2, status: "completed" });
  });

  it("reports false, having changed nothing, when the user paused or cancelled it since the last check", async () => {
    h.matched = []; // the update is conditional on the status not being paused/cancelled, and matched no row
    expect(await completeUnlessStopped(5, { imported_rows: 100 })).toBe(false);
    expect(h.wheres).toBe(1);
  });

  it("can't be talked into another status by the values it is given", async () => {
    await completeUnlessStopped(5, { status: "failed" });
    expect(h.sets[0].status).toBe("completed");
  });
});

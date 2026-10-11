/**
 * The one maintenance fan-out runs every worker the docs and the Health panel
 * name. A worker that is defined but not registered never runs.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../server/db", () => ({ db: {}, pool: {} }));

import { FANOUT_WORKERS } from "../server/lib/maintenance";

describe("FANOUT_WORKERS", () => {
  it("registers each worker, including the weekly lead scoring refresh", () => {
    expect(FANOUT_WORKERS.map((w) => w.name)).toEqual(expect.arrayContaining([
      "settleScheduledImports",
      "checkCmsCatalog",
      "autoResumePausedImports",
      "autoRetryFailedImports",
      "manageCrawlerRetries",
      "cancelStalledImports",
      "runDueScheduledReports",
      "refreshRollups",
      "refreshLeadScores",
    ]));
  });

  it("registers a worker once", () => {
    const names = FANOUT_WORKERS.map((w) => w.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

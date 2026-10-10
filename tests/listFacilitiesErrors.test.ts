/**
 * handleListFacilities: a database outage must surface as an error (so the
 * Facilities page shows its error state), not as an empty list.
 */
import { describe, it, expect, vi } from "vitest";

const queries = vi.hoisted(() => ({ fail: true }));

vi.mock("../server/db", () => ({
  db: {},
  pool: {
    connect: async () => ({
      query: async (sql: string) => {
        if (/^\s*(SET|RESET)/i.test(sql)) return { rows: [] };
        if (queries.fail) throw new Error("canceling statement due to statement timeout");
        return { rows: [] };
      },
      release: () => {},
    }),
  },
}));

import { handleListFacilities } from "../server/functions/facilityDetail";

describe("handleListFacilities", () => {
  it("throws a 503 when the listing queries fail", async () => {
    queries.fail = true;
    await expect(handleListFacilities({ facility_group: "hospital" })).rejects.toMatchObject({ status: 503 });
  });

  it("returns an empty list when the table really has nothing", async () => {
    queries.fail = false;
    await expect(handleListFacilities({ facility_group: "hospice" })).resolves.toMatchObject({ facilities: [] });
  });
});

/**
 * The crawler puts items stuck in 'processing' back to pending. It must do so in one statement that re-checks the
 * item's status and age as it writes: a read followed by a write by id would put an item a sibling worker just
 * completed back in the queue, and the work would run twice.
 */
import { describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";

vi.mock("../server/db", () => ({ db: {}, pool: {} }));

import { requeueStuckItems } from "../server/functions/nppesCrawler";

const NOW = Date.parse("2026-10-12T12:00:00.000Z");
const query = () => requeueStuckItems(drizzle.mock() as any, NOW).toSQL();

describe("requeueStuckItems", () => {
  it("is a single UPDATE that only touches an item still processing and stale at the moment it writes", () => {
    const { sql, params } = query();
    expect(sql).toMatch(/^update "nppes_queue_items" set /);
    expect(sql).toMatch(/where \("nppes_queue_items"\."status" = \$\d and "nppes_queue_items"\."updated_date" < \$\d\)/);
    // The status it must still have, and the cutoff: ten minutes before now.
    expect(params).toContain("processing");
    expect(params).toContain(new Date(NOW - 10 * 60_000).toISOString());
  });

  it("counts the retry in the database and returns only the rows it changed", () => {
    const { sql, params } = query();
    expect(sql).toContain('"retry_count" = COALESCE("nppes_queue_items"."retry_count", 0) + 1');
    expect(sql).toMatch(/returning "id"$/);
    expect(params).toContain("pending");
    expect(params).toContain(new Date(NOW).toISOString());
  });
});

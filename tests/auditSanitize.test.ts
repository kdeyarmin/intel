import { describe, it, expect, vi } from "vitest";

vi.mock("../server/db", () => ({ db: {}, pool: {} }));

import { sanitizeClientDetails } from "../server/lib/audit";

describe("sanitizeClientDetails", () => {
  it("keeps small, plain details", () => {
    expect(sanitizeClientDetails({ action: "Exported", count: 3 })).toEqual({ action: "Exported", count: 3 });
    expect(sanitizeClientDetails([1, 2])).toEqual({});
  });

  it("bounds oversized details, including the action it keeps", () => {
    const out = sanitizeClientDetails({ action: "x".repeat(5_000_000), blob: "y".repeat(10_000) });
    expect(out).toEqual({ truncated: true, action: "x".repeat(200) });
    expect(sanitizeClientDetails({ action: { nested: "z".repeat(10_000) } })).toEqual({ truncated: true, action: null });
  });
});

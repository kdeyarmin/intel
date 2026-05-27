import { describe, it, expect } from "vitest";
import { consumeToken } from "../server/middleware/rateLimit";

describe("consumeToken", () => {
  it("allows up to `max` actions then blocks within the window", () => {
    const key = `t1-${Math.random()}`;
    expect(consumeToken(key, 3, 10_000)).toBe(true);
    expect(consumeToken(key, 3, 10_000)).toBe(true);
    expect(consumeToken(key, 3, 10_000)).toBe(true);
    expect(consumeToken(key, 3, 10_000)).toBe(false); // 4th exceeds max
    expect(consumeToken(key, 3, 10_000)).toBe(false);
  });

  it("tracks separate keys independently", () => {
    const a = `a-${Math.random()}`;
    const b = `b-${Math.random()}`;
    expect(consumeToken(a, 1, 10_000)).toBe(true);
    expect(consumeToken(a, 1, 10_000)).toBe(false);
    // b has its own bucket and is unaffected by a being exhausted.
    expect(consumeToken(b, 1, 10_000)).toBe(true);
  });

  it("resets after the window elapses", async () => {
    const key = `reset-${Math.random()}`;
    expect(consumeToken(key, 1, 20)).toBe(true);
    expect(consumeToken(key, 1, 20)).toBe(false);
    await new Promise((r) => setTimeout(r, 35));
    expect(consumeToken(key, 1, 20)).toBe(true); // window expired -> fresh bucket
  });
});

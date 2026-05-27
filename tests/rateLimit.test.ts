import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// consumeToken relies on Date.now() for bucket expiry. We use vi.useFakeTimers()
// to control the clock and get deterministic results without real time passing.
// We also re-import the module after each describe to reset the module-level
// bucket Map and lastSweep state.

describe("consumeToken – basic window behaviour", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  it("allows the first request under the limit", async () => {
    const { consumeToken } = await import("../server/middleware/rateLimit");
    expect(consumeToken("scope:user:ip", 5, 60_000)).toBe(true);
  });

  it("allows requests up to (and including) the max", async () => {
    const { consumeToken } = await import("../server/middleware/rateLimit");
    const key = "scope:u1:127.0.0.1";
    for (let i = 0; i < 3; i++) {
      expect(consumeToken(key, 3, 60_000), `call ${i + 1}`).toBe(true);
    }
  });

  it("blocks the request that would exceed the max", async () => {
    const { consumeToken } = await import("../server/middleware/rateLimit");
    const key = "test:u2:10.0.0.1";
    for (let i = 0; i < 2; i++) consumeToken(key, 2, 60_000);
    expect(consumeToken(key, 2, 60_000)).toBe(false);
  });

  it("allows a new request after the window resets", async () => {
    const { consumeToken } = await import("../server/middleware/rateLimit");
    const key = "test:u3:10.0.0.2";
    consumeToken(key, 1, 10_000);
    expect(consumeToken(key, 1, 10_000)).toBe(false); // exhausted

    // Advance past the window
    vi.advanceTimersByTime(10_001);
    expect(consumeToken(key, 1, 10_000)).toBe(true); // fresh window
  });

  it("keeps independent counters for different keys", async () => {
    const { consumeToken } = await import("../server/middleware/rateLimit");
    const keyA = "scope:uA:1.1.1.1";
    const keyB = "scope:uB:2.2.2.2";
    consumeToken(keyA, 1, 60_000);
    expect(consumeToken(keyA, 1, 60_000)).toBe(false); // A exhausted
    expect(consumeToken(keyB, 1, 60_000)).toBe(true);  // B unaffected
  });

  it("does not count a blocked request against the limit", async () => {
    const { consumeToken } = await import("../server/middleware/rateLimit");
    const key = "test:u4:3.3.3.3";
    consumeToken(key, 2, 60_000);
    consumeToken(key, 2, 60_000); // now at max
    // multiple blocked calls
    expect(consumeToken(key, 2, 60_000)).toBe(false);
    expect(consumeToken(key, 2, 60_000)).toBe(false);
    // After reset the counter starts fresh
    vi.advanceTimersByTime(60_001);
    expect(consumeToken(key, 2, 60_000)).toBe(true);
  });

  it("max=1 allows exactly one request per window", async () => {
    const { consumeToken } = await import("../server/middleware/rateLimit");
    const key = "tight:u5:4.4.4.4";
    expect(consumeToken(key, 1, 1_000)).toBe(true);
    expect(consumeToken(key, 1, 1_000)).toBe(false);
    vi.advanceTimersByTime(1_001);
    expect(consumeToken(key, 1, 1_000)).toBe(true);
  });
});

describe("consumeToken – bucket expiry at exact boundary", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000); // arbitrary non-zero start
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  it("bucket is still active at windowMs - 1 ms", async () => {
    const { consumeToken } = await import("../server/middleware/rateLimit");
    const key = "boundary:u6:5.5.5.5";
    consumeToken(key, 1, 10_000); // exhausted
    vi.advanceTimersByTime(9_999); // just before reset
    expect(consumeToken(key, 1, 10_000)).toBe(false);
  });

  it("bucket expires at exactly resetAt", async () => {
    const { consumeToken } = await import("../server/middleware/rateLimit");
    const key = "boundary:u7:6.6.6.6";
    consumeToken(key, 1, 10_000); // exhausted at t=0, resets at t=10_000
    vi.advanceTimersByTime(10_000); // now at exact resetAt
    // resetAt <= now → bucket is stale → new window starts
    expect(consumeToken(key, 1, 10_000)).toBe(true);
  });
});

describe("consumeToken – sweep removes stale buckets", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  it("still works after the sweep interval elapses", async () => {
    const { consumeToken } = await import("../server/middleware/rateLimit");
    const key = "sweep:u8:7.7.7.7";
    consumeToken(key, 5, 60_000);
    // advance > 60 s to trigger the sweep logic
    vi.advanceTimersByTime(70_000);
    // The sweep should have no observable side-effect other than clearing stale entries.
    // A new call must succeed because the bucket expired.
    expect(consumeToken(key, 5, 60_000)).toBe(true);
  });
});

describe("consumeToken – high-volume accumulation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  it("correctly counts 100 rapid requests against a 50-request limit", async () => {
    const { consumeToken } = await import("../server/middleware/rateLimit");
    const key = "flood:u9:8.8.8.8";
    let allowed = 0;
    let blocked = 0;
    for (let i = 0; i < 100; i++) {
      if (consumeToken(key, 50, 60_000)) allowed++;
      else blocked++;
    }
    expect(allowed).toBe(50);
    expect(blocked).toBe(50);
  });
});

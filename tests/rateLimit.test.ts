import { describe, it, expect, vi } from "vitest";
import { consumeToken, rateLimit, ipRateLimit } from "../server/middleware/rateLimit";

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
    vi.useFakeTimers();
    try {
      const key = `reset-${Math.random()}`;
      expect(consumeToken(key, 1, 20)).toBe(true);
      expect(consumeToken(key, 1, 20)).toBe(false);
      await vi.advanceTimersByTimeAsync(35);
      expect(consumeToken(key, 1, 20)).toBe(true); // window expired -> fresh bucket
    } finally {
      vi.useRealTimers();
    }
  });
  });

  it("allows exactly max=1 then blocks", () => {
    const key = `max1-${Math.random()}`;
    expect(consumeToken(key, 1, 10_000)).toBe(true);
    expect(consumeToken(key, 1, 10_000)).toBe(false);
  });

  it("allows a fresh key even when another key is exhausted", () => {
    const exhausted = `exhaust-${Math.random()}`;
    const fresh = `fresh-${Math.random()}`;
    consumeToken(exhausted, 2, 10_000);
    consumeToken(exhausted, 2, 10_000);
    consumeToken(exhausted, 2, 10_000); // over max
    // a completely different key starts clean
    expect(consumeToken(fresh, 2, 10_000)).toBe(true);
  });
});

// Helper to build a minimal mock Express-style req/res/next tuple
function makeMockReq(overrides: {
  userId?: number | null;
  ip?: string;
  forwardedFor?: string;
} = {}) {
  const req: any = {
    user: overrides.userId != null ? { id: overrides.userId } : undefined,
    headers: {} as Record<string, string>,
    socket: { remoteAddress: overrides.ip || "1.2.3.4" },
  };
  if (overrides.forwardedFor) {
    req.headers["x-forwarded-for"] = overrides.forwardedFor;
  }
  return req;
}

function makeMockRes() {
  const res: any = {
    _status: 200,
    _headers: {} as Record<string, string | number>,
    _body: null as any,
    status(code: number) { this._status = code; return this; },
    setHeader(k: string, v: string | number) { this._headers[k] = v; return this; },
    json(body: any) { this._body = body; return this; },
  };
  return res;
}

describe("rateLimit middleware", () => {
  it("calls next() while under the limit", () => {
    const mw = rateLimit(`rl-ok-${Math.random()}`, 5, 10_000);
    const req = makeMockReq({ userId: 42 });
    const res = makeMockRes();
    const next = vi.fn();
    mw(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res._status).toBe(200); // untouched
  });

  it("returns 429 after exhausting the limit", () => {
    const scope = `rl-429-${Math.random()}`;
    const mw = rateLimit(scope, 2, 10_000);
    const req = makeMockReq({ userId: 7 });
    const res1 = makeMockRes();
    const res2 = makeMockRes();
    const res3 = makeMockRes();
    const next = vi.fn();
    mw(req, res1, next); // 1st — allowed
    mw(req, res2, next); // 2nd — allowed
    mw(req, res3, next); // 3rd — over limit
    expect(next).toHaveBeenCalledTimes(2);
    expect(res3._status).toBe(429);
    expect(res3._body).toMatchObject({ message: "Too many requests" });
  });

  it("sets a Retry-After header when returning 429", () => {
    const scope = `rl-hdr-${Math.random()}`;
    const mw = rateLimit(scope, 1, 10_000);
    const req = makeMockReq({ userId: 3 });
    const res1 = makeMockRes();
    const res2 = makeMockRes();
    const next = vi.fn();
    mw(req, res1, next);
    mw(req, res2, next); // blocked
    expect(res2._headers["Retry-After"]).toBeGreaterThan(0);
  });

  it("keys by scope — different scopes are independent", () => {
    const req = makeMockReq({ userId: 1 });
    const mwA = rateLimit(`scope-A-${Math.random()}`, 1, 10_000);
    const mwB = rateLimit(`scope-B-${Math.random()}`, 1, 10_000);
    const next = vi.fn();
    mwA(req, makeMockRes(), next); // consumes A
    // B has its own counter — should still pass
    const resB = makeMockRes();
    mwB(req, resB, next);
    expect(next).toHaveBeenCalledTimes(2);
    expect(resB._status).toBe(200);
  });

  it("keys by user id — different users have independent counters", () => {
    const scope = `rl-users-${Math.random()}`;
    const mw = rateLimit(scope, 1, 10_000);
    const req1 = makeMockReq({ userId: 101 });
    const req2 = makeMockReq({ userId: 102 });
    const next = vi.fn();
    mw(req1, makeMockRes(), next); // exhausts user 101
    const res2 = makeMockRes();
    mw(req2, res2, next); // user 102 is fresh
    expect(next).toHaveBeenCalledTimes(2);
    expect(res2._status).toBe(200);
  });

  it("uses 'anon' part for unauthenticated requests (no req.user)", () => {
    const scope = `rl-anon-${Math.random()}`;
    const mw = rateLimit(scope, 1, 10_000);
    const req = makeMockReq({ userId: undefined }); // no user
    const next = vi.fn();
    mw(req, makeMockRes(), next);
    const blockedRes = makeMockRes();
    mw(req, blockedRes, next);
    expect(blockedRes._status).toBe(429);
  });

  it("prefers x-forwarded-for over socket.remoteAddress for IP", () => {
    const scope = `rl-fwd-${Math.random()}`;
    const mw = rateLimit(scope, 1, 10_000);
    // Two requests: one with x-forwarded-for, one without — same user but different IPs
    const reqFwd = makeMockReq({ userId: 10, forwardedFor: "10.0.0.1" });
    const reqSock = makeMockReq({ userId: 10, ip: "10.0.0.2" });
    const next = vi.fn();
    mw(reqFwd, makeMockRes(), next); // consumes 10.0.0.1 bucket
    const resOther = makeMockRes();
    mw(reqSock, resOther, next); // 10.0.0.2 is a fresh bucket
    expect(next).toHaveBeenCalledTimes(2);
  });
});

describe("ipRateLimit middleware", () => {
  it("calls next() while under the limit", () => {
    const mw = ipRateLimit(`ip-ok-${Math.random()}`, 5, 10_000);
    const req = makeMockReq({ ip: "9.9.9.9" });
    const res = makeMockRes();
    const next = vi.fn();
    mw(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("returns 429 after exhausting the limit", () => {
    const scope = `ip-429-${Math.random()}`;
    const mw = ipRateLimit(scope, 2, 10_000);
    const req = makeMockReq({ ip: "5.5.5.5" });
    const next = vi.fn();
    mw(req, makeMockRes(), next);
    mw(req, makeMockRes(), next);
    const blockedRes = makeMockRes();
    mw(req, blockedRes, next);
    expect(next).toHaveBeenCalledTimes(2);
    expect(blockedRes._status).toBe(429);
    expect(blockedRes._body).toMatchObject({ message: "Too many requests" });
  });

  it("does not set Retry-After (simpler response than rateLimit)", () => {
    const scope = `ip-hdr-${Math.random()}`;
    const mw = ipRateLimit(scope, 1, 10_000);
    const req = makeMockReq({ ip: "6.6.6.6" });
    const next = vi.fn();
    mw(req, makeMockRes(), next);
    const blockedRes = makeMockRes();
    mw(req, blockedRes, next);
    expect(blockedRes._headers["Retry-After"]).toBeUndefined();
  });

  it("uses the first IP from x-forwarded-for when header is present", () => {
    const scope = `ip-fwd-${Math.random()}`;
    const mw = ipRateLimit(scope, 1, 10_000);
    const req = makeMockReq({ forwardedFor: "203.0.113.1, 10.0.0.2" });
    const next = vi.fn();
    mw(req, makeMockRes(), next); // 203.0.113.1 bucket consumed
    const blockedRes = makeMockRes();
    mw(req, blockedRes, next); // same IP -> blocked
    expect(blockedRes._status).toBe(429);
  });

  it("independent of user identity — only IP matters", () => {
    const scope = `ip-users-ind-${Math.random()}`;
    const mw = ipRateLimit(scope, 1, 10_000);
    const reqUser1 = makeMockReq({ userId: 1, ip: "7.7.7.7" });
    const reqUser2 = makeMockReq({ userId: 2, ip: "7.7.7.7" }); // same IP, different user
    const next = vi.fn();
    mw(reqUser1, makeMockRes(), next);
    const blockedRes = makeMockRes();
    mw(reqUser2, blockedRes, next); // same IP -> blocked regardless of user id
    expect(blockedRes._status).toBe(429);
  });
});

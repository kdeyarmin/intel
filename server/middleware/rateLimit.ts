import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth";

// Lightweight in-memory rate limiter. Keyed by an arbitrary string (IP, user id,
// or a combination). This is per-process — adequate for a single instance. If the
// app is ever scaled horizontally this should move to Redis or a shared store.

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

// Periodically drop expired buckets so the map can't grow unbounded.
let lastSweep = Date.now();
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
}

/**
 * Returns true if the action is allowed, false if the caller has exceeded
 * `max` actions within `windowMs`.
 */
export function consumeToken(key: string, max: number, windowMs: number): boolean {
  return consumeTokenState(key, max, windowMs).allowed;
}

function consumeTokenState(key: string, max: number, windowMs: number): { allowed: boolean; retryMs: number } {
  const now = Date.now();
  sweep(now);
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryMs: 0 };
  }
  if (existing.count >= max) {
    return { allowed: false, retryMs: Math.max(existing.resetAt - now, 0) };
  }
  existing.count++;
  return { allowed: true, retryMs: 0 };
}

/**
 * The caller's address. `req.ip` honours Express's "trust proxy" setting
 * (TRUST_PROXY, see server/index.ts), so a client can only spoof it as far as
 * that setting allows.
 */
export function clientIp(req: { ip?: string; socket?: { remoteAddress?: string } }): string {
  return req.ip || req.socket?.remoteAddress || "noip";
}

function clientKey(req: AuthRequest, scope: string): string {
  const userPart = req.user?.id != null ? `u${req.user.id}` : "anon";
  return `${scope}:${userPart}:${clientIp(req)}`;
}

/**
 * Express middleware factory. Limits a route to `max` requests per `windowMs`
 * per client (user id + IP). `scope` keeps independent counters per route group.
 */
export function rateLimit(scope: string, max: number, windowMs: number) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const key = clientKey(req, scope);
    const { allowed, retryMs } = consumeTokenState(key, max, windowMs);
    if (!allowed) {
      res.setHeader("Retry-After", Math.ceil(Math.max(retryMs, 0) / 1000));
      return res.status(429).json({
        message: "Too many requests",
        detail: "Rate limit exceeded. Please slow down and try again shortly.",
      });
    }
    next();
  };
}

// IP-only key for unauthenticated routes (login/signup).
export function ipRateLimit(scope: string, max: number, windowMs: number) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const key = `${scope}:${clientIp(req)}`;
    if (!consumeToken(key, max, windowMs)) {
      return res.status(429).json({
        message: "Too many requests",
        detail: "Too many attempts. Please wait a moment and try again.",
      });
    }
    next();
  };
}

/**
 * Counts failures per key (e.g. per email address for logins) without
 * counting successes, so many people behind one address aren't throttled
 * while a password is being guessed from many addresses.
 */
export function createFailureCounter(max: number, windowMs: number, maxKeys = 50_000) {
  const failures = new Map<string, Bucket>();
  // Keep the map bounded without ever forgetting a lockout while anything else
  // can go: expired entries first, then the oldest keys that aren't locked
  // (spraying new keys only evicts other unlocked keys), and only then, if
  // every entry is a lockout, the oldest lockouts.
  const prune = (now: number) => {
    for (const [k, b] of failures) if (b.resetAt <= now) failures.delete(k);
    const target = Math.floor(maxKeys * 0.9);
    for (const [k, b] of failures) {
      if (failures.size <= target) return;
      if (b.count < max) failures.delete(k);
    }
    for (const k of failures.keys()) {
      if (failures.size <= target) return;
      failures.delete(k);
    }
  };
  const live = (key: string, now: number) => {
    const b = failures.get(key);
    if (b && b.resetAt <= now) {
      failures.delete(key);
      return undefined;
    }
    return b;
  };
  return {
    /** Milliseconds until `key` may try again, or 0 when it isn't locked. */
    lockedFor(key: string): number {
      const now = Date.now();
      const b = live(key, now);
      return b && b.count >= max ? b.resetAt - now : 0;
    },
    fail(key: string) {
      const now = Date.now();
      if (failures.size >= maxKeys && !failures.has(key)) prune(now);
      const b = live(key, now);
      if (b) b.count += 1;
      else failures.set(key, { count: 1, resetAt: now + windowMs });
    },
    clear(key: string) {
      failures.delete(key);
    },
  };
}

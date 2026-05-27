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
  const now = Date.now();
  sweep(now);
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (existing.count >= max) return false;
  existing.count++;
  return true;
}

function clientKey(req: AuthRequest, scope: string): string {
  const userPart = req.user?.id != null ? `u${req.user.id}` : "anon";
  const ipPart =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "noip";
  return `${scope}:${userPart}:${ipPart}`;
}

/**
 * Express middleware factory. Limits a route to `max` requests per `windowMs`
 * per client (user id + IP). `scope` keeps independent counters per route group.
 */
export function rateLimit(scope: string, max: number, windowMs: number) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const key = clientKey(req, scope);
    if (!consumeToken(key, max, windowMs)) {
      const retryMs = buckets.get(key)?.resetAt ? buckets.get(key)!.resetAt - Date.now() : windowMs;
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
    const ipPart =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      "noip";
    const key = `${scope}:${ipPart}`;
    if (!consumeToken(key, max, windowMs)) {
      return res.status(429).json({
        message: "Too many requests",
        detail: "Too many attempts. Please wait a moment and try again.",
      });
    }
    next();
  };
}

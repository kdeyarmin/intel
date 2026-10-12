// Per-user limits checked before a turn starts. Requests per minute are
// in-memory (per process, like the other rate limits); the daily token budget
// is in the database so it holds across restarts and instances.
import { consumeToken } from "../../middleware/rateLimit";
import { ASSISTANT_CONFIG } from "./config";
import type { AssistantStore } from "./store";

export type QuotaCheck = { ok: true; usedToday: number } | { ok: false; status: 429; message: string; retryAfterSec: number };

function secondsUntilUtcMidnight(now: Date): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(60, Math.ceil((next - now.getTime()) / 1000));
}

export async function checkQuota(store: AssistantStore, userId: number, now = new Date()): Promise<QuotaCheck> {
  const usedToday = await store.usageToday(userId);
  if (usedToday >= ASSISTANT_CONFIG.dailyTokenBudget) {
    return {
      ok: false,
      status: 429,
      message: "You've reached today's assistant usage limit. It resets at midnight UTC.",
      retryAfterSec: secondsUntilUtcMidnight(now),
    };
  }
  // consumeToken is in-memory per process: a second server instance has its own
  // bucket, so this per-minute limit is approximate under horizontal scaling
  // (the daily token budget above is in the database and holds everywhere).
  if (!consumeToken(`assistant:${userId}`, ASSISTANT_CONFIG.requestsPerMinute, 60_000)) {
    return { ok: false, status: 429, message: "You're sending questions faster than the assistant allows. Wait a minute and try again.", retryAfterSec: 60 };
  }
  return { ok: true, usedToday };
}

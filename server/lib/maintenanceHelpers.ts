// Pure helpers for the maintenance workers. Mirrors the logic in
// base44/functions/autoRetryFailedImports/helpers.ts so it can be unit-tested
// from Node without the Deno serve handler.
//
// As we wind base44 down, the canonical implementation lives here. The base44
// copy can be deleted alongside the rest of base44/ in a follow-up PR once
// Express parity is signed off in prod.

export const MAX_AUTO_RETRY_ATTEMPTS = 3;
export const RETRY_BACKOFF_CAP_HOURS = 24;
export const RETRY_LOOKBACK_MS = 48 * 60 * 60 * 1000;
export const MAX_AUTO_RESUMES = 5;

// Patterns that mark a failure as transient. Matches the keyword sets on the
// retryable: true categories in src/components/imports/errorCategories.jsx
// (timeout_stall, network_api). The two lists must stay in sync.
export const RETRYABLE_KEYWORDS = [
  "timeout", "timed out", "stalled", "exceeded", "too long", "abort", "execution time", "inactivity",
  "http 5", "rate limit", "rate-limit", "rate_limit",
  "fetch", "network", "connection", "econnrefused", "socket",
];

// Match retryable HTTP status codes only in an HTTP/status context, so
// unrelated numeric references like "row 500" don't trigger auto-retries.
export const RETRYABLE_STATUS_CODE_PATTERN =
  /\b(?:http(?:\/\d(?:\.\d)?)?|status(?:\s+code)?|response(?:\s+status)?)\D*(?:429|500|503)\b|\b(?:429\s+too many requests|500\s+internal server error|503\s+service unavailable)\b/;

export function isRetryableErrorMessage(msg: string | null | undefined): boolean {
  if (!msg) return false;
  const lower = String(msg).toLowerCase();
  return RETRYABLE_KEYWORDS.some(kw => lower.includes(kw))
    || RETRYABLE_STATUS_CODE_PATTERN.test(lower);
}

function normalizeErrorText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

// Pull the most actionable error string out of a batch. Prefer cancel_reason,
// then fall back to the most recent error_samples entry's `detail` or `message`.
export function extractErrorMessage(batch: Record<string, unknown>): string {
  const cancelReason = normalizeErrorText(batch.cancel_reason);
  if (cancelReason) return cancelReason;
  const samples = batch.error_samples;
  if (Array.isArray(samples) && samples.length > 0) {
    const last = samples[samples.length - 1] as Record<string, unknown> | undefined;
    if (last) {
      const detail = normalizeErrorText(last.detail);
      if (detail) return detail;
      const message = normalizeErrorText(last.message);
      if (message) return message;
    }
  }
  return "";
}

export function getRetryAttemptCount(batch: Record<string, unknown>): number {
  const params = batch.retry_params as Record<string, unknown> | undefined;
  const autoRetryCount = params?.auto_retry_count;
  const topLevelRetryCount = batch.retry_count;
  const parsedAuto = typeof autoRetryCount === "number" && autoRetryCount >= 0 ? autoRetryCount : 0;
  const parsedTop = typeof topLevelRetryCount === "number" && topLevelRetryCount >= 0 ? topLevelRetryCount : 0;
  return Math.max(parsedAuto, parsedTop);
}

// attempt 1 -> 1h, 2 -> 2h, 3 -> 4h, capped at 24h.
export function backoffHoursForAttempt(attemptCount: number): number {
  if (attemptCount <= 0) return 0;
  return Math.min(Math.pow(2, attemptCount - 1), RETRY_BACKOFF_CAP_HOURS);
}

export function nextRetryDueAt(lastAttemptIso: string | null | undefined, attemptCount: number): Date | null {
  if (!lastAttemptIso) return null;
  const last = new Date(lastAttemptIso);
  if (isNaN(last.getTime())) return null;
  const hours = backoffHoursForAttempt(Math.max(1, attemptCount));
  return new Date(last.getTime() + hours * 60 * 60 * 1000);
}

export type RetryDecision =
  | { eligible: true; reason: "retryable_failure"; attemptCount: number }
  | { eligible: false; reason: string };

export function shouldRetryBatch(batch: Record<string, unknown>, now: Date = new Date()): RetryDecision {
  if (batch.status !== "failed") {
    return { eligible: false, reason: `status_not_failed (${batch.status})` };
  }
  if (batch.import_type === "nppes_registry") {
    return { eligible: false, reason: "nppes_handled_elsewhere" };
  }
  const params = (batch.retry_params as Record<string, unknown> | undefined) ?? {};
  if (params.auto_retry_disabled === true) {
    return { eligible: false, reason: "auto_retry_disabled" };
  }
  const attemptCount = getRetryAttemptCount(batch);
  if (attemptCount >= MAX_AUTO_RETRY_ATTEMPTS) {
    return { eligible: false, reason: `max_attempts_reached (${attemptCount})` };
  }
  const errorMsg = extractErrorMessage(batch);
  if (!isRetryableErrorMessage(errorMsg)) {
    return { eligible: false, reason: "non_retryable_error" };
  }
  const lastAttempt = (params.last_auto_retry_at as string | undefined)
    ?? (batch.completed_at instanceof Date ? batch.completed_at.toISOString() : (batch.completed_at as string | undefined))
    ?? (batch.updated_date instanceof Date ? batch.updated_date.toISOString() : (batch.updated_date as string | undefined));
  if (lastAttempt) {
    const dueAt = nextRetryDueAt(lastAttempt, attemptCount + 1);
    if (dueAt && now.getTime() < dueAt.getTime()) {
      return { eligible: false, reason: `backoff_active (due ${dueAt.toISOString()})` };
    }
  }
  const failureIsoRaw = batch.completed_at ?? batch.updated_date ?? batch.created_date;
  const failureIso = failureIsoRaw instanceof Date ? failureIsoRaw.toISOString() : (failureIsoRaw as string | undefined);
  if (failureIso) {
    const failureAt = new Date(failureIso);
    if (!isNaN(failureAt.getTime()) && now.getTime() - failureAt.getTime() > RETRY_LOOKBACK_MS) {
      return { eligible: false, reason: "too_old" };
    }
  }
  return { eligible: true, reason: "retryable_failure", attemptCount };
}

// Identifier for who triggered a maintenance run. Recorded in the
// maintenance_fanout AuditEvent so operators can tell scheduled work apart
// from a button-press on the admin UI.
export type InvokedBy = "cron" | "admin_ui";

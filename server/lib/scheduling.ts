// Pure scheduling/retry helpers for the Express maintenance layer.
//
// Ported from the (unit-tested) Base44 functions
// base44/functions/runScheduledImports/helpers.ts and
// base44/functions/autoRetryFailedImports/helpers.ts so the self-hosted server
// has the same orchestration logic without depending on the legacy Deno
// functions. Kept free of DB/Express imports so they can be unit-tested directly.

// ─── Scheduling ──────────────────────────────────────────────────────────────

// Process multiple schedules per invocation when they don't conflict.
export const MAX_SCHEDULES_PER_INVOCATION = 5;
// Exponential backoff cap (consecutive failures): 1h, 2h, 4h, 8h, capped at 24h.
export const FAILURE_BACKOFF_CAP_HOURS = 24;
// Spread schedules within ±N minutes to avoid a thundering herd.
export const SCHEDULE_JITTER_MINUTES = 15;
// Minimum gap between now and the computed next_run_at, so negative jitter can't
// push a schedule into the immediate past and cause a tight reschedule loop.
export const NEXT_RUN_MIN_BUFFER_MS = 5 * 60_000;

// Non-conflicting import_type families. Schedules from the same family run
// sequentially; different families can run in parallel within one invocation.
export function getImportFamily(importType: string | null | undefined): string {
  if (!importType) return "unknown";
  if (importType === "nppes_registry") return "nppes";
  if (importType.startsWith("medicare_")) return "medicare";
  if (importType.startsWith("hospice_")) return "hospice";
  if (importType.startsWith("snf_") || importType.startsWith("nursing_home_")) return "snf";
  if (importType.startsWith("home_health_")) return "hha";
  return "cms_other";
}

// Symmetric jitter in ±maxMinutes. Random source is injectable for tests.
export function jitterMs(maxMinutes: number, random: () => number = Math.random): number {
  const range = maxMinutes * 60_000;
  return Math.floor((random() - 0.5) * 2 * range);
}

export function backoffHours(consecutiveFailures: number): number {
  if (consecutiveFailures <= 0) return 0;
  return Math.min(Math.pow(2, consecutiveFailures - 1), FAILURE_BACKOFF_CAP_HOURS);
}

export type Schedule = {
  schedule_time?: string | null;
  schedule_frequency?: "daily" | "weekly" | "monthly" | "on_completion" | string | null;
  last_run_at?: string | Date | null;
  last_successful_run_at?: string | Date | null;
  last_run_status?: string | null;
  consecutive_failures?: number | null;
  label?: string | null;
  import_type?: string | null;
  depends_on_import_type?: string | null;
};

export function computeNextRun(
  schedule: Schedule,
  now: Date,
  failures: number,
  random: () => number = Math.random,
): Date {
  const next = new Date(now);
  const [rawH, rawM] = (schedule.schedule_time || "02:00").split(":").map(Number);
  const hours   = Number.isInteger(rawH) && rawH >= 0 && rawH <= 23 ? rawH : 2;
  const minutes = Number.isInteger(rawM) && rawM >= 0 && rawM <= 59 ? rawM : 0;

  if (schedule.schedule_frequency === "daily") {
    next.setDate(next.getDate() + 1);
  } else if (schedule.schedule_frequency === "weekly") {
    next.setDate(next.getDate() + 7);
  } else if (schedule.schedule_frequency === "monthly") {
    next.setMonth(next.getMonth() + 1);
  } else if (schedule.schedule_frequency === "on_completion") {
    // No regular cadence — the dependency check handles it. Sentinel ~1h out.
    next.setHours(next.getHours() + 1);
    return next;
  }
  next.setHours(hours, minutes, 0, 0);

  if (failures > 0) {
    next.setTime(next.getTime() + backoffHours(failures) * 60 * 60_000);
  }

  next.setTime(next.getTime() + jitterMs(SCHEDULE_JITTER_MINUTES, random));
  const minNext = now.getTime() + NEXT_RUN_MIN_BUFFER_MS;
  if (next.getTime() < minNext) {
    next.setTime(minNext);
  }
  return next;
}

// Whether a schedule's `depends_on_import_type` parent has completed
// successfully since this schedule's last *successful* run. Tracking the child's
// last successful run (not last_run_at) lets failed children retry against the
// same parent run instead of being blocked until the parent runs again.
export function dependencyBlocked(
  schedule: Schedule,
  allSchedules: Schedule[],
): { blocked: boolean; reason?: string } {
  if (!schedule.depends_on_import_type) return { blocked: false };
  const parent = allSchedules.find((s) => s.import_type === schedule.depends_on_import_type);
  if (!parent) {
    return { blocked: true, reason: `Dependency import_type=${schedule.depends_on_import_type} not configured` };
  }
  if (!parent.last_run_at) {
    return { blocked: true, reason: `Waiting for parent ${parent.label} to run at least once` };
  }
  if (parent.last_run_status && parent.last_run_status !== "success") {
    return { blocked: true, reason: `Parent ${parent.label} last run was ${parent.last_run_status}` };
  }
  const childLastSuccess = schedule.last_successful_run_at ? new Date(schedule.last_successful_run_at) : null;
  if (childLastSuccess && childLastSuccess > new Date(parent.last_run_at)) {
    return { blocked: true, reason: `Already ran successfully since parent's last completion` };
  }
  return { blocked: false };
}

// ─── Auto-retry of failed imports ──────────────────────────────────────────────

export const MAX_AUTO_RETRY_ATTEMPTS = 3;
export const RETRY_BACKOFF_CAP_HOURS = 24;
export const RETRY_LOOKBACK_MS = 48 * 60 * 60 * 1000;

// Patterns marking a failure as transient. Mirror the retryable:true categories
// in src/components/imports/errorCategories.jsx (timeout_stall, network_api).
export const RETRYABLE_KEYWORDS = [
  "timeout", "timed out", "stalled", "exceeded", "too long", "abort", "execution time", "inactivity",
  "http 5", "rate limit", "rate-limit", "rate_limit",
  "fetch", "network", "connection", "econnrefused", "socket",
];

export const RETRYABLE_STATUS_CODE_PATTERN =
  /\b(?:http(?:\/\d(?:\.\d)?)?|status(?:\s+code)?|response(?:\s+status)?)\D*(?:429|500|503)\b|\b(?:429\s+too many requests|500\s+internal server error|503\s+service unavailable)\b/;

export function isRetryableErrorMessage(msg: string | null | undefined): boolean {
  if (!msg) return false;
  const lower = String(msg).toLowerCase();
  return RETRYABLE_KEYWORDS.some((kw) => lower.includes(kw)) || RETRYABLE_STATUS_CODE_PATTERN.test(lower);
}

function normalizeErrorText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

// Most actionable error string from a batch: cancel_reason first, then the most
// recent error_samples entry's detail/message (importers use different keys).
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
  const a = typeof autoRetryCount === "number" && autoRetryCount >= 0 ? autoRetryCount : 0;
  const b = typeof topLevelRetryCount === "number" && topLevelRetryCount >= 0 ? topLevelRetryCount : 0;
  return Math.max(a, b);
}

export function backoffHoursForAttempt(attemptCount: number): number {
  if (attemptCount <= 0) return 0;
  return Math.min(Math.pow(2, attemptCount - 1), RETRY_BACKOFF_CAP_HOURS);
}

export function nextRetryDueAt(lastAttemptIso: string | Date | null | undefined, attemptCount: number): Date | null {
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
    // The NPPES crawler has its own retry path (watchdog + batch_resume).
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
  const lastAttempt =
    (params.last_auto_retry_at as string | undefined) ??
    (batch.completed_at as string | undefined) ??
    (batch.updated_date as string | undefined);
  if (lastAttempt) {
    const dueAt = nextRetryDueAt(lastAttempt, attemptCount + 1);
    if (dueAt && now.getTime() < dueAt.getTime()) {
      return { eligible: false, reason: `backoff_active (due ${dueAt.toISOString()})` };
    }
  }
  const failureIso =
    (batch.completed_at as string | undefined) ??
    (batch.updated_date as string | undefined) ??
    (batch.created_date as string | undefined);
  if (failureIso) {
    const failureAt = new Date(failureIso);
    if (!isNaN(failureAt.getTime()) && now.getTime() - failureAt.getTime() > RETRY_LOOKBACK_MS) {
      return { eligible: false, reason: "too_old" };
    }
  }
  return { eligible: true, reason: "retryable_failure", attemptCount };
}

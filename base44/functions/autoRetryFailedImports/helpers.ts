// Pure logic for the auto-retry worker, extracted into a helpers module so it
// can be unit-tested from Node without the Deno serve handler.
//
// Closes the loop on errorCategories.jsx: that taxonomy tags categories with
// `retryable: true` (network errors, timeouts, rate limits) but until now
// nothing acted on the flag automatically. This worker reads `failed`
// ImportBatch rows, classifies the failure, and re-dispatches the import via
// triggerImport when the error looks transient.
//
// Note: the keyword list here is derived from the `retryable: true` categories in
// src/components/imports/errorCategories.jsx (network_api, timeout_stall), but is
// intentionally stricter to avoid auto-retrying ambiguous failures. Tests assert
// representative overlap between the worker and frontend classifications.
export const MAX_AUTO_RETRY_ATTEMPTS = 3;
export const RETRY_BACKOFF_CAP_HOURS = 24;
export const RETRY_LOOKBACK_MS = 48 * 60 * 60 * 1000;

// Patterns that mark a failure as transient. Matches the keyword sets on the
// retryable: true categories in errorCategories.jsx (timeout_stall, network_api).
export const RETRYABLE_KEYWORDS = [
    'timeout', 'timed out', 'stalled', 'exceeded', 'too long', 'abort', 'execution time', 'inactivity',
    'rate limit', 'rate-limit', 'rate_limit',
    'fetch', 'network', 'connection', 'econnrefused', 'socket',
];

// Match retryable HTTP status codes only when they appear in an HTTP/status
// context, so unrelated numeric references like "row 500" do not trigger
// auto-retries.
export const RETRYABLE_STATUS_CODE_PATTERN =
    /\b(?:http(?:\/\d(?:\.\d)?)?|status(?:\s+code)?|response(?:\s+status)?|statuscode)\D*(?:429|500|503)\b|\b(?:429\s+too many requests|500\s+internal server error|503\s+service unavailable)\b/;

export function isRetryableErrorMessage(msg: string | null | undefined): boolean {
    if (!msg) return false;
    const lower = String(msg).toLowerCase();
    return RETRYABLE_KEYWORDS.some(kw => lower.includes(kw))
        || RETRYABLE_STATUS_CODE_PATTERN.test(lower);
}

// Pull the most actionable error string out of a batch. Prefer cancel_reason
// (set by the import functions when they pause/fail with context), then fall
// back to the most recent error_samples entry. Different importers persist the
// error string under different keys (`detail` in Medicare imports,
// `message` in autoImportCMSData) — accept either so the worker doesn't miss
// transient failures whose error lives in the "wrong" field.
export function extractErrorMessage(batch: Record<string, unknown>): string {
    if (typeof batch.cancel_reason === 'string' && batch.cancel_reason.length > 0) {
        return batch.cancel_reason;
    }
    const samples = batch.error_samples;
    if (Array.isArray(samples) && samples.length > 0) {
        const last = samples[samples.length - 1] as Record<string, unknown> | undefined;
        if (last) {
            if (typeof last.detail === 'string' && last.detail.length > 0) return last.detail;
            if (typeof last.message === 'string' && last.message.length > 0) return last.message;
        }
    }
    return '';
}

export function getRetryAttemptCount(batch: Record<string, unknown>): number {
    const params = batch.retry_params as Record<string, unknown> | undefined;
    const autoRetryCount = params?.auto_retry_count;
    const topLevelRetryCount = batch.retry_count;
    const parsedAutoRetryCount = typeof autoRetryCount === 'number' && autoRetryCount >= 0
        ? autoRetryCount
        : 0;
    const parsedTopLevelRetryCount = typeof topLevelRetryCount === 'number' && topLevelRetryCount >= 0
        ? topLevelRetryCount
        : 0;
    return Math.max(parsedAutoRetryCount, parsedTopLevelRetryCount);
}

// Exponential backoff that mirrors runScheduledImports/helpers.backoffHours:
// attempt 1 -> 1h, 2 -> 2h, 3 -> 4h, 4 -> 8h, capped at 24h. Applied from the
// last failure timestamp.
export function backoffHoursForAttempt(attemptCount: number): number {
    if (attemptCount <= 0) return 0;
    return Math.min(Math.pow(2, attemptCount - 1), RETRY_BACKOFF_CAP_HOURS);
}

export function nextRetryDueAt(
    lastAttemptIso: string | null | undefined,
    attemptCount: number,
): Date | null {
    if (!lastAttemptIso) return null;
    const last = new Date(lastAttemptIso);
    if (isNaN(last.getTime())) return null;
    const hours = backoffHoursForAttempt(Math.max(1, attemptCount));
    return new Date(last.getTime() + hours * 60 * 60 * 1000);
}

export type RetryDecision =
    | { eligible: true; reason: 'retryable_failure'; attemptCount: number }
    | { eligible: false; reason: string };

export function shouldRetryBatch(
    batch: Record<string, unknown>,
    now: Date = new Date(),
): RetryDecision {
    if (batch.status !== 'failed') {
        return { eligible: false, reason: `status_not_failed (${batch.status})` };
    }

    if (batch.import_type === 'nppes_registry') {
        // The NPPES crawler has its own retry path (manageCrawlerRetries +
        // superviseNPPESCrawler). Skip here so we don't double-trigger.
        return { eligible: false, reason: 'nppes_handled_elsewhere' };
    }

    const params = (batch.retry_params as Record<string, unknown> | undefined) ?? {};
    if (params.auto_retry_disabled === true) {
        return { eligible: false, reason: 'auto_retry_disabled' };
    }

    const attemptCount = getRetryAttemptCount(batch);
    if (attemptCount >= MAX_AUTO_RETRY_ATTEMPTS) {
        return { eligible: false, reason: `max_attempts_reached (${attemptCount})` };
    }

    const errorMsg = extractErrorMessage(batch);
    if (!isRetryableErrorMessage(errorMsg)) {
        return { eligible: false, reason: 'non_retryable_error' };
    }

    const lastAttempt =
        (params.last_auto_retry_at as string | undefined)
        ?? (batch.completed_at as string | undefined)
        ?? (batch.updated_date as string | undefined);
    if (lastAttempt) {
        const dueAt = nextRetryDueAt(lastAttempt, attemptCount + 1);
        if (dueAt && now.getTime() < dueAt.getTime()) {
            return { eligible: false, reason: `backoff_active (due ${dueAt.toISOString()})` };
        }
    }

    const createdIso = (batch.created_date as string | undefined)
        ?? (batch.updated_date as string | undefined);
    if (createdIso) {
        const created = new Date(createdIso);
        if (!isNaN(created.getTime()) && now.getTime() - created.getTime() > RETRY_LOOKBACK_MS) {
            return { eligible: false, reason: 'too_old' };
        }
    }

    return { eligible: true, reason: 'retryable_failure', attemptCount };
}

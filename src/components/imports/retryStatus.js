// Frontend mirror of base44/functions/autoRetryFailedImports/helpers.ts.
//
// The worker doesn't expose an API surface for "what's the retry state of
// this batch?", but the data is all already on retry_params. This computes
// a display-friendly view of it for BatchDetailPanel.

export const MAX_AUTO_RETRY_ATTEMPTS = 3;
export const RETRY_BACKOFF_CAP_HOURS = 24;

export function backoffHoursForAttempt(attemptCount) {
    if (attemptCount <= 0) return 0;
    return Math.min(Math.pow(2, attemptCount - 1), RETRY_BACKOFF_CAP_HOURS);
}

export function nextRetryDueAt(lastAttemptIso, attemptCount) {
    if (!lastAttemptIso) return null;
    const last = new Date(lastAttemptIso);
    if (isNaN(last.getTime())) return null;
    const hours = backoffHoursForAttempt(Math.max(1, attemptCount));
    return new Date(last.getTime() + hours * 60 * 60 * 1000);
}

// Decide what to show on the BatchDetailPanel auto-retry banner.
//
// Returns `null` for batches the worker won't touch (NPPES is handled by
// manageCrawlerRetries; non-failed batches don't need retry visibility) so
// the caller can hide the banner entirely.
//
// Otherwise returns a structured view with a `state`:
//   - 'disabled'      — operator opted out via auto_retry_disabled
//   - 'max_reached'   — hit MAX_AUTO_RETRY_ATTEMPTS
//   - 'pending'       — waiting for the backoff window to elapse
//   - 'eligible'      — past the window, will retry on the next worker tick
//   - 'never_tried'   — no auto-retry has been attempted yet
export function getAutoRetryState(batch, now = new Date()) {
    if (!batch || batch.status !== 'failed') return null;
    if (batch.import_type === 'nppes_registry') return null;

    const params = batch.retry_params || {};
    const attemptCount = typeof params.auto_retry_count === 'number' && params.auto_retry_count >= 0
        ? params.auto_retry_count
        : 0;
    const lastAttempt = params.last_auto_retry_at || batch.completed_at || batch.updated_date || null;
    const lastReason = typeof params.last_auto_retry_reason === 'string'
        ? params.last_auto_retry_reason
        : null;

    if (params.auto_retry_disabled === true) {
        return { state: 'disabled', attemptCount, lastAttempt, lastReason, nextDueAt: null };
    }
    if (attemptCount >= MAX_AUTO_RETRY_ATTEMPTS) {
        return { state: 'max_reached', attemptCount, lastAttempt, lastReason, nextDueAt: null };
    }

    const nextDueAt = nextRetryDueAt(lastAttempt, attemptCount + 1);
    if (attemptCount === 0 && !params.last_auto_retry_at) {
        return { state: 'never_tried', attemptCount, lastAttempt, lastReason, nextDueAt };
    }
    if (nextDueAt && nextDueAt.getTime() > now.getTime()) {
        return { state: 'pending', attemptCount, lastAttempt, lastReason, nextDueAt };
    }
    return { state: 'eligible', attemptCount, lastAttempt, lastReason, nextDueAt };
}

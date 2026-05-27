import { describe, it, expect } from 'vitest';
import {
  MAX_AUTO_RETRY_ATTEMPTS,
  RETRYABLE_KEYWORDS,
  RETRY_BACKOFF_CAP_HOURS,
  isRetryableErrorMessage,
  extractErrorMessage,
  getRetryAttemptCount,
  backoffHoursForAttempt,
  nextRetryDueAt,
  shouldRetryBatch,
} from '../base44/functions/autoRetryFailedImports/helpers';
import { ERROR_CATEGORIES, isErrorRetryable } from '../src/components/imports/errorCategories.jsx';

describe('isRetryableErrorMessage', () => {
  it('returns false for empty/missing messages', () => {
    expect(isRetryableErrorMessage(null)).toBe(false);
    expect(isRetryableErrorMessage(undefined)).toBe(false);
    expect(isRetryableErrorMessage('')).toBe(false);
  });

  it('matches network/HTTP transient errors', () => {
    expect(isRetryableErrorMessage('HTTP 500 Internal Server Error')).toBe(true);
    expect(isRetryableErrorMessage('HTTP 503 Service Unavailable')).toBe(true);
    expect(isRetryableErrorMessage('429 Too Many Requests')).toBe(true);
    expect(isRetryableErrorMessage('Rate limit exceeded')).toBe(true);
    expect(isRetryableErrorMessage('Connection refused: ECONNREFUSED')).toBe(true);
    expect(isRetryableErrorMessage('fetch failed')).toBe(true);
  });

  it('matches timeout / stall errors', () => {
    expect(isRetryableErrorMessage('Operation timed out after 30s')).toBe(true);
    expect(isRetryableErrorMessage('Execution time limit exceeded')).toBe(true);
    expect(isRetryableErrorMessage('Aborted at byte 1024')).toBe(true);
  });

  it('rejects data-quality failures (non-retryable)', () => {
    expect(isRetryableErrorMessage('NPI must be 10 digits')).toBe(false);
    expect(isRetryableErrorMessage('Field "category" is required')).toBe(false);
    expect(isRetryableErrorMessage('Duplicate key constraint')).toBe(false);
    expect(isRetryableErrorMessage('Invalid date format')).toBe(false);
  });

  it('agrees with the frontend taxonomy on representative transient errors', () => {
    // Worker should be at least as cautious as the frontend: every phrase below
    // should be flagged retryable by both. We don't iterate every keyword
    // verbatim because the worker is intentionally tighter than the frontend
    // (e.g. plain "HTTP" with no status code shouldn't auto-retry — could be a
    // 4xx that won't recover).
    const transientPhrases = [
      'Operation timed out after 30s',
      'Execution time limit exceeded',
      'HTTP 500 Internal Server Error',
      'HTTP 503 Service Unavailable',
      'HTTP 429 Too Many Requests',
      'Rate limit reached',
      'Connection refused: ECONNREFUSED',
      'fetch failed',
      'Network error',
      'Inactivity timeout',
    ];
    for (const phrase of transientPhrases) {
      expect(isRetryableErrorMessage(phrase), `worker retries "${phrase}"`).toBe(true);
      expect(isErrorRetryable(phrase), `frontend agrees "${phrase}" is retryable`).toBe(true);
    }
  });

  it('rejects keywords from non-retryable frontend categories', () => {
    const nonRetryablePhrases = [
      'NPI must be 10 digits',
      'missing required field',
      'duplicate key',
      'invalid format',
      'out of range',
    ];
    for (const phrase of nonRetryablePhrases) {
      expect(isErrorRetryable(phrase), `frontend marks "${phrase}" non-retryable`).toBe(false);
      expect(isRetryableErrorMessage(phrase), `worker also skips "${phrase}"`).toBe(false);
    }
  });
});

describe('extractErrorMessage', () => {
  it('prefers cancel_reason when set', () => {
    expect(extractErrorMessage({
      cancel_reason: 'Time limit reached',
      error_samples: [{ detail: 'should not be picked' }],
    })).toBe('Time limit reached');
  });

  it('falls back to last error_samples.detail', () => {
    expect(extractErrorMessage({
      error_samples: [
        { detail: 'first error' },
        { detail: 'second error' },
        { detail: 'most recent error' },
      ],
    })).toBe('most recent error');
  });

  it('returns empty string when no error info present', () => {
    expect(extractErrorMessage({})).toBe('');
    expect(extractErrorMessage({ cancel_reason: '' })).toBe('');
    expect(extractErrorMessage({ error_samples: [] })).toBe('');
  });

  it('handles malformed error_samples gracefully', () => {
    expect(extractErrorMessage({ error_samples: 'not an array' as any })).toBe('');
    expect(extractErrorMessage({ error_samples: [{}] })).toBe('');
  });
});

describe('getRetryAttemptCount', () => {
  it('returns 0 when no retry_params', () => {
    expect(getRetryAttemptCount({})).toBe(0);
  });

  it('returns 0 when auto_retry_count missing', () => {
    expect(getRetryAttemptCount({ retry_params: {} })).toBe(0);
  });

  it('reads numeric auto_retry_count', () => {
    expect(getRetryAttemptCount({ retry_params: { auto_retry_count: 2 } })).toBe(2);
  });

  it('treats non-numeric values as 0', () => {
    expect(getRetryAttemptCount({ retry_params: { auto_retry_count: 'two' as any } })).toBe(0);
    expect(getRetryAttemptCount({ retry_params: { auto_retry_count: -3 } })).toBe(0);
  });
});

describe('backoffHoursForAttempt', () => {
  it('returns 0 for attempt 0 or negative', () => {
    expect(backoffHoursForAttempt(0)).toBe(0);
    expect(backoffHoursForAttempt(-1)).toBe(0);
  });

  it('doubles each attempt: 1, 2, 4, 8 hours', () => {
    expect(backoffHoursForAttempt(1)).toBe(1);
    expect(backoffHoursForAttempt(2)).toBe(2);
    expect(backoffHoursForAttempt(3)).toBe(4);
    expect(backoffHoursForAttempt(4)).toBe(8);
  });

  it('caps at RETRY_BACKOFF_CAP_HOURS', () => {
    expect(backoffHoursForAttempt(10)).toBe(RETRY_BACKOFF_CAP_HOURS);
    expect(backoffHoursForAttempt(100)).toBe(RETRY_BACKOFF_CAP_HOURS);
  });
});

describe('nextRetryDueAt', () => {
  it('returns null when no last attempt timestamp', () => {
    expect(nextRetryDueAt(null, 1)).toBeNull();
    expect(nextRetryDueAt(undefined, 1)).toBeNull();
  });

  it('returns null on invalid date input', () => {
    expect(nextRetryDueAt('not-a-date', 1)).toBeNull();
  });

  it('adds the backoff window for the next attempt', () => {
    const last = '2026-05-09T08:00:00Z';
    expect(nextRetryDueAt(last, 1)?.toISOString()).toBe('2026-05-09T09:00:00.000Z'); // 1h
    expect(nextRetryDueAt(last, 2)?.toISOString()).toBe('2026-05-09T10:00:00.000Z'); // 2h
    expect(nextRetryDueAt(last, 3)?.toISOString()).toBe('2026-05-09T12:00:00.000Z'); // 4h
  });
});

describe('shouldRetryBatch', () => {
  const now = new Date('2026-05-09T12:00:00Z');

  function failedBatch(extra: Record<string, unknown> = {}) {
    return {
      id: 'b1',
      import_type: 'medicare_hha_stats',
      status: 'failed',
      cancel_reason: 'Rate limit reached',
      created_date: '2026-05-09T08:00:00Z', // 4h ago
      updated_date: '2026-05-09T08:30:00Z',
      completed_at: '2026-05-09T08:30:00Z', // 3.5h ago — past 1h backoff
      ...extra,
    };
  }

  it('eligible for a fresh failed retryable batch with no prior auto-retries', () => {
    const decision = shouldRetryBatch(failedBatch(), now);
    expect(decision).toEqual({ eligible: true, reason: 'retryable_failure', attemptCount: 0 });
  });

  it('skips batches that aren\'t in failed status', () => {
    const result = shouldRetryBatch(failedBatch({ status: 'completed' }), now);
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/status_not_failed/);
  });

  it('skips paused batches (handled by autoResumePausedImports)', () => {
    const result = shouldRetryBatch(failedBatch({ status: 'paused' }), now);
    expect(result.eligible).toBe(false);
  });

  it('skips NPPES (handled by manageCrawlerRetries)', () => {
    const result = shouldRetryBatch(failedBatch({ import_type: 'nppes_registry' }), now);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('nppes_handled_elsewhere');
  });

  it('respects the auto_retry_disabled override on retry_params', () => {
    const result = shouldRetryBatch(
      failedBatch({ retry_params: { auto_retry_disabled: true } }),
      now,
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('auto_retry_disabled');
  });

  it('refuses past MAX_AUTO_RETRY_ATTEMPTS', () => {
    const result = shouldRetryBatch(
      failedBatch({ retry_params: { auto_retry_count: MAX_AUTO_RETRY_ATTEMPTS } }),
      now,
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/max_attempts_reached/);
  });

  it('refuses non-retryable error categorization', () => {
    const result = shouldRetryBatch(
      failedBatch({ cancel_reason: 'Invalid NPI in row 42 — must be 10 digits' }),
      now,
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('non_retryable_error');
  });

  it('blocks during exponential backoff window', () => {
    // 1 prior attempt -> next due in 2h; if last attempt was 30 min ago we wait.
    const recent = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
    const result = shouldRetryBatch(
      failedBatch({
        completed_at: recent,
        retry_params: { auto_retry_count: 1, last_auto_retry_at: recent },
      }),
      now,
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/backoff_active/);
  });

  it('unblocks once the backoff window has elapsed', () => {
    // attemptCount=1 -> next backoff is backoffHoursForAttempt(2) = 2h.
    // 3h ago > 2h, so we're past the window.
    const longAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString();
    const result = shouldRetryBatch(
      failedBatch({
        created_date: longAgo,
        completed_at: longAgo,
        retry_params: { auto_retry_count: 1, last_auto_retry_at: longAgo },
      }),
      now,
    );
    expect(result.eligible).toBe(true);
  });

  it('refuses batches older than the lookback window (48h)', () => {
    const tooOld = new Date(now.getTime() - 50 * 60 * 60 * 1000).toISOString();
    const result = shouldRetryBatch(
      failedBatch({ created_date: tooOld, completed_at: tooOld }),
      now,
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('too_old');
  });

  it('uses the most recent failure timestamp for the lookback window', () => {
    const createdTooOld = new Date(now.getTime() - 72 * 60 * 60 * 1000).toISOString();
    const failedRecently = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
    const result = shouldRetryBatch(
      failedBatch({ created_date: createdTooOld, completed_at: failedRecently, updated_date: failedRecently }),
      now,
    );
    expect(result).toEqual({ eligible: true, reason: 'retryable_failure', attemptCount: 0 });
  });

  it('exposes RETRYABLE_KEYWORDS for callers', () => {
    expect(RETRYABLE_KEYWORDS).toContain('timeout');
    expect(RETRYABLE_KEYWORDS).toContain('rate limit');
    expect(RETRYABLE_KEYWORDS.length).toBeGreaterThan(5);
  });
});

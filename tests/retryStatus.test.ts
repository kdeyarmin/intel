import { describe, it, expect } from 'vitest';
import {
  MAX_AUTO_RETRY_ATTEMPTS,
  RETRY_BACKOFF_CAP_HOURS,
  backoffHoursForAttempt,
  nextRetryDueAt,
  getAutoRetryState,
} from '../src/components/imports/retryStatus.js';

describe('backoffHoursForAttempt (frontend mirror)', () => {
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
  });
});

describe('nextRetryDueAt', () => {
  it('returns null without a last-attempt timestamp', () => {
    expect(nextRetryDueAt(null, 1)).toBeNull();
    expect(nextRetryDueAt(undefined, 1)).toBeNull();
    expect(nextRetryDueAt('garbage', 1)).toBeNull();
  });

  it('adds backoff hours to last attempt', () => {
    const last = '2026-05-09T08:00:00Z';
    expect(nextRetryDueAt(last, 1)?.toISOString()).toBe('2026-05-09T09:00:00.000Z');
    expect(nextRetryDueAt(last, 2)?.toISOString()).toBe('2026-05-09T10:00:00.000Z');
    expect(nextRetryDueAt(last, 3)?.toISOString()).toBe('2026-05-09T12:00:00.000Z');
  });
});

describe('getAutoRetryState', () => {
  const now = new Date('2026-05-09T12:00:00Z');

  it('returns null for non-failed batches', () => {
    expect(getAutoRetryState({ status: 'completed' }, now)).toBeNull();
    expect(getAutoRetryState({ status: 'paused' }, now)).toBeNull();
    expect(getAutoRetryState({ status: 'processing' }, now)).toBeNull();
  });

  it('returns null for nppes_registry (handled elsewhere)', () => {
    expect(getAutoRetryState({ status: 'failed', import_type: 'nppes_registry' }, now)).toBeNull();
  });

  it('returns null for missing batch', () => {
    expect(getAutoRetryState(null, now)).toBeNull();
    expect(getAutoRetryState(undefined, now)).toBeNull();
  });

  it('reports never_tried when no retry has happened', () => {
    const state = getAutoRetryState({
      status: 'failed',
      import_type: 'medicare_hha_stats',
      completed_at: '2026-05-09T11:00:00Z',
    }, now);
    expect(state.state).toBe('never_tried');
    expect(state.attemptCount).toBe(0);
  });

  it('reports disabled when retry_params.auto_retry_disabled is true', () => {
    const state = getAutoRetryState({
      status: 'failed',
      import_type: 'medicare_hha_stats',
      retry_params: { auto_retry_disabled: true, auto_retry_count: 1 },
    }, now);
    expect(state.state).toBe('disabled');
    expect(state.attemptCount).toBe(1);
  });

  it('reports max_reached when at MAX_AUTO_RETRY_ATTEMPTS', () => {
    const state = getAutoRetryState({
      status: 'failed',
      import_type: 'medicare_hha_stats',
      retry_params: { auto_retry_count: MAX_AUTO_RETRY_ATTEMPTS },
    }, now);
    expect(state.state).toBe('max_reached');
  });

  it('reports pending when within the backoff window', () => {
    const recent = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
    const state = getAutoRetryState({
      status: 'failed',
      import_type: 'medicare_hha_stats',
      retry_params: { auto_retry_count: 1, last_auto_retry_at: recent },
    }, now);
    // attempt 1 -> next is attempt 2 -> backoff 2h. 30min < 2h, so pending.
    expect(state.state).toBe('pending');
    expect(state.nextDueAt).toBeInstanceOf(Date);
  });

  it('reports eligible when past the backoff window', () => {
    const longAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString();
    const state = getAutoRetryState({
      status: 'failed',
      import_type: 'medicare_hha_stats',
      retry_params: { auto_retry_count: 1, last_auto_retry_at: longAgo },
    }, now);
    expect(state.state).toBe('eligible');
  });

  it('threads last_auto_retry_reason through for display', () => {
    const state = getAutoRetryState({
      status: 'failed',
      import_type: 'medicare_hha_stats',
      retry_params: {
        auto_retry_count: 1,
        last_auto_retry_at: '2026-05-09T11:00:00Z',
        last_auto_retry_reason: 'HTTP 500 from upstream',
      },
    }, now);
    expect(state.lastReason).toBe('HTTP 500 from upstream');
  });

  it('treats negative auto_retry_count as 0', () => {
    const state = getAutoRetryState({
      status: 'failed',
      import_type: 'medicare_hha_stats',
      retry_params: { auto_retry_count: -1 },
    }, now);
    expect(state.attemptCount).toBe(0);
  });

  it('reports too_old for batches outside the worker lookback window', () => {
    // Worker only acts on batches < 48h old. Banner must agree so it doesn't
    // show 'pending'/'eligible' for batches the worker will never retry.
    const longAgo = new Date(now.getTime() - 50 * 60 * 60 * 1000).toISOString();
    const state = getAutoRetryState({
      status: 'failed',
      import_type: 'medicare_hha_stats',
      created_date: longAgo,
      completed_at: longAgo,
    }, now);
    expect(state.state).toBe('too_old');
  });

  it('measures the lookback from the FAILURE time, not the creation time', () => {
    // A long-running import created 50h ago but that only failed 90 min ago is
    // still in the worker's window (failureIso = completed_at). The banner must
    // NOT report too_old — otherwise it tells the operator the batch will never
    // retry while the worker is about to retry it.
    const created = new Date(now.getTime() - 50 * 60 * 60 * 1000).toISOString();
    const failed = new Date(now.getTime() - 90 * 60 * 1000).toISOString();
    const state = getAutoRetryState({
      status: 'failed',
      import_type: 'medicare_hha_stats',
      created_date: created,
      completed_at: failed,
    }, now);
    expect(state.state).not.toBe('too_old');
  });

  it('reports pending (not never_tried) for a freshly-failed batch in first-attempt backoff', () => {
    // The worker applies backoff to the first attempt too, computed from the
    // failure time. A batch that failed 5 min ago will not run for ~1h, so the
    // banner must show 'pending' rather than 'never_tried'.
    const recentFailure = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    const state = getAutoRetryState({
      status: 'failed',
      import_type: 'medicare_hha_stats',
      completed_at: recentFailure,
    }, now);
    expect(state.state).toBe('pending');
    expect(state.nextDueAt).toBeInstanceOf(Date);
  });
});

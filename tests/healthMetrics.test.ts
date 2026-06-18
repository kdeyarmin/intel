import { describe, it, expect } from 'vitest';
import {
  successRateByDay,
  summarizeWindow,
  topErrorCategoriesFromBatches,
  summarizeRetryPipeline,
  unhealthySchedules,
} from '../src/components/imports/healthMetrics';

describe('successRateByDay', () => {
  const now = new Date('2026-05-09T12:00:00Z');

  it('produces one bucket per day in the window, sorted oldest -> newest', () => {
    const buckets = successRateByDay([], 7, now);
    expect(buckets).toHaveLength(7);
    expect(buckets[0].date).toBe('2026-05-03');
    expect(buckets[6].date).toBe('2026-05-09');
  });

  it('zero-fills days with no batches (so the chart still renders them)', () => {
    const buckets = successRateByDay([], 3, now);
    expect(buckets.every(b => b.completed === 0 && b.failed === 0)).toBe(true);
    expect(buckets.every(b => b.successRate === null)).toBe(true);
  });

  it('counts batches in the bucket of their completed_at day (UTC)', () => {
    const batches = [
      { status: 'completed', completed_at: '2026-05-09T05:00:00Z' },
      { status: 'completed', completed_at: '2026-05-09T15:00:00Z' },
      { status: 'failed', completed_at: '2026-05-08T12:00:00Z' },
      { status: 'paused', completed_at: '2026-05-09T22:00:00Z' },
    ];
    const buckets = successRateByDay(batches, 7, now);
    const may9 = buckets.find(b => b.date === '2026-05-09')!;
    expect(may9.completed).toBe(2);
    expect(may9.paused).toBe(1);
    expect(may9.successRate).toBe(67); // 2/3
    const may8 = buckets.find(b => b.date === '2026-05-08')!;
    expect(may8.failed).toBe(1);
    expect(may8.successRate).toBe(0);
  });

  it('drops batches outside the window', () => {
    const batches = [
      { status: 'completed', completed_at: '2026-05-01T00:00:00Z' }, // 8 days ago
    ];
    const buckets = successRateByDay(batches, 7, now);
    const total = buckets.reduce((s, b) => s + b.total, 0);
    expect(total).toBe(0);
  });

  it('falls back to updated_date / created_date when completed_at missing', () => {
    const batches = [
      { status: 'failed', updated_date: '2026-05-09T10:00:00Z' },
      { status: 'failed', created_date: '2026-05-09T11:00:00Z' },
    ];
    const buckets = successRateByDay(batches, 7, now);
    const may9 = buckets.find(b => b.date === '2026-05-09')!;
    expect(may9.failed).toBe(2);
  });

  it('skips batches without any timestamp', () => {
    const buckets = successRateByDay([{ status: 'completed' }], 7, now);
    const total = buckets.reduce((s, b) => s + b.total, 0);
    expect(total).toBe(0);
  });
});

describe('summarizeWindow', () => {
  it('rolls daily buckets into a window-level summary', () => {
    const buckets = [
      { date: '2026-05-08', completed: 5, failed: 2, paused: 1, other: 0, total: 8, successRate: 63 },
      { date: '2026-05-09', completed: 10, failed: 0, paused: 0, other: 1, total: 11, successRate: 91 },
    ];
    const summary = summarizeWindow(buckets);
    expect(summary.total).toBe(19);
    expect(summary.completed).toBe(15);
    expect(summary.failed).toBe(2);
    expect(summary.successRate).toBe(79);
  });

  it('returns successRate=null for an empty window', () => {
    const summary = summarizeWindow([]);
    expect(summary.total).toBe(0);
    expect(summary.successRate).toBeNull();
  });
});

describe('topErrorCategoriesFromBatches', () => {
  it('aggregates error_samples across batches and sorts by frequency', () => {
    const batches = [
      { error_samples: [
        { message: 'NPI must be 10 digits' },
        { message: 'NPI must be 10 digits' },
        { message: 'HTTP 500' },
      ] },
      { error_samples: [
        { detail: 'NPI must be 10 digits' },
      ] },
    ];
    const top = topErrorCategoriesFromBatches(batches, 5);
    expect(top[0].category).toBe('invalid_npi');
    expect(top[0].count).toBe(3);
    expect(top[1].category).toBe('network_api');
    expect(top[1].count).toBe(1);
  });

  it('reads both .message and .detail (different importers use different keys)', () => {
    const batches = [
      { error_samples: [{ message: 'fetch failed' }, { detail: 'fetch failed' }] },
    ];
    const top = topErrorCategoriesFromBatches(batches, 5);
    expect(top[0].count).toBe(2);
  });

  it('ignores batches with no error_samples', () => {
    const top = topErrorCategoriesFromBatches([{ status: 'completed' }, {}], 5);
    expect(top).toEqual([]);
  });

  it('truncates to topN', () => {
    const batches = [
      { error_samples: [
        { message: 'NPI bad' },
        { message: 'HTTP 500' },
        { message: 'duplicate key' },
        { message: 'timed out' },
      ] },
    ];
    const top = topErrorCategoriesFromBatches(batches, 2);
    expect(top).toHaveLength(2);
  });

  it('attaches the human-readable label from ERROR_CATEGORIES', () => {
    const batches = [{ error_samples: [{ message: 'HTTP 500' }] }];
    const top = topErrorCategoriesFromBatches(batches, 5);
    expect(top[0].label).toBe('Network / API Error');
  });
});

describe('summarizeRetryPipeline', () => {
  const now = new Date('2026-05-09T12:00:00Z');

  it('tallies failed batches by retry state', () => {
    const tooOldIso = new Date(now.getTime() - 50 * 60 * 60 * 1000).toISOString();
    const recentIso = new Date(now.getTime() - 30 * 60 * 1000).toISOString();       // still inside the first-attempt backoff
    const pastBackoffIso = new Date(now.getTime() - 90 * 60 * 1000).toISOString();   // past the 1h first-attempt backoff, within lookback
    const batches = [
      // never_tried — no auto-retry yet AND past the first-attempt backoff window
      { status: 'failed', import_type: 'medicare_hha_stats', completed_at: pastBackoffIso, created_date: pastBackoffIso },
      // pending — failed recently, still inside the first-attempt backoff window
      // (the worker would hold it in backoff_active, not run it yet)
      { status: 'failed', import_type: 'medicare_hha_stats', completed_at: recentIso, created_date: recentIso },
      // disabled
      { status: 'failed', import_type: 'medicare_hha_stats', completed_at: recentIso, created_date: recentIso, retry_params: { auto_retry_disabled: true } },
      // max_reached
      { status: 'failed', import_type: 'medicare_hha_stats', completed_at: recentIso, created_date: recentIso, retry_params: { auto_retry_count: 3 } },
      // too_old
      { status: 'failed', import_type: 'medicare_hha_stats', completed_at: tooOldIso, created_date: tooOldIso },
      // out_of_scope (NPPES)
      { status: 'failed', import_type: 'nppes_registry' },
    ];
    const buckets = summarizeRetryPipeline(batches, now);
    expect(buckets.never_tried).toBe(1);
    expect(buckets.pending).toBe(1);
    expect(buckets.disabled).toBe(1);
    expect(buckets.max_reached).toBe(1);
    expect(buckets.too_old).toBe(1);
    expect(buckets.out_of_scope).toBe(1);
  });

  it('returns all-zero counts for empty input', () => {
    const buckets = summarizeRetryPipeline([], now);
    expect(Object.values(buckets).every(v => v === 0)).toBe(true);
  });
});

describe('unhealthySchedules', () => {
  it('returns schedules at or above the threshold, sorted desc by failure count', () => {
    const schedules = [
      { id: 'a', label: 'A', consecutive_failures: 5 },
      { id: 'b', label: 'B', consecutive_failures: 0 },
      { id: 'c', label: 'C', consecutive_failures: 3 },
      { id: 'd', label: 'D', consecutive_failures: 2 },
    ];
    const result = unhealthySchedules(schedules, 3);
    expect(result.map(s => s.id)).toEqual(['a', 'c']);
  });

  it('treats missing consecutive_failures as 0', () => {
    const schedules = [{ id: 'a', label: 'A' }];
    expect(unhealthySchedules(schedules, 1)).toEqual([]);
  });
});

import { describe, it, expect } from 'vitest';
import {
  backoffHours,
  computeNextRun,
  dependencyBlocked,
  getImportFamily,
  jitterMs,
  FAILURE_BACKOFF_CAP_HOURS,
  NEXT_RUN_MIN_BUFFER_MS,
  SCHEDULE_JITTER_MINUTES,
} from '../base44/functions/runScheduledImports/helpers';

describe('getImportFamily', () => {
  it('groups Medicare ZIP imports into the medicare family', () => {
    expect(getImportFamily('medicare_hha_stats')).toBe('medicare');
    expect(getImportFamily('medicare_snf_stats')).toBe('medicare');
  });

  it('classifies NPPES separately from CMS imports', () => {
    expect(getImportFamily('nppes_registry')).toBe('nppes');
  });

  it('groups SNF + nursing home imports together (they share the same DB)', () => {
    expect(getImportFamily('snf_provider_measures')).toBe('snf');
    expect(getImportFamily('nursing_home_providers')).toBe('snf');
  });

  it('falls back to cms_other for unrecognized prefixes', () => {
    expect(getImportFamily('opt_out_physicians')).toBe('cms_other');
  });

  it('returns "unknown" for missing import_type', () => {
    expect(getImportFamily(null)).toBe('unknown');
    expect(getImportFamily(undefined)).toBe('unknown');
    expect(getImportFamily('')).toBe('unknown');
  });
});

describe('backoffHours', () => {
  it('returns 0 for no failures', () => {
    expect(backoffHours(0)).toBe(0);
    expect(backoffHours(-3)).toBe(0);
  });

  it('doubles each failure: 1, 2, 4, 8 hours', () => {
    expect(backoffHours(1)).toBe(1);
    expect(backoffHours(2)).toBe(2);
    expect(backoffHours(3)).toBe(4);
    expect(backoffHours(4)).toBe(8);
  });

  it('caps at FAILURE_BACKOFF_CAP_HOURS (24h)', () => {
    expect(backoffHours(10)).toBe(FAILURE_BACKOFF_CAP_HOURS);
    expect(backoffHours(100)).toBe(FAILURE_BACKOFF_CAP_HOURS);
  });
});

describe('jitterMs', () => {
  it('produces 0 when random is exactly 0.5 (centerline)', () => {
    expect(jitterMs(15, () => 0.5)).toBe(0);
  });

  it('produces -range at random 0', () => {
    expect(jitterMs(15, () => 0)).toBe(-15 * 60_000);
  });

  it('produces just under +range at random 0.999', () => {
    const result = jitterMs(15, () => 0.999);
    expect(result).toBeGreaterThan(14 * 60_000);
    expect(result).toBeLessThan(15 * 60_000);
  });

  it('stays within ±maxMinutes for any random value (sample 50 runs)', () => {
    const max = 15 * 60_000;
    for (let i = 0; i < 50; i++) {
      const j = jitterMs(15);
      expect(j).toBeGreaterThanOrEqual(-max);
      expect(j).toBeLessThanOrEqual(max);
    }
  });
});

describe('computeNextRun', () => {
  const now = new Date('2026-05-09T08:00:00Z');

  it('schedules a daily run for tomorrow at the configured time', () => {
    const next = computeNextRun(
      { schedule_time: '02:00', schedule_frequency: 'daily' },
      now,
      0,
      () => 0.5,
    );
    expect(next.getUTCDate()).toBe(10);
    expect(next.getUTCHours()).toBe(2);
    expect(next.getUTCMinutes()).toBe(0);
  });

  it('schedules a weekly run 7 days out', () => {
    const next = computeNextRun(
      { schedule_time: '03:30', schedule_frequency: 'weekly' },
      now,
      0,
      () => 0.5,
    );
    expect(next.getTime() - now.getTime()).toBeGreaterThan(6 * 24 * 60 * 60_000);
    expect(next.getTime() - now.getTime()).toBeLessThan(8 * 24 * 60 * 60_000);
  });

  it('on_completion frequency returns a 1h sentinel (no clamp, no jitter)', () => {
    const next = computeNextRun(
      { schedule_frequency: 'on_completion' },
      now,
      0,
      () => 0.5,
    );
    expect(next.getTime() - now.getTime()).toBe(60 * 60_000);
  });

  it('extends next_run_at by exponential backoff hours on consecutive failures', () => {
    const next0 = computeNextRun(
      { schedule_time: '02:00', schedule_frequency: 'daily' },
      now,
      0,
      () => 0.5,
    );
    const next3 = computeNextRun(
      { schedule_time: '02:00', schedule_frequency: 'daily' },
      now,
      3,
      () => 0.5,
    );
    // 3 failures = backoffHours(3) = 4 extra hours
    expect(next3.getTime() - next0.getTime()).toBe(4 * 60 * 60_000);
  });

  it('clamps next_run_at to >= now + buffer when jitter would push it into the past', () => {
    // Schedule for 2 minutes from now, with maximum negative jitter — would
    // otherwise land in the past.
    const target = new Date(now.getTime() + 2 * 60_000);
    const targetTime = `${String(target.getUTCHours()).padStart(2, '0')}:${String(target.getUTCMinutes()).padStart(2, '0')}`;
    const next = computeNextRun(
      { schedule_time: targetTime, schedule_frequency: 'daily' },
      now,
      0,
      () => 0, // max negative jitter
    );
    // Daily pushes a full day forward, so even with -15min jitter we're well in the future
    expect(next.getTime()).toBeGreaterThanOrEqual(now.getTime() + NEXT_RUN_MIN_BUFFER_MS);
  });

  it('clamps to now + buffer when result lands too close to now', () => {
    // Force a scenario: schedule with a time of "now + 1ms" tomorrow, max negative jitter
    const next = computeNextRun(
      // Use an obviously-near-now time and rely on jitter to push it past now
      { schedule_time: '08:00', schedule_frequency: 'daily' },
      now,
      0,
      () => 0,
    );
    expect(next.getTime()).toBeGreaterThanOrEqual(now.getTime() + NEXT_RUN_MIN_BUFFER_MS);
  });

  it('applies jitter (ms-level perturbation between runs)', () => {
    const a = computeNextRun(
      { schedule_time: '02:00', schedule_frequency: 'daily' },
      now,
      0,
      () => 0.2,
    );
    const b = computeNextRun(
      { schedule_time: '02:00', schedule_frequency: 'daily' },
      now,
      0,
      () => 0.8,
    );
    expect(a.getTime()).not.toBe(b.getTime());
    // Diff bounded by full jitter range
    const maxRange = SCHEDULE_JITTER_MINUTES * 60_000 * 2;
    expect(Math.abs(a.getTime() - b.getTime())).toBeLessThanOrEqual(maxRange);
  });
});

describe('dependencyBlocked', () => {
  const parent = {
    import_type: 'medicare_hha_stats',
    label: 'HHA',
    last_run_at: '2026-05-09T08:00:00Z',
    last_run_status: 'success',
  };

  it('returns blocked=false when no parent dependency declared', () => {
    expect(dependencyBlocked({}, [])).toEqual({ blocked: false });
  });

  it('blocks when parent schedule does not exist', () => {
    const result = dependencyBlocked(
      { depends_on_import_type: 'missing_type' },
      [parent],
    );
    expect(result.blocked).toBe(true);
    expect(result.reason).toMatch(/not configured/);
  });

  it('blocks when parent has never run', () => {
    const result = dependencyBlocked(
      { depends_on_import_type: 'medicare_hha_stats' },
      [{ ...parent, last_run_at: undefined }],
    );
    expect(result.blocked).toBe(true);
    expect(result.reason).toMatch(/run at least once/);
  });

  it('blocks when parent last run failed', () => {
    const result = dependencyBlocked(
      { depends_on_import_type: 'medicare_hha_stats' },
      [{ ...parent, last_run_status: 'failed' }],
    );
    expect(result.blocked).toBe(true);
    expect(result.reason).toMatch(/last run was failed/);
  });

  it('blocks when child has already succeeded against this parent run', () => {
    const result = dependencyBlocked(
      {
        depends_on_import_type: 'medicare_hha_stats',
        last_successful_run_at: '2026-05-09T09:00:00Z', // after parent's last_run_at
      },
      [parent],
    );
    expect(result.blocked).toBe(true);
    expect(result.reason).toMatch(/already ran successfully/i);
  });

  it('UNBLOCKS when child failed since parent last ran (allows retry)', () => {
    // Regression test for the bug fixed in this PR's predecessor:
    // previously the check used last_run_at, which made failed children
    // get blocked from retrying until the parent ran again.
    const result = dependencyBlocked(
      {
        depends_on_import_type: 'medicare_hha_stats',
        last_run_at: '2026-05-09T09:00:00Z', // newer than parent
        last_run_status: 'failed',
        // No last_successful_run_at, since the only run was a failure.
      },
      [parent],
    );
    expect(result.blocked).toBe(false);
  });

  it('unblocks when child has never run successfully', () => {
    const result = dependencyBlocked(
      { depends_on_import_type: 'medicare_hha_stats' },
      [parent],
    );
    expect(result.blocked).toBe(false);
  });
});

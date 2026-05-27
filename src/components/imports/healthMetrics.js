// Pure aggregation helpers for the Import Health dashboard. Extracted into
// a JS module so the math is unit-testable without rendering the page or
// mocking React.

import { categorizeError, getErrorMessage, ERROR_CATEGORIES } from './errorCategories';
import { getAutoRetryState } from './retryStatus';

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfUtcDay(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function isoDate(date) {
  return startOfUtcDay(date).toISOString().slice(0, 10);
}

// Group batches by the calendar day they finished (UTC), counting status
// outcomes per day. Returns an array sorted oldest -> newest, padded with zero
// rows so days with no activity still render on the chart.
//
// `now` is injectable for deterministic tests.
export function successRateByDay(batches, days = 30, now = new Date()) {
  const todayUtc = startOfUtcDay(now);
  const buckets = new Map();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(todayUtc.getTime() - i * DAY_MS);
    buckets.set(isoDate(d), { date: isoDate(d), completed: 0, failed: 0, paused: 0, other: 0 });
  }
  const cutoff = todayUtc.getTime() - (days - 1) * DAY_MS;
  for (const batch of batches) {
    const ts = batch.completed_at || batch.updated_date || batch.created_date;
    if (!ts) continue;
    const t = new Date(ts).getTime();
    if (isNaN(t) || t < cutoff) continue;
    const key = isoDate(new Date(t));
    const bucket = buckets.get(key);
    if (!bucket) continue;
    if (batch.status === 'completed') bucket.completed++;
    else if (batch.status === 'failed') bucket.failed++;
    else if (batch.status === 'paused') bucket.paused++;
    else bucket.other++;
  }
  return Array.from(buckets.values()).map(b => {
    const total = b.completed + b.failed + b.paused + b.other;
    const successRate = total === 0 ? null : Math.round((b.completed / total) * 100);
    return { ...b, total, successRate };
  });
}

// Top-level rollup over the full window — what the KPI tiles render.
export function summarizeWindow(buckets) {
  let completed = 0, failed = 0, paused = 0, other = 0;
  for (const b of buckets) {
    completed += b.completed;
    failed += b.failed;
    paused += b.paused;
    other += b.other;
  }
  const total = completed + failed + paused + other;
  return {
    total,
    completed,
    failed,
    paused,
    other,
    successRate: total === 0 ? null : Math.round((completed / total) * 100),
  };
}

// Walk every batch's error_samples and tally how often each error category
// appears. Returns `[ { category, count, label }, ... ]` sorted desc by count,
// truncated to `topN`.
export function topErrorCategoriesFromBatches(batches, topN = 10) {
  const counts = new Map();
  for (const batch of batches) {
    const samples = Array.isArray(batch.error_samples) ? batch.error_samples : [];
    for (const sample of samples) {
      const msg = getErrorMessage(sample);
      if (!msg) continue;
      const cat = categorizeError(msg);
      counts.set(cat, (counts.get(cat) || 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([category, count]) => ({
      category,
      count,
      label: ERROR_CATEGORIES[category]?.label || category,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);
}

// Bucket failed batches by the auto-retry state the worker would assign them.
// Mirrors the worker's retry pipeline so operators can see at a glance how
// many batches are currently waiting / eligible / disabled / aged out.
export function summarizeRetryPipeline(failedBatches, now = new Date()) {
  const buckets = {
    pending: 0,
    eligible: 0,
    never_tried: 0,
    disabled: 0,
    max_reached: 0,
    too_old: 0,
    out_of_scope: 0,
  };
  for (const batch of failedBatches) {
    const state = getAutoRetryState(batch, now);
    if (!state) {
      buckets.out_of_scope++;
      continue;
    }
    if (buckets[state.state] !== undefined) {
      buckets[state.state]++;
    } else {
      buckets.out_of_scope++;
    }
  }
  return buckets;
}

// Schedules whose consecutive_failures has tripped the worker's exponential
// backoff (>= 3 means we've hit the 4h backoff tier). These are the ones
// operators should look at first.
export function unhealthySchedules(schedules, threshold = 3) {
  return schedules
    .filter(s => (s.consecutive_failures || 0) >= threshold)
    .sort((a, b) => (b.consecutive_failures || 0) - (a.consecutive_failures || 0));
}

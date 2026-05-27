import { describe, it, expect } from "vitest";
import {
  getImportFamily,
  backoffHours,
  computeNextRun,
  dependencyBlocked,
  isRetryableErrorMessage,
  shouldRetryBatch,
  getRetryAttemptCount,
  backoffHoursForAttempt,
  nextRetryDueAt,
  FAILURE_BACKOFF_CAP_HOURS,
} from "../server/lib/scheduling";

const NO_JITTER = () => 0.5; // jitterMs((m), 0.5) === 0

describe("getImportFamily", () => {
  it("classifies families and falls back to cms_other / unknown", () => {
    expect(getImportFamily("nppes_registry")).toBe("nppes");
    expect(getImportFamily("medicare_physician_by_provider")).toBe("medicare");
    expect(getImportFamily("hospice_general_info")).toBe("hospice");
    expect(getImportFamily("snf_enrollments")).toBe("snf");
    expect(getImportFamily("nursing_home_providers")).toBe("snf");
    expect(getImportFamily("home_health_agencies")).toBe("hha");
    expect(getImportFamily("hospital_general_info")).toBe("cms_other");
    expect(getImportFamily(null)).toBe("unknown");
  });
});

describe("backoffHours", () => {
  it("doubles per failure and caps", () => {
    expect(backoffHours(0)).toBe(0);
    expect(backoffHours(1)).toBe(1);
    expect(backoffHours(2)).toBe(2);
    expect(backoffHours(3)).toBe(4);
    expect(backoffHours(4)).toBe(8);
    expect(backoffHours(99)).toBe(FAILURE_BACKOFF_CAP_HOURS);
  });
});

describe("computeNextRun", () => {
  const now = new Date("2026-05-27T12:00:00.000Z");

  it("on_completion returns a sentinel ~1h out", () => {
    const next = computeNextRun({ schedule_frequency: "on_completion" }, now, 0, NO_JITTER);
    const diff = next.getTime() - now.getTime();
    expect(diff).toBeGreaterThan(59 * 60_000);
    expect(diff).toBeLessThan(61 * 60_000);
  });

  it("daily schedules into the future", () => {
    const next = computeNextRun({ schedule_frequency: "daily", schedule_time: "02:00" }, now, 0, NO_JITTER);
    expect(next.getTime()).toBeGreaterThan(now.getTime());
    expect(next.getTime()).toBeLessThanOrEqual(now.getTime() + 26 * 60 * 60_000);
  });

  it("adds exponential backoff for consecutive failures", () => {
    const base = computeNextRun({ schedule_frequency: "daily", schedule_time: "02:00" }, now, 0, NO_JITTER);
    const withFailures = computeNextRun({ schedule_frequency: "daily", schedule_time: "02:00" }, now, 3, NO_JITTER);
    expect(withFailures.getTime() - base.getTime()).toBe(backoffHours(3) * 60 * 60_000);
  });

  it("never schedules into the immediate past (clamps with min buffer)", () => {
    const next = computeNextRun({ schedule_frequency: "daily", schedule_time: "00:00" }, now, 0, () => 0);
    expect(next.getTime()).toBeGreaterThanOrEqual(now.getTime());
  });
});

describe("dependencyBlocked", () => {
  const parent = { import_type: "parentType", label: "Parent", last_run_at: "2026-05-27T10:00:00.000Z", last_run_status: "success" };

  it("is not blocked without a dependency", () => {
    expect(dependencyBlocked({ import_type: "x" }, [parent]).blocked).toBe(false);
  });

  it("blocks when the parent is not configured", () => {
    expect(dependencyBlocked({ import_type: "child", depends_on_import_type: "missing" }, [parent]).blocked).toBe(true);
  });

  it("blocks when the parent has never run", () => {
    const p = { import_type: "parentType", label: "P" };
    expect(dependencyBlocked({ import_type: "c", depends_on_import_type: "parentType" }, [p]).blocked).toBe(true);
  });

  it("blocks when the parent's last run was not a success", () => {
    const p = { ...parent, last_run_status: "failed" };
    expect(dependencyBlocked({ import_type: "c", depends_on_import_type: "parentType" }, [p]).blocked).toBe(true);
  });

  it("allows when parent succeeded and child hasn't run since", () => {
    expect(dependencyBlocked({ import_type: "c", depends_on_import_type: "parentType" }, [parent]).blocked).toBe(false);
  });

  it("blocks when the child already ran successfully since the parent's last run", () => {
    const child = { import_type: "c", depends_on_import_type: "parentType", last_successful_run_at: "2026-05-27T11:00:00.000Z" };
    expect(dependencyBlocked(child, [parent]).blocked).toBe(true);
  });
});

describe("isRetryableErrorMessage", () => {
  it("matches transient network/timeout/rate-limit errors", () => {
    expect(isRetryableErrorMessage("HTTP 503 Service Unavailable")).toBe(true);
    expect(isRetryableErrorMessage("Request timed out")).toBe(true);
    expect(isRetryableErrorMessage("rate limit exceeded")).toBe(true);
    expect(isRetryableErrorMessage("fetch failed: ECONNREFUSED")).toBe(true);
  });

  it("does not match non-transient or numeric-noise errors", () => {
    expect(isRetryableErrorMessage("")).toBe(false);
    expect(isRetryableErrorMessage(null)).toBe(false);
    expect(isRetryableErrorMessage("validation failed on row 500")).toBe(false);
    expect(isRetryableErrorMessage("duplicate key value")).toBe(false);
  });
});

describe("getRetryAttemptCount", () => {
  it("takes the max of retry_params.auto_retry_count and top-level retry_count", () => {
    expect(getRetryAttemptCount({ retry_params: { auto_retry_count: 2 }, retry_count: 1 })).toBe(2);
    expect(getRetryAttemptCount({ retry_params: {}, retry_count: 3 })).toBe(3);
    expect(getRetryAttemptCount({})).toBe(0);
  });
});

describe("backoffHoursForAttempt / nextRetryDueAt", () => {
  it("computes attempt backoff and due time", () => {
    expect(backoffHoursForAttempt(1)).toBe(1);
    expect(backoffHoursForAttempt(3)).toBe(4);
    const due = nextRetryDueAt("2026-05-27T00:00:00.000Z", 1);
    expect(due?.toISOString()).toBe("2026-05-27T01:00:00.000Z");
    expect(nextRetryDueAt(null, 1)).toBeNull();
    expect(nextRetryDueAt("not-a-date", 1)).toBeNull();
  });
});

describe("shouldRetryBatch", () => {
  const now = new Date("2026-05-27T12:00:00.000Z");
  const ninetyMinAgo = new Date(now.getTime() - 90 * 60_000).toISOString();

  const eligibleBatch = {
    status: "failed",
    import_type: "medicare_physician_by_provider",
    error_samples: [{ message: "HTTP 503 Service Unavailable" }],
    completed_at: ninetyMinAgo,
    retry_params: {},
  };

  it("is eligible for a recent retryable failure past its backoff window", () => {
    const d = shouldRetryBatch(eligibleBatch, now);
    expect(d.eligible).toBe(true);
  });

  it("skips non-failed batches", () => {
    expect(shouldRetryBatch({ ...eligibleBatch, status: "completed" }, now).eligible).toBe(false);
  });

  it("skips the NPPES crawler (handled elsewhere)", () => {
    expect(shouldRetryBatch({ ...eligibleBatch, import_type: "nppes_registry" }, now).eligible).toBe(false);
  });

  it("skips non-retryable errors", () => {
    const d = shouldRetryBatch({ ...eligibleBatch, error_samples: [{ message: "bad column type" }] }, now);
    expect(d.eligible).toBe(false);
  });

  it("skips when max attempts reached", () => {
    const d = shouldRetryBatch({ ...eligibleBatch, retry_params: { auto_retry_count: 3 } }, now);
    expect(d.eligible).toBe(false);
  });

  it("respects the backoff window for a just-failed batch", () => {
    const d = shouldRetryBatch({ ...eligibleBatch, completed_at: now.toISOString() }, now);
    expect(d.eligible).toBe(false);
  });

  it("skips failures older than the lookback window", () => {
    const threeDaysAgo = new Date(now.getTime() - 72 * 60 * 60_000).toISOString();
    const d = shouldRetryBatch({ ...eligibleBatch, completed_at: threeDaysAgo }, now);
    expect(d.eligible).toBe(false);
  });

  it("honors an explicit auto_retry_disabled flag", () => {
    const d = shouldRetryBatch({ ...eligibleBatch, retry_params: { auto_retry_disabled: true } }, now);
    expect(d.eligible).toBe(false);
  });
});

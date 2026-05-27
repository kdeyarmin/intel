/**
 * Tests for the server-side maintenance helpers in
 * server/lib/maintenanceHelpers.ts. These are the canonical implementations as
 * we wind base44 down — the base44 copy in autoRetryFailedImports/helpers.ts
 * mirrors them and is covered by tests/autoRetryFailedImports.test.ts; once
 * base44/ is deleted, that test should be repointed to this module.
 */
import { describe, it, expect } from "vitest";
import {
  MAX_AUTO_RETRY_ATTEMPTS,
  RETRY_BACKOFF_CAP_HOURS,
  MAX_AUTO_RESUMES,
  isRetryableErrorMessage,
  extractErrorMessage,
  getRetryAttemptCount,
  backoffHoursForAttempt,
  nextRetryDueAt,
  shouldRetryBatch,
} from "../server/lib/maintenanceHelpers";

describe("server maintenanceHelpers — constants", () => {
  it("matches the documented caps", () => {
    expect(MAX_AUTO_RETRY_ATTEMPTS).toBe(3);
    expect(RETRY_BACKOFF_CAP_HOURS).toBe(24);
    expect(MAX_AUTO_RESUMES).toBe(5);
  });
});

describe("isRetryableErrorMessage", () => {
  it("flags transient HTTP/network errors", () => {
    expect(isRetryableErrorMessage("HTTP 503 Service Unavailable")).toBe(true);
    expect(isRetryableErrorMessage("Rate limit exceeded")).toBe(true);
    expect(isRetryableErrorMessage("ECONNREFUSED 127.0.0.1:5432")).toBe(true);
    expect(isRetryableErrorMessage("fetch failed")).toBe(true);
    expect(isRetryableErrorMessage("Operation timed out")).toBe(true);
  });

  it("rejects data-quality errors so we don't burn credits", () => {
    expect(isRetryableErrorMessage("NPI must be 10 digits")).toBe(false);
    expect(isRetryableErrorMessage("Duplicate key constraint")).toBe(false);
    expect(isRetryableErrorMessage(null)).toBe(false);
    expect(isRetryableErrorMessage(undefined)).toBe(false);
    expect(isRetryableErrorMessage("")).toBe(false);
  });

  it("does not match unrelated numerics like 'row 500'", () => {
    expect(isRetryableErrorMessage("Failed at row 500 of input")).toBe(false);
  });
});

describe("extractErrorMessage", () => {
  it("prefers cancel_reason over error_samples", () => {
    expect(extractErrorMessage({
      cancel_reason: "explicit cancel",
      error_samples: [{ detail: "sample detail" }],
    })).toBe("explicit cancel");
  });

  it("falls back to last error_sample detail then message", () => {
    expect(extractErrorMessage({ error_samples: [{ detail: "d" }] })).toBe("d");
    expect(extractErrorMessage({ error_samples: [{ message: "m" }] })).toBe("m");
    expect(extractErrorMessage({ error_samples: [{ detail: "d" }, { message: "m2" }] })).toBe("m2");
  });

  it("returns empty string when nothing is present", () => {
    expect(extractErrorMessage({})).toBe("");
    expect(extractErrorMessage({ error_samples: [] })).toBe("");
  });
});

describe("getRetryAttemptCount", () => {
  it("takes the max of retry_params.auto_retry_count and top-level retry_count", () => {
    expect(getRetryAttemptCount({ retry_params: { auto_retry_count: 2 }, retry_count: 1 })).toBe(2);
    expect(getRetryAttemptCount({ retry_params: { auto_retry_count: 0 }, retry_count: 3 })).toBe(3);
    expect(getRetryAttemptCount({})).toBe(0);
  });
});

describe("backoffHoursForAttempt", () => {
  it("doubles each attempt, capped at the configured limit", () => {
    expect(backoffHoursForAttempt(0)).toBe(0);
    expect(backoffHoursForAttempt(1)).toBe(1);
    expect(backoffHoursForAttempt(2)).toBe(2);
    expect(backoffHoursForAttempt(3)).toBe(4);
    expect(backoffHoursForAttempt(4)).toBe(8);
    expect(backoffHoursForAttempt(99)).toBe(RETRY_BACKOFF_CAP_HOURS);
  });
});

describe("nextRetryDueAt", () => {
  it("returns null for missing/invalid timestamps", () => {
    expect(nextRetryDueAt(null, 1)).toBeNull();
    expect(nextRetryDueAt(undefined, 1)).toBeNull();
    expect(nextRetryDueAt("not-a-date", 1)).toBeNull();
  });

  it("adds the right backoff to the last attempt timestamp", () => {
    const last = "2026-05-27T00:00:00Z";
    const due = nextRetryDueAt(last, 1)!;
    expect(due.toISOString()).toBe("2026-05-27T01:00:00.000Z");
  });
});

describe("shouldRetryBatch", () => {
  const now = new Date("2026-05-27T12:00:00Z");

  it("skips non-failed batches", () => {
    expect(shouldRetryBatch({ status: "completed" }, now)).toEqual({
      eligible: false,
      reason: "status_not_failed (completed)",
    });
  });

  it("skips NPPES (handled by its own crawler)", () => {
    const decision = shouldRetryBatch({ status: "failed", import_type: "nppes_registry" }, now);
    expect(decision.eligible).toBe(false);
    expect((decision as { reason: string }).reason).toBe("nppes_handled_elsewhere");
  });

  it("respects auto_retry_disabled", () => {
    const d = shouldRetryBatch({
      status: "failed",
      retry_params: { auto_retry_disabled: true },
      cancel_reason: "timeout",
      updated_date: now.toISOString(),
    }, now);
    expect(d.eligible).toBe(false);
  });

  it("blocks once max attempts reached", () => {
    const d = shouldRetryBatch({
      status: "failed",
      retry_params: { auto_retry_count: MAX_AUTO_RETRY_ATTEMPTS },
      cancel_reason: "timeout",
      updated_date: now.toISOString(),
    }, now);
    expect(d.eligible).toBe(false);
  });

  it("blocks non-retryable errors", () => {
    const d = shouldRetryBatch({
      status: "failed",
      cancel_reason: "NPI must be 10 digits",
      updated_date: now.toISOString(),
    }, now);
    expect(d.eligible).toBe(false);
    expect((d as { reason: string }).reason).toBe("non_retryable_error");
  });

  it("respects exponential backoff window", () => {
    // 0 attempts so far, last attempt 10 minutes ago — next would be 1h from
    // last_auto_retry_at, so we should be in backoff.
    const tenMinAgo = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
    const d = shouldRetryBatch({
      status: "failed",
      cancel_reason: "Operation timed out",
      retry_params: { last_auto_retry_at: tenMinAgo, auto_retry_count: 0 },
      updated_date: tenMinAgo,
    }, now);
    expect(d.eligible).toBe(false);
    expect((d as { reason: string }).reason).toMatch(/backoff_active/);
  });

  it("rejects batches older than the lookback window", () => {
    const fourDaysAgo = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString();
    const d = shouldRetryBatch({
      status: "failed",
      cancel_reason: "Operation timed out",
      completed_at: fourDaysAgo,
      updated_date: fourDaysAgo,
    }, now);
    expect(d.eligible).toBe(false);
    expect((d as { reason: string }).reason).toBe("too_old");
  });

  it("approves a transient failure once the backoff window has elapsed", () => {
    // First auto-retry attempt waits 1h after the original failure; use 2h to
    // be safely outside the window.
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
    const d = shouldRetryBatch({
      status: "failed",
      cancel_reason: "HTTP 503 Service Unavailable",
      updated_date: twoHoursAgo,
      completed_at: twoHoursAgo,
    }, now);
    expect(d.eligible).toBe(true);
    expect((d as { reason: string }).reason).toBe("retryable_failure");
  });
});

// Pure helpers for the maintenance workers (server/lib/maintenance.ts).
//
// The retry policy (which failures are transient, attempt caps, backoff) is
// defined once in server/lib/scheduling.ts and re-exported here so the workers
// and the cron driver can never disagree about it. The base44 copy in
// base44/functions/autoRetryFailedImports/helpers.ts mirrors it and goes away
// with the rest of base44/.

export {
  MAX_AUTO_RETRY_ATTEMPTS,
  RETRY_BACKOFF_CAP_HOURS,
  RETRY_LOOKBACK_MS,
  RETRYABLE_KEYWORDS,
  RETRYABLE_STATUS_CODE_PATTERN,
  isRetryableErrorMessage,
  extractErrorMessage,
  getRetryAttemptCount,
  backoffHoursForAttempt,
  nextRetryDueAt,
  shouldRetryBatch,
  type RetryDecision,
} from "./scheduling";

// A paused batch is auto-resumed at most this many times, so a chronically
// failing batch can't loop forever.
export const MAX_AUTO_RESUMES = 5;

// Identifier for who triggered a maintenance run. Recorded in the
// maintenance_fanout AuditEvent so operators can tell scheduled work apart
// from a button-press on the admin UI.
export type InvokedBy = "cron" | "admin_ui";

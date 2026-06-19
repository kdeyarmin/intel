// Pure helpers extracted from entry.ts so they can be unit-tested from Node
// without booting the Deno serve handler or instantiating the base44 SDK.

// #4 — process multiple schedules per invocation when they don't conflict
export const MAX_SCHEDULES_PER_INVOCATION = 5;

// #8 — exponential backoff cap (consecutive failures): 1h, 2h, 4h, 8h, capped at 24h
export const FAILURE_BACKOFF_CAP_HOURS = 24;

// #10 — schedule jitter: spread schedules within ±N minutes to avoid thundering herd
export const SCHEDULE_JITTER_MINUTES = 15;

// Minimum gap between now and the computed next_run_at, so a negative jitter
// near midnight (or near now) can't push the schedule into the immediate past
// and cause a tight reschedule loop.
export const NEXT_RUN_MIN_BUFFER_MS = 5 * 60_000;

// Non-conflicting import_type families. Schedules from the same family run
// sequentially, schedules from different families can run in parallel within
// one invocation.
export function getImportFamily(importType: string | null | undefined): string {
    if (!importType) return 'unknown';
    if (importType === 'nppes_registry') return 'nppes';
    if (importType.startsWith('medicare_')) return 'medicare';
    if (importType.startsWith('hospice_')) return 'hospice';
    if (importType.startsWith('snf_') || importType.startsWith('nursing_home_')) return 'snf';
    if (importType.startsWith('home_health_')) return 'hha';
    return 'cms_other';
}

// Symmetric jitter in ±maxMinutes range. Caller is expected to clamp the
// result so the final time stays in the future (see computeNextRun).
// Random source is injectable so tests can pin behavior.
export function jitterMs(maxMinutes: number, random: () => number = Math.random): number {
    const range = maxMinutes * 60_000;
    return Math.floor((random() - 0.5) * 2 * range);
}

export function backoffHours(consecutiveFailures: number): number {
    if (consecutiveFailures <= 0) return 0;
    return Math.min(Math.pow(2, consecutiveFailures - 1), FAILURE_BACKOFF_CAP_HOURS);
}

export type Schedule = {
    schedule_time?: string;
    schedule_frequency?: 'daily' | 'weekly' | 'monthly' | 'on_completion' | string;
    last_run_at?: string;
    last_successful_run_at?: string;
    last_run_status?: string;
    consecutive_failures?: number;
    label?: string;
    import_type?: string;
    depends_on_import_type?: string;
};

export function computeNextRun(
    schedule: Schedule,
    now: Date,
    failures: number,
    random: () => number = Math.random,
): Date {
    const next = new Date(now);
    // Validate schedule_time so a malformed value (e.g. "abc", "25:70", "2")
    // can't produce an Invalid Date that wedges the schedule. Mirrors the
    // server copy in server/lib/scheduling.ts.
    const [rawH, rawM] = (schedule.schedule_time || '02:00').split(':').map(Number);
    const hours = Number.isInteger(rawH) && rawH >= 0 && rawH <= 23 ? rawH : 2;
    const minutes = Number.isInteger(rawM) && rawM >= 0 && rawM <= 59 ? rawM : 0;

    // Use UTC setters so schedule_time is interpreted as UTC regardless of the
    // runtime timezone (the tests assert via getUTCHours; this makes the UTC
    // contract explicit and avoids DST/local-time drift).
    if (schedule.schedule_frequency === 'daily') {
        next.setUTCDate(next.getUTCDate() + 1);
    } else if (schedule.schedule_frequency === 'weekly') {
        next.setUTCDate(next.getUTCDate() + 7);
    } else if (schedule.schedule_frequency === 'monthly') {
        // Clamp to the last valid day of the target month so the 29th-31st in a
        // shorter month doesn't overflow (e.g. Jan 31 -> setUTCMonth would land
        // in early March, silently skipping February).
        const targetDay = next.getUTCDate();
        next.setUTCDate(1);
        next.setUTCMonth(next.getUTCMonth() + 1);
        const daysInTargetMonth = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
        next.setUTCDate(Math.min(targetDay, daysInTargetMonth));
    } else if (schedule.schedule_frequency === 'on_completion') {
        // No regular cadence — the dependency check handles it. Set to a sentinel ~1h out.
        next.setUTCHours(next.getUTCHours() + 1);
        return next;
    }
    next.setUTCHours(hours, minutes, 0, 0);

    // #8 — push out further on consecutive failures
    if (failures > 0) {
        next.setTime(next.getTime() + backoffHours(failures) * 60 * 60_000);
    }

    // #10 — jitter to spread same-time schedules. Clamp afterwards so a
    // negative jitter near midnight can't push next_run_at into the past.
    next.setTime(next.getTime() + jitterMs(SCHEDULE_JITTER_MINUTES, random));
    const minNext = now.getTime() + NEXT_RUN_MIN_BUFFER_MS;
    if (next.getTime() < minNext) {
        next.setTime(minNext);
    }

    return next;
}

// #4 — check whether a schedule's `depends_on_import_type` parent has
// completed successfully since the *last successful* run of this schedule.
// Tracking the child's last successful run (rather than its last_run_at)
// means failed children can still retry against the same parent run instead
// of being blocked until the parent runs again.
export function dependencyBlocked(
    schedule: Schedule,
    allSchedules: Schedule[],
): { blocked: boolean; reason?: string } {
    if (!schedule.depends_on_import_type) return { blocked: false };
    const parent = allSchedules.find(s => s.import_type === schedule.depends_on_import_type);
    if (!parent) {
        return { blocked: true, reason: `Dependency import_type=${schedule.depends_on_import_type} not configured` };
    }
    if (!parent.last_run_at) {
        return { blocked: true, reason: `Waiting for parent ${parent.label} to run at least once` };
    }
    if (parent.last_run_status && parent.last_run_status !== 'success') {
        return { blocked: true, reason: `Parent ${parent.label} last run was ${parent.last_run_status}` };
    }
    const childLastSuccess = schedule.last_successful_run_at
        ? new Date(schedule.last_successful_run_at)
        : null;
    if (childLastSuccess && childLastSuccess > new Date(parent.last_run_at)) {
        return { blocked: true, reason: `Already ran successfully since parent's last completion` };
    }
    return { blocked: false };
}

<<<<<<< HEAD
import React, { useEffect, useState, useCallback } from 'react';
import { Wrench, CheckCircle2, AlertCircle, Loader2, Play, AlertTriangle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
=======
import React, { useEffect, useState } from 'react';
import { Wrench, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
>>>>>>> refs/remotes/origin/main

const STALE_AFTER_MS = 30 * 60 * 1000;
const POLL_INTERVAL_MS = 60 * 1000;

<<<<<<< HEAD
// Tasks that an admin can trigger from the UI. Order is rendered as-is.
// `destructive` shows a confirmation dialog before invoking.
const MAINTENANCE_TASKS = [
  { key: 'runMaintenanceFanout', label: 'Run all maintenance', primary: true },
  { key: 'autoResumePausedImports', label: 'Resume paused imports' },
  { key: 'autoRetryFailedImports', label: 'Retry failed imports' },
  { key: 'cancelStalledImports', label: 'Cancel stalled imports' },
  { key: 'cleanupAllImports', label: 'Cleanup all imports', destructive: true },
];

=======
>>>>>>> refs/remotes/origin/main
function formatRelative(iso, now = new Date()) {
  if (!iso) return 'never';
  const timestamp = new Date(iso).getTime();
  if (Number.isNaN(timestamp)) return 'unknown';
  const diffMs = now.getTime() - timestamp;
  if (diffMs < 0) return 'in the future';
  const min = Math.round(diffMs / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

<<<<<<< HEAD
function summarizeWorkerResult(result) {
  if (!result) return null;
  if (Array.isArray(result.workers)) {
    const ok = result.workers.filter(w => w.ok).length;
    const failed = result.workers.length - ok;
    return `${ok} ok, ${failed} failed`;
  }
  const w = result.worker;
  if (!w) return result.success ? 'ok' : 'failed';
  const details = w.details || {};
  const parts = [];
  if (typeof details.scanned === 'number') parts.push(`${details.scanned} scanned`);
  if (typeof details.resumed_count === 'number') parts.push(`${details.resumed_count} resumed`);
  if (typeof details.retried_count === 'number') parts.push(`${details.retried_count} retried`);
  if (typeof details.cancelled === 'number') parts.push(`${details.cancelled} cancelled`);
  if (Array.isArray(details.errors) && details.errors.length > 0) parts.push(`${details.errors.length} errors`);
  if (!w.ok && w.error) parts.push(`error: ${w.error}`);
  return parts.length > 0 ? parts.join(', ') : (w.ok ? 'ok' : 'failed');
}

export default function MaintenanceHealthPanel() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [inFlight, setInFlight] = useState(null);
  const [lastResults, setLastResults] = useState({});
  const [confirmTask, setConfirmTask] = useState(null);

  const fetchHeartbeat = useCallback(async () => {
    try {
      const events = await base44.entities.AuditEvent.filter(
        { event_type: 'maintenance_fanout' },
        '-created_date',
        1,
      );
      setEvent(events?.[0] ?? null);
      setError(null);
    } catch (e) {
      setError(e.message || 'Failed to load maintenance status');
    } finally {
      setLoading(false);
    }
  }, []);
=======
export default function MaintenanceHealthPanel() {
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
>>>>>>> refs/remotes/origin/main

  useEffect(() => {
    let cancelled = false;
    let intervalId;
<<<<<<< HEAD
    const run = async () => {
      await fetchHeartbeat();
      if (!cancelled) intervalId = setInterval(fetchHeartbeat, POLL_INTERVAL_MS);
    };
    run();
=======

    const fetchHeartbeat = async () => {
      try {
        const events = await base44.entities.AuditEvent.filter(
          { event_type: 'maintenance_fanout' },
          '-created_date',
          1,
        );
        if (cancelled) return;
        setEvent(events?.[0] ?? null);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setError(e.message || 'Failed to load maintenance status');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchHeartbeat().finally(() => {
      // Start polling only after the initial fetch, so a slow first response
      // doesn't race with the second tick.
      if (!cancelled) intervalId = setInterval(fetchHeartbeat, POLL_INTERVAL_MS);
    });

>>>>>>> refs/remotes/origin/main
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
<<<<<<< HEAD
  }, [fetchHeartbeat]);

  const runTask = useCallback(async (key) => {
    setInFlight(key);
    try {
      const { data } = await base44.functions.invoke(key);
      setLastResults(prev => ({
        ...prev,
        [key]: { at: new Date().toISOString(), ok: data?.success !== false, summary: summarizeWorkerResult(data), raw: data },
      }));
      // Refresh heartbeat immediately so the panel reflects the just-written
      // AuditEvent without waiting for the next poll tick.
      fetchHeartbeat();
    } catch (e) {
      setLastResults(prev => ({
        ...prev,
        [key]: { at: new Date().toISOString(), ok: false, summary: `error: ${e.message || 'failed'}` },
      }));
    } finally {
      setInFlight(null);
    }
  }, [fetchHeartbeat]);

  const handleClick = (task) => {
    if (task.destructive) {
      setConfirmTask(task);
    } else {
      runTask(task.key);
    }
  };

  const confirmAndRun = () => {
    if (confirmTask) {
      const key = confirmTask.key;
      setConfirmTask(null);
      runTask(key);
    }
  };
=======
  }, []);
>>>>>>> refs/remotes/origin/main

  if (loading) {
    return (
      <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-3 flex items-center gap-2 text-xs text-slate-400">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Checking maintenance status...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 flex items-start gap-3">
        <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
        <div className="flex-1 text-xs text-red-200">
          <p className="font-semibold">Couldn't load maintenance status</p>
          <p className="text-red-300/80 mt-0.5">{error}</p>
        </div>
      </div>
    );
  }

<<<<<<< HEAD
  const lastRun = event?.timestamp ?? event?.created_date ?? null;
  const stale = lastRun && (Date.now() - new Date(lastRun).getTime() > STALE_AFTER_MS);
  const workers = Array.isArray(event?.details?.workers) ? event.details.workers : [];
  const failed = workers.filter(w => !w.ok);
  const skippedReason = event?.details?.skipped_reason;
  const invokedBy = event?.details?.invoked_by;
  // An empty workers array (or a skipped-due-to-budget heartbeat) is a partial
  // signal — neither healthy nor a hard failure. Surface it so operators don't
  // see a green panel that hides "fanout never actually ran."
  const partial = event && (workers.length === 0 || Boolean(skippedReason));

  let tone;
  let Icon;
  let headline;
  if (!event) {
    tone = { border: 'border-amber-500/30', bg: 'bg-amber-500/10', icon: 'text-amber-400', text: 'text-amber-200', sub: 'text-amber-300/80' };
    Icon = AlertCircle;
    headline = 'No maintenance runs recorded';
  } else if (stale || partial) {
    tone = { border: 'border-amber-500/30', bg: 'bg-amber-500/10', icon: 'text-amber-400', text: 'text-amber-200', sub: 'text-amber-300/80' };
    Icon = AlertCircle;
    headline = `Maintenance ran ${formatRelative(lastRun)}${stale ? ' (stale)' : ''}`;
  } else if (failed.length > 0) {
    tone = { border: 'border-orange-500/30', bg: 'bg-orange-500/10', icon: 'text-orange-400', text: 'text-orange-200', sub: 'text-orange-300/80' };
    Icon = AlertCircle;
    headline = `Maintenance ran ${formatRelative(lastRun)}`;
  } else {
    tone = { border: 'border-emerald-500/30', bg: 'bg-emerald-500/10', icon: 'text-emerald-400', text: 'text-emerald-200', sub: 'text-emerald-300/80' };
    Icon = CheckCircle2;
    headline = `Maintenance ran ${formatRelative(lastRun)}`;
  }

  return (
    <div className={`rounded-lg border ${tone.border} ${tone.bg} p-3 space-y-3`}>
      <div className="flex items-start gap-3">
        <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${tone.icon}`} />
        <div className={`flex-1 text-xs ${tone.text}`}>
          <p className="font-semibold mb-0.5 flex items-center gap-1.5">
            <Wrench className="w-3 h-3" />
            {headline}
            {invokedBy && <span className={`${tone.sub} font-normal`}>· {invokedBy === 'admin_ui' ? 'manual' : invokedBy}</span>}
          </p>
          {!event ? (
            <p className={tone.sub}>
              Either the schedule loop hasn't run yet, or the platform cron isn't wired.
              Workers like auto-retry and stalled-batch cleanup won't fire until it does.
            </p>
          ) : skippedReason ? (
            <p className={tone.sub}>Fanout skipped: {skippedReason}</p>
          ) : workers.length === 0 ? (
            <p className={tone.sub}>Heartbeat recorded but no worker results — possible incomplete payload.</p>
          ) : (
            <p className={tone.sub}>
              {workers.length} worker{workers.length === 1 ? '' : 's'} fanned out
              {failed.length > 0 && (
                <span className="text-orange-400">
                  {' '}— {failed.length} failed: {failed.map(w => w.worker).join(', ')}
                </span>
              )}
            </p>
          )}
        </div>
      </div>

      {isAdmin && (
        <div className="border-t border-slate-700/40 pt-2 space-y-1.5" data-testid="maintenance-actions">
          <p className="text-[11px] uppercase tracking-wide text-slate-400 font-medium">Manual controls</p>
          <div className="flex flex-wrap gap-1.5">
            {MAINTENANCE_TASKS.map(task => {
              const isInFlight = inFlight === task.key;
              return (
                <Button
                  key={task.key}
                  size="sm"
                  variant={task.primary ? 'default' : task.destructive ? 'destructive' : 'outline'}
                  disabled={Boolean(inFlight)}
                  onClick={() => handleClick(task)}
                  className="h-7 px-2 text-xs gap-1"
                >
                  {isInFlight ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                  {task.label}
                </Button>
              );
            })}
          </div>
          {Object.keys(lastResults).length > 0 && (
            <ul className="text-[11px] text-slate-400 space-y-0.5 mt-1.5">
              {MAINTENANCE_TASKS.filter(t => lastResults[t.key]).map(t => {
                const r = lastResults[t.key];
                return (
                  <li key={t.key} className="flex gap-2">
                    <span className={r.ok ? 'text-emerald-400' : 'text-orange-400'}>•</span>
                    <span className="text-slate-300">{t.label}:</span>
                    <span className="text-slate-400">{r.summary}</span>
                    <span className="text-slate-500 ml-auto">{formatRelative(r.at)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <Dialog open={Boolean(confirmTask)} onOpenChange={(open) => { if (!open) setConfirmTask(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              Run {confirmTask?.label}?
            </DialogTitle>
            <DialogDescription>
              This is a destructive maintenance task. It will cancel and delete in-flight import
              batches and clear the NPPES queue. Cron will continue to run on its normal schedule.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmTask(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmAndRun}>Run anyway</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

=======
  if (!event) {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 flex items-start gap-3">
        <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
        <div className="flex-1 text-xs text-amber-200">
          <p className="font-semibold">No maintenance runs recorded</p>
          <p className="text-amber-300/80 mt-0.5">
            Either the schedule loop hasn't run yet, or the platform cron isn't wired.
            Workers like auto-retry and stalled-batch cleanup won't fire until it does.
          </p>
        </div>
      </div>
    );
  }

  const lastRun = event.timestamp ?? event.created_date;
  const stale = lastRun && (Date.now() - new Date(lastRun).getTime() > STALE_AFTER_MS);
  const workers = Array.isArray(event.details?.workers) ? event.details.workers : [];
  const failed = workers.filter(w => !w.ok);
  const skippedReason = event.details?.skipped_reason;
  // An empty workers array (or a skipped-due-to-budget heartbeat) is a
  // partial signal — neither healthy nor a hard failure. Surface it so
  // operators don't see a green panel that hides "fanout never actually ran."
  const partial = workers.length === 0 || Boolean(skippedReason);

  const tone = stale || partial
    ? { border: 'border-amber-500/30', bg: 'bg-amber-500/10', icon: 'text-amber-400', text: 'text-amber-200', sub: 'text-amber-300/80' }
    : failed.length > 0
    ? { border: 'border-orange-500/30', bg: 'bg-orange-500/10', icon: 'text-orange-400', text: 'text-orange-200', sub: 'text-orange-300/80' }
    : { border: 'border-emerald-500/30', bg: 'bg-emerald-500/10', icon: 'text-emerald-400', text: 'text-emerald-200', sub: 'text-emerald-300/80' };

  const Icon = stale || partial || failed.length > 0 ? AlertCircle : CheckCircle2;

  return (
    <div className={`rounded-lg border ${tone.border} ${tone.bg} p-3 flex items-start gap-3`}>
      <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${tone.icon}`} />
      <div className={`flex-1 text-xs ${tone.text}`}>
        <p className="font-semibold mb-0.5 flex items-center gap-1.5">
          <Wrench className="w-3 h-3" />
          Maintenance ran {formatRelative(lastRun)}
          {stale && <span className="text-amber-400">(stale)</span>}
        </p>
        {skippedReason ? (
          <p className={tone.sub}>Fanout skipped: {skippedReason}</p>
        ) : workers.length === 0 ? (
          <p className={tone.sub}>Heartbeat recorded but no worker results — possible incomplete payload.</p>
        ) : (
          <p className={tone.sub}>
            {workers.length} worker{workers.length === 1 ? '' : 's'} fanned out
            {failed.length > 0 && (
              <span className="text-orange-400">
                {' '}— {failed.length} failed: {failed.map(w => w.worker).join(', ')}
              </span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
>>>>>>> refs/remotes/origin/main

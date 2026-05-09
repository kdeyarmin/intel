import React, { useEffect, useState } from 'react';
import { Wrench, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const STALE_AFTER_MS = 30 * 60 * 1000;

function formatRelative(iso, now = new Date()) {
  if (!iso) return 'never';
  const diffMs = now.getTime() - new Date(iso).getTime();
  const min = Math.round(diffMs / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

export default function MaintenanceHealthPanel() {
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const events = await base44.entities.AuditEvent.filter(
          { event_type: 'maintenance_fanout' },
          '-timestamp',
          1,
        );
        if (!cancelled) setEvent(events?.[0] ?? null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-3 flex items-center gap-2 text-xs text-slate-400">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Checking maintenance status...
      </div>
    );
  }

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

  const lastRun = event.timestamp;
  const stale = lastRun && (Date.now() - new Date(lastRun).getTime() > STALE_AFTER_MS);
  const workers = event.details?.workers ?? [];
  const failed = workers.filter(w => !w.ok);

  const tone = stale
    ? { border: 'border-amber-500/30', bg: 'bg-amber-500/10', icon: 'text-amber-400', text: 'text-amber-200', sub: 'text-amber-300/80' }
    : failed.length > 0
    ? { border: 'border-orange-500/30', bg: 'bg-orange-500/10', icon: 'text-orange-400', text: 'text-orange-200', sub: 'text-orange-300/80' }
    : { border: 'border-emerald-500/30', bg: 'bg-emerald-500/10', icon: 'text-emerald-400', text: 'text-emerald-200', sub: 'text-emerald-300/80' };

  const Icon = stale || failed.length > 0 ? AlertCircle : CheckCircle2;

  return (
    <div className={`rounded-lg border ${tone.border} ${tone.bg} p-3 flex items-start gap-3`}>
      <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${tone.icon}`} />
      <div className={`flex-1 text-xs ${tone.text}`}>
        <p className="font-semibold mb-0.5 flex items-center gap-1.5">
          <Wrench className="w-3 h-3" />
          Maintenance ran {formatRelative(lastRun)}
          {stale && <span className="text-amber-400">(stale)</span>}
        </p>
        <p className={tone.sub}>
          {workers.length} worker{workers.length === 1 ? '' : 's'} fanned out
          {failed.length > 0 && (
            <span className="text-orange-400">
              {' '}— {failed.length} failed: {failed.map(w => w.worker).join(', ')}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

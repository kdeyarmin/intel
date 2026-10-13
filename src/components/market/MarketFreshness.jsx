import React from 'react';
import { Clock } from 'lucide-react';
import { describeVintages } from '@/lib/marketFormat';
import { recordRows } from './marketData';

/** When the rollups behind a market view were computed, and which data vintages they used. */
export default function MarketFreshness({ rollups, jobs = [], vintages = null }) {
  const states = recordRows((Array.isArray(jobs) ? jobs : []).map((j) => rollups?.[j]));
  const refreshed = states.map((s) => s.refreshed_at).filter((date) => typeof date === 'string' && Number.isFinite(Date.parse(date))).sort().pop();
  const failed = states.find((s) => s.status === 'failed');
  const busy = states.some((s) => s.status === 'running' || s.status === 'queued');
  const vintage = describeVintages(vintages);
  let text;
  if (busy) text = 'Refreshing…';
  else if (refreshed) text = `Computed ${new Date(refreshed).toLocaleString()}`;
  else if (states.length && states.every((s) => s.status === 'never_run')) text = 'Not computed yet. Market rollups refresh in the background once a day after the CMS files are imported.';
  else text = null;
  if (!text && !vintage && !failed) return null;
  return (
    <p className="flex items-center gap-1 flex-wrap text-[11px] text-slate-400">
      <Clock className="w-3 h-3" aria-hidden="true" />
      {text}
      {vintage ? <span>{vintage}</span> : null}
      {failed ? <span className="text-red-400">Last refresh failed{typeof failed.error === 'string' ? `: ${failed.error}` : ''}</span> : null}
    </p>
  );
}

import React from 'react';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS',
  'KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY',
  'NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'
];

export default function StateCrawlerGrid({ status, currentState, running, autoMode, onStateClick }) {
  const completedSet = new Set(status?.completed_states || []);
  const failedSet = new Set(status?.failed_states || []);
  const processingSet = new Set(status?.processing_states || []);

  const getStateStatus = (st) => {
    if (st === currentState && (running || autoMode)) return 'active';
    if (st === status?.currently_processing_state && autoMode) return 'active';
    if (processingSet.has(st)) return 'processing';
    if (completedSet.has(st)) return 'completed';
    if (failedSet.has(st)) return 'failed';
    return 'pending';
  };

  const statusStyles = {
    active: 'bg-teal-500/20 border-teal-500/40 text-teal-400',
    completed: 'bg-green-500/15 border-green-500/30 text-green-400',
    failed: 'bg-red-500/15 border-red-500/30 text-red-400',
    processing: 'bg-amber-500/15 border-amber-500/30 text-amber-400',
    pending: 'bg-slate-800/50 border-slate-700/50 text-slate-500',
  };

  const statusIcons = {
    active: <Loader2 className="w-3 h-3 animate-spin" />,
    completed: <CheckCircle2 className="w-3 h-3" />,
    failed: <XCircle className="w-3 h-3" />,
    processing: <Loader2 className="w-3 h-3 animate-spin" />,
    pending: null,
  };

  return (
    <div className="grid grid-cols-8 sm:grid-cols-10 md:grid-cols-12 lg:grid-cols-[repeat(17,minmax(0,1fr))] gap-1.5">
      {US_STATES.map(st => {
        const stStatus = getStateStatus(st);
        return (
          <div
            key={st}
            onClick={() => onStateClick && onStateClick(st)}
            className={`flex items-center justify-center gap-0.5 px-1.5 py-1 rounded border text-xs font-medium cursor-pointer transition-all hover:ring-2 hover:ring-offset-1 hover:ring-teal-500 ${statusStyles[stStatus]}`}
            title={`${st}: ${stStatus} (Click for details)`}
          >
            {statusIcons[stStatus]}
            {st}
          </div>
        );
      })}
    </div>
  );
}
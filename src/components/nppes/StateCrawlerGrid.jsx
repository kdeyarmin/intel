import React from 'react';
import { CheckCircle2, XCircle, Loader2, Clock } from 'lucide-react';

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
    if (st === currentState && running) return 'active';
    if (completedSet.has(st)) return 'completed';
    if (failedSet.has(st)) return 'failed';
    if (processingSet.has(st)) return 'processing';
    return 'pending';
  };

  const statusStyles = {
    active: 'bg-teal-100 border-teal-400 text-teal-800',
    completed: 'bg-green-100 border-green-300 text-green-800',
    failed: 'bg-red-100 border-red-300 text-red-800',
    processing: 'bg-yellow-100 border-yellow-300 text-yellow-800',
    pending: 'bg-gray-50 border-gray-200 text-gray-500',
  };

  const statusIcons = {
    active: <Loader2 className="w-3 h-3 animate-spin" />,
    completed: <CheckCircle2 className="w-3 h-3" />,
    failed: <XCircle className="w-3 h-3" />,
    processing: <Loader2 className="w-3 h-3 animate-spin" />,
    pending: null,
  };

  return (
    <div className="grid grid-cols-10 sm:grid-cols-13 md:grid-cols-17 gap-1.5">
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
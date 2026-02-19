import React from 'react';
import { Clock, AlertTriangle, CheckCircle } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';

function DatasetRow({ label, lastUpdated, count }) {
  const daysSince = lastUpdated ? differenceInDays(new Date(), new Date(lastUpdated)) : null;
  const isStale = daysSince === null || daysSince > 30;
  const isWarning = daysSince !== null && daysSince > 14 && daysSince <= 30;

  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-1.5 min-w-0">
        {isStale
          ? <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
          : isWarning
          ? <Clock className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
          : <CheckCircle className="w-3.5 h-3.5 text-green-600 shrink-0" />
        }
        <span className="text-xs text-gray-700 truncate">{label}</span>
      </div>
      <div className="text-right shrink-0 ml-2">
        <span className={`text-[10px] font-medium ${isStale ? 'text-red-600' : isWarning ? 'text-yellow-600' : 'text-green-600'}`}>
          {lastUpdated ? `${daysSince}d ago` : 'Never'}
        </span>
        <span className="text-[10px] text-gray-400 ml-1.5">({count})</span>
      </div>
    </div>
  );
}

export default function TimelinessPanel({ datasets }) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-gray-700 mb-1">Data Timeliness</h4>
      <div className="divide-y divide-gray-100">
        {datasets.map((ds) => (
          <DatasetRow key={ds.label} {...ds} />
        ))}
      </div>
      <div className="flex gap-3 mt-2 text-[10px] text-gray-400">
        <span className="flex items-center gap-0.5"><CheckCircle className="w-2.5 h-2.5 text-green-500" /> &lt;14d</span>
        <span className="flex items-center gap-0.5"><Clock className="w-2.5 h-2.5 text-yellow-500" /> 14-30d</span>
        <span className="flex items-center gap-0.5"><AlertTriangle className="w-2.5 h-2.5 text-red-500" /> &gt;30d</span>
      </div>
    </div>
  );
}
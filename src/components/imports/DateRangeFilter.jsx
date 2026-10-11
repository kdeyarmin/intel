import React from 'react';
import { Input } from '@/components/ui/input';
import { Calendar } from 'lucide-react';

export default function DateRangeFilter({ startDate, endDate, onStartChange, onEndChange }) {
  return (
    <div className="flex items-center gap-1.5">
      <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
      <Input
        type="date"
        value={startDate}
        onChange={(e) => onStartChange(e.target.value)}
        className="h-8 w-[130px] text-xs bg-slate-800/50 border-slate-700 text-slate-300"
        placeholder="From"
        aria-label="Start date"
      />
      <span className="text-xs text-slate-400" aria-hidden="true">–</span>
      <Input
        type="date"
        value={endDate}
        onChange={(e) => onEndChange(e.target.value)}
        className="h-8 w-[130px] text-xs bg-slate-800/50 border-slate-700 text-slate-300"
        placeholder="To"
        aria-label="End date"
      />
    </div>
  );
}
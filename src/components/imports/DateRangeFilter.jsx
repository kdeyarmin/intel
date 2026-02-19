import React from 'react';
import { Input } from '@/components/ui/input';
import { Calendar } from 'lucide-react';

export default function DateRangeFilter({ startDate, endDate, onStartChange, onEndChange }) {
  return (
    <div className="flex items-center gap-1.5">
      <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
      <Input
        type="date"
        value={startDate}
        onChange={(e) => onStartChange(e.target.value)}
        className="h-8 w-[130px] text-xs"
        placeholder="From"
      />
      <span className="text-xs text-gray-400">–</span>
      <Input
        type="date"
        value={endDate}
        onChange={(e) => onEndChange(e.target.value)}
        className="h-8 w-[130px] text-xs"
        placeholder="To"
      />
    </div>
  );
}
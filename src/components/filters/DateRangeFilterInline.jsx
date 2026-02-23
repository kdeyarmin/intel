import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarDays } from 'lucide-react';

const QUICK_RANGES = [
  { value: 'all', label: 'All Time' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: '90d', label: 'Last 90 Days' },
  { value: '6m', label: 'Last 6 Months' },
  { value: '1y', label: 'Last Year' },
  { value: 'custom', label: 'Custom Range' },
];

function getQuickDate(preset) {
  const now = new Date();
  switch (preset) {
    case '7d': return new Date(now.setDate(now.getDate() - 7)).toISOString().split('T')[0];
    case '30d': return new Date(now.setDate(now.getDate() - 30)).toISOString().split('T')[0];
    case '90d': return new Date(now.setDate(now.getDate() - 90)).toISOString().split('T')[0];
    case '6m': return new Date(now.setMonth(now.getMonth() - 6)).toISOString().split('T')[0];
    case '1y': return new Date(now.setFullYear(now.getFullYear() - 1)).toISOString().split('T')[0];
    default: return '';
  }
}

export default function DateRangeFilterInline({ dateRange, onDateRangeChange }) {
  const { preset, startDate, endDate } = dateRange || { preset: 'all', startDate: '', endDate: '' };

  const handlePresetChange = (value) => {
    if (value === 'all') {
      onDateRangeChange({ preset: 'all', startDate: '', endDate: '' });
    } else if (value === 'custom') {
      onDateRangeChange({ preset: 'custom', startDate, endDate });
    } else {
      const start = getQuickDate(value);
      onDateRangeChange({ preset: value, startDate: start, endDate: new Date().toISOString().split('T')[0] });
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs text-slate-400">
        <CalendarDays className="w-3.5 h-3.5" />
        Date Range
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Select value={preset} onValueChange={handlePresetChange}>
          <SelectTrigger className="h-8 text-xs w-[140px] bg-slate-800/50 border-slate-700 text-slate-300">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {QUICK_RANGES.map(r => (
              <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {preset === 'custom' && (
          <>
            <div className="space-y-0.5">
              <Label className="text-[10px] text-slate-500">From</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => onDateRangeChange({ preset: 'custom', startDate: e.target.value, endDate })}
                className="h-8 text-xs w-[140px] bg-slate-800/50 border-slate-700 text-slate-200"
              />
            </div>
            <div className="space-y-0.5">
              <Label className="text-[10px] text-slate-500">To</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => onDateRangeChange({ preset: 'custom', startDate, endDate: e.target.value })}
                className="h-8 text-xs w-[140px] bg-slate-800/50 border-slate-700 text-slate-200"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function applyDateRangeFilter(data, dateField, dateRange) {
  if (!dateRange || dateRange.preset === 'all') return data;
  const { startDate, endDate } = dateRange;
  if (!startDate && !endDate) return data;
  return data.filter(row => {
    const val = row[dateField];
    if (!val) return false;
    const d = new Date(val);
    if (startDate && d < new Date(startDate)) return false;
    if (endDate && d > new Date(endDate + 'T23:59:59')) return false;
    return true;
  });
}
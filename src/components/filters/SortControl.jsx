import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

export default function SortControl({ sortField, sortDir, onSortChange, sortOptions = [] }) {
  return (
    <div className="flex items-center gap-1.5">
      <Select
        value={sortField || 'default'}
        onValueChange={(v) => onSortChange(v, sortDir || 'asc')}
      >
        <SelectTrigger className="h-8 text-xs w-[130px] bg-slate-800/50 border-slate-700 text-slate-300">
          <div className="flex items-center gap-1">
            <ArrowUpDown className="w-3 h-3 text-slate-400" />
            <SelectValue placeholder="Sort by" />
          </div>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="default">Default</SelectItem>
          {sortOptions.map(opt => (
            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {sortField && sortField !== 'default' && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onSortChange(sortField, sortDir === 'asc' ? 'desc' : 'asc')}
        >
          {sortDir === 'asc' ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />}
        </Button>
      )}
    </div>
  );
}
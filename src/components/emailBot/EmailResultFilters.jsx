import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function EmailResultFilters({ filters, onFiltersChange, counts }) {
  const hasActiveFilters = filters.validation !== 'all' || filters.confidence !== 'all' || filters.source !== 'all';

  const resetFilters = () => {
    onFiltersChange({ validation: 'all', confidence: 'all', source: 'all' });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5 text-xs text-slate-500">
        <Filter className="w-3.5 h-3.5" />
        <span>Filter:</span>
      </div>

      <Select value={filters.validation} onValueChange={(v) => onFiltersChange({ ...filters, validation: v })}>
        <SelectTrigger className="h-7 w-[130px] text-xs bg-slate-800/50 border-slate-700 text-slate-300">
          <SelectValue placeholder="Validation" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          <SelectItem value="valid">
            <span className="flex items-center gap-1.5">Valid <Badge className="bg-emerald-500/20 text-emerald-400 text-[9px] px-1">{counts.valid}</Badge></span>
          </SelectItem>
          <SelectItem value="risky">
            <span className="flex items-center gap-1.5">Risky <Badge className="bg-amber-500/20 text-amber-400 text-[9px] px-1">{counts.risky}</Badge></span>
          </SelectItem>
          <SelectItem value="invalid">
            <span className="flex items-center gap-1.5">Invalid <Badge className="bg-red-500/20 text-red-400 text-[9px] px-1">{counts.invalid}</Badge></span>
          </SelectItem>
          <SelectItem value="unknown">
            <span className="flex items-center gap-1.5">Unknown <Badge className="bg-slate-500/20 text-slate-400 text-[9px] px-1">{counts.unknown}</Badge></span>
          </SelectItem>
        </SelectContent>
      </Select>

      <Select value={filters.confidence} onValueChange={(v) => onFiltersChange({ ...filters, confidence: v })}>
        <SelectTrigger className="h-7 w-[130px] text-xs bg-slate-800/50 border-slate-700 text-slate-300">
          <SelectValue placeholder="Confidence" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Confidence</SelectItem>
          <SelectItem value="high">
            <span className="flex items-center gap-1.5">High <Badge className="bg-emerald-500/20 text-emerald-400 text-[9px] px-1">{counts.highConf}</Badge></span>
          </SelectItem>
          <SelectItem value="medium">
            <span className="flex items-center gap-1.5">Medium <Badge className="bg-amber-500/20 text-amber-400 text-[9px] px-1">{counts.medConf}</Badge></span>
          </SelectItem>
          <SelectItem value="low">
            <span className="flex items-center gap-1.5">Low <Badge className="bg-red-500/20 text-red-400 text-[9px] px-1">{counts.lowConf}</Badge></span>
          </SelectItem>
        </SelectContent>
      </Select>

      <Select value={filters.source} onValueChange={(v) => onFiltersChange({ ...filters, source: v })}>
        <SelectTrigger className="h-7 w-[150px] text-xs bg-slate-800/50 border-slate-700 text-slate-300">
          <SelectValue placeholder="Source" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Sources</SelectItem>
          {(counts.sources || []).map(s => (
            <SelectItem key={s} value={s}>{s.length > 25 ? s.slice(0, 25) + '…' : s}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasActiveFilters && (
        <Button onClick={resetFilters} variant="ghost" size="sm" className="h-7 text-xs text-slate-400 hover:text-white gap-1 px-2">
          <X className="w-3 h-3" /> Clear
        </Button>
      )}
    </div>
  );
}
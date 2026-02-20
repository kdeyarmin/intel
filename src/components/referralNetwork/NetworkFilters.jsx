import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, RotateCcw, Filter } from 'lucide-react';

export default function NetworkFilters({
  search, onSearchChange,
  entityType, onEntityTypeChange,
  state, onStateChange,
  specialty, onSpecialtyChange,
  minVolume, onMinVolumeChange,
  states = [],
  specialties = [],
  onReset,
  totalNodes,
  filteredNodes,
}) {
  const hasFilters = search || entityType !== 'all' || state !== 'all' || specialty !== 'all' || minVolume > 0;

  return (
    <Card className="bg-[#141d30] border-slate-700/50">
      <CardContent className="pt-4 pb-3">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <Input placeholder="Search NPI or name..." value={search} onChange={(e) => onSearchChange(e.target.value)} className="pl-8 h-8 text-xs bg-slate-800/50 border-slate-700 text-slate-300 placeholder:text-slate-600" />
          </div>
          <Select value={entityType} onValueChange={onEntityTypeChange}>
            <SelectTrigger className="w-32 h-8 text-xs bg-slate-800/50 border-slate-700 text-slate-300"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="Individual">Individual</SelectItem>
              <SelectItem value="Organization">Organization</SelectItem>
            </SelectContent>
          </Select>
          <Select value={state} onValueChange={onStateChange}>
            <SelectTrigger className="w-28 h-8 text-xs bg-slate-800/50 border-slate-700 text-slate-300"><SelectValue placeholder="State" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All States</SelectItem>
              {states.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={specialty} onValueChange={onSpecialtyChange}>
            <SelectTrigger className="w-40 h-8 text-xs bg-slate-800/50 border-slate-700 text-slate-300"><SelectValue placeholder="Specialty" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Specialties</SelectItem>
              {specialties.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="number" placeholder="Min volume" value={minVolume || ''} onChange={(e) => onMinVolumeChange(Number(e.target.value) || 0)} className="w-28 h-8 text-xs bg-slate-800/50 border-slate-700 text-slate-300 placeholder:text-slate-600" />
          {hasFilters && (
            <Button variant="ghost" size="sm" className="h-8 text-xs gap-1 text-slate-500 hover:text-slate-300" onClick={onReset}>
              <RotateCcw className="w-3 h-3" /> Reset
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2 mt-2">
          <Filter className="w-3 h-3 text-slate-500" />
          <span className="text-[10px] text-slate-500">Showing {filteredNodes} of {totalNodes} providers</span>
          {hasFilters && <Badge variant="secondary" className="text-[9px]">Filtered</Badge>}
        </div>
      </CardContent>
    </Card>
  );
}
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Filter, RotateCcw } from 'lucide-react';
import { SPECIALTY_GROUPS } from '@/lib/specialtyGroups';
import { US_STATES } from '@/lib/usStates';

const GROUP_OPTIONS = [...SPECIALTY_GROUPS].sort((a, b) => a.label.localeCompare(b.label));

/**
 * Territory filters. State, specialty and type are applied by the server
 * (they change which providers are loaded); score and volume filter the
 * providers already shown.
 */
export default function TerritoryMapFilters({ filters, onChange, onReset, providerCount, availableStates = [] }) {
  const update = (patch) => onChange(patch);
  const approxByState = new Map(availableStates.map((s) => [s.state, s.approx]));
  const activeCount = [
    filters.group !== 'all',
    filters.minScore !== '',
    filters.maxScore !== '',
    filters.minVolume !== '',
    filters.state !== 'PA',
    filters.type !== 'all',
    filters.unscored === 'hide',
  ].filter(Boolean).length;

  return (
    <Card className="h-fit">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-teal-400" aria-hidden="true" />
            Map filters
          </span>
          <div className="flex items-center gap-2">
            {activeCount > 0 && <Badge className="bg-teal-900/30 text-teal-400 text-[10px]">{activeCount} active</Badge>}
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onReset} aria-label="Reset filters">
              <RotateCcw className="w-3 h-3" aria-hidden="true" />
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="territory-state" className="text-xs">State</Label>
          <Select value={filters.state} onValueChange={(v) => update({ state: v })}>
            <SelectTrigger id="territory-state" className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All states (top-scored sample)</SelectItem>
              {US_STATES.map((st) => {
                const approx = approxByState.get(st);
                return (
                  <SelectItem key={st} value={st}>
                    {st}{approx ? ` (≈${approx.toLocaleString()} locations)` : ''}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="territory-specialty" className="text-xs">Specialty</Label>
          <Select value={filters.group} onValueChange={(v) => update({ group: v })}>
            <SelectTrigger id="territory-specialty" className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All specialties</SelectItem>
              {GROUP_OPTIONS.map((g) => <SelectItem key={g.key} value={g.key}>{g.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="territory-type" className="text-xs">Provider type</Label>
          <Select value={filters.type} onValueChange={(v) => update({ type: v })}>
            <SelectTrigger id="territory-type" className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="Individual">Individuals</SelectItem>
              <SelectItem value="Organization">Organizations</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <fieldset className="space-y-1">
          <legend className="text-xs font-medium">Score range</legend>
          <div className="grid grid-cols-2 gap-2">
            <Input type="number" min={0} max={100} placeholder="Min" aria-label="Minimum score" value={filters.minScore} onChange={(e) => update({ minScore: e.target.value })} className="h-8 text-xs" />
            <Input type="number" min={0} max={100} placeholder="Max" aria-label="Maximum score" value={filters.maxScore} onChange={(e) => update({ maxScore: e.target.value })} className="h-8 text-xs" />
          </div>
          <div className="flex items-center justify-between pt-1">
            <Label htmlFor="territory-unscored" className="text-[11px] text-slate-400">Show unscored providers</Label>
            <Switch id="territory-unscored" checked={filters.unscored !== 'hide'} onCheckedChange={(v) => update({ unscored: v ? 'show' : 'hide' })} />
          </div>
        </fieldset>

        <div className="space-y-1">
          <Label htmlFor="territory-volume" className="text-xs">Minimum Medicare beneficiaries</Label>
          <Input id="territory-volume" type="number" min={0} placeholder="e.g. 100" value={filters.minVolume} onChange={(e) => update({ minVolume: e.target.value })} className="h-8 text-xs" />
        </div>

        <div className="space-y-2 pt-2 border-t border-slate-700/50">
          <div className="flex items-center justify-between">
            <Label htmlFor="territory-color" className="text-xs">Color by score</Label>
            <Switch id="territory-color" checked={filters.color} onCheckedChange={(v) => update({ color: v })} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="territory-heat" className="text-xs">Density heatmap</Label>
            <Switch id="territory-heat" checked={filters.heat} onCheckedChange={(v) => update({ heat: v })} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="territory-vol" className="text-xs">Patient volume overlay</Label>
            <Switch id="territory-vol" checked={filters.volume} onCheckedChange={(v) => update({ volume: v })} />
          </div>
        </div>

        <p className="text-xs text-slate-400 pt-2 border-t border-slate-700/50">{providerCount.toLocaleString()} providers match</p>
      </CardContent>
    </Card>
  );
}

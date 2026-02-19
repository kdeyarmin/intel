import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Filter, RotateCcw } from 'lucide-react';

const SPECIALTIES = [
  'Family Medicine', 'Internal Medicine', 'Psychiatry', 'Geriatric Medicine',
  'Nurse Practitioner', 'Physician Assistant', 'Physical Therapy',
  'Cardiology', 'Home Health', 'Hospice', 'Social Worker', 'Psychology',
  'Occupational Therapy', 'Speech-Language Pathology',
];

export default function TerritoryMapFilters({ filters, onChange, onReset, providerCount }) {
  const update = (key, value) => onChange({ ...filters, [key]: value });

  const activeCount = [
    filters.specialty !== 'all',
    filters.minScore,
    filters.maxScore,
    filters.minVolume,
    filters.stateFilter !== 'PA',
    filters.entityType !== 'all',
  ].filter(Boolean).length;

  return (
    <Card className="h-fit">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-teal-600" />
            Map Filters
          </span>
          <div className="flex items-center gap-2">
            {activeCount > 0 && (
              <Badge className="bg-teal-100 text-teal-700 text-[10px]">{activeCount} active</Badge>
            )}
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onReset} title="Reset">
              <RotateCcw className="w-3 h-3" />
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label className="text-xs">State</Label>
          <Select value={filters.stateFilter} onValueChange={(v) => update('stateFilter', v)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All States</SelectItem>
              <SelectItem value="PA">Pennsylvania</SelectItem>
              <SelectItem value="NJ">New Jersey</SelectItem>
              <SelectItem value="NY">New York</SelectItem>
              <SelectItem value="DE">Delaware</SelectItem>
              <SelectItem value="MD">Maryland</SelectItem>
              <SelectItem value="OH">Ohio</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs">Specialty</Label>
          <Select value={filters.specialty} onValueChange={(v) => update('specialty', v)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Specialties</SelectItem>
              {SPECIALTIES.map(s => (
                <SelectItem key={s} value={s.toLowerCase()}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs">Provider Type</Label>
          <Select value={filters.entityType} onValueChange={(v) => update('entityType', v)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="Individual">Individual</SelectItem>
              <SelectItem value="Organization">Organization</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Min Score</Label>
            <Input
              type="number" min="0" max="100" placeholder="0"
              value={filters.minScore}
              onChange={(e) => update('minScore', e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div>
            <Label className="text-xs">Max Score</Label>
            <Input
              type="number" min="0" max="100" placeholder="100"
              value={filters.maxScore}
              onChange={(e) => update('maxScore', e.target.value)}
              className="h-8 text-xs"
            />
          </div>
        </div>

        <div>
          <Label className="text-xs">Min Beneficiaries</Label>
          <Input
            type="number" min="0" placeholder="e.g., 100"
            value={filters.minVolume}
            onChange={(e) => update('minVolume', e.target.value)}
            className="h-8 text-xs"
          />
        </div>

        <div className="flex items-center justify-between">
          <Label className="text-xs">Show Heatmap</Label>
          <Switch checked={filters.showHeatmap} onCheckedChange={(v) => update('showHeatmap', v)} />
        </div>

        <div className="flex items-center justify-between">
          <Label className="text-xs">Color by Score</Label>
          <Switch checked={filters.colorByScore} onCheckedChange={(v) => update('colorByScore', v)} />
        </div>

        <div className="pt-2 border-t text-center">
          <p className="text-xs text-slate-500">
            <span className="font-semibold text-slate-700">{providerCount}</span> providers on map
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Save, Play, X } from 'lucide-react';
import { DATASET_CONFIG } from './reportConfig';

export default function ReportBuilderForm({ config, onChange, onRun, onSave, onCancel, saving }) {
  const dsConfig = DATASET_CONFIG[config.dataset] || null;

  const updateConfig = (key, value) => onChange({ ...config, [key]: value });
  const updateFilter = (key, value) => onChange({ ...config, filters: { ...config.filters, [key]: value } });

  const toggleMetric = (metricKey) => {
    const current = config.metrics || [];
    const updated = current.includes(metricKey)
      ? current.filter(m => m !== metricKey)
      : [...current, metricKey];
    updateConfig('metrics', updated);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Report Builder</CardTitle>
          {onCancel && (
            <Button variant="ghost" size="icon" onClick={onCancel} className="h-7 w-7">
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Name */}
        <div>
          <Label className="text-xs">Report Name</Label>
          <Input
            value={config.name || ''}
            onChange={e => updateConfig('name', e.target.value)}
            placeholder="My Custom Report"
            className="mt-1"
          />
        </div>

        {/* Dataset */}
        <div>
          <Label className="text-xs">Dataset</Label>
          <Select value={config.dataset || ''} onValueChange={v => onChange({ ...config, dataset: v, metrics: [], group_by: '', filters: {} })}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select a dataset" /></SelectTrigger>
            <SelectContent>
              {Object.entries(DATASET_CONFIG).map(([key, ds]) => (
                <SelectItem key={key} value={key}>{ds.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {dsConfig && (
          <>
            {/* Metrics */}
            <div>
              <Label className="text-xs mb-2 block">Metrics (select at least one)</Label>
              <div className="grid grid-cols-2 gap-2">
                {dsConfig.metrics.map(m => (
                  <label key={m.key} className="flex items-center gap-2 text-xs cursor-pointer">
                    <Checkbox
                      checked={(config.metrics || []).includes(m.key)}
                      onCheckedChange={() => toggleMetric(m.key)}
                    />
                    {m.label}
                  </label>
                ))}
              </div>
            </div>

            {/* Group By */}
            <div>
              <Label className="text-xs">Group By</Label>
              <Select value={config.group_by || ''} onValueChange={v => updateConfig('group_by', v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select grouping" /></SelectTrigger>
                <SelectContent>
                  {dsConfig.groupOptions.map(g => (
                    <SelectItem key={g.key} value={g.key}>{g.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Chart Type */}
            <div>
              <Label className="text-xs">Chart Type</Label>
              <Select value={config.chart_type || 'bar'} onValueChange={v => updateConfig('chart_type', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bar">Bar Chart</SelectItem>
                  <SelectItem value="line">Line Chart</SelectItem>
                  <SelectItem value="pie">Pie Chart</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Filters */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Filters</Label>
              {dsConfig.filters.includes('year') && (
                <div>
                  <Label className="text-[11px] text-slate-500">Year</Label>
                  <Input
                    type="number"
                    placeholder="e.g. 2021"
                    value={config.filters?.year || ''}
                    onChange={e => updateFilter('year', e.target.value ? parseInt(e.target.value) : undefined)}
                    className="mt-0.5"
                  />
                </div>
              )}
              {dsConfig.filters.includes('state') && (
                <div>
                  <Label className="text-[11px] text-slate-500">State (2-letter)</Label>
                  <Input
                    placeholder="e.g. FL"
                    value={config.filters?.state || ''}
                    onChange={e => updateFilter('state', e.target.value.toUpperCase())}
                    className="mt-0.5"
                    maxLength={2}
                  />
                </div>
              )}
              {dsConfig.filters.includes('hospital_type') && (
                <div>
                  <Label className="text-[11px] text-slate-500">Hospital Type</Label>
                  <Input
                    placeholder="e.g. Short-Stay"
                    value={config.filters?.hospital_type || ''}
                    onChange={e => updateFilter('hospital_type', e.target.value)}
                    className="mt-0.5"
                  />
                </div>
              )}
              {dsConfig.filters.includes('table_name') && (
                <div>
                  <Label className="text-[11px] text-slate-500">Table Name</Label>
                  <Input
                    placeholder="e.g. D1, SNF3, HHA2"
                    value={config.filters?.table_name || ''}
                    onChange={e => updateFilter('table_name', e.target.value.toUpperCase())}
                    className="mt-0.5"
                  />
                </div>
              )}
            </div>
          </>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button onClick={onRun} disabled={!config.dataset || !(config.metrics?.length)} className="flex-1 gap-1.5">
            <Play className="w-3.5 h-3.5" /> Run Report
          </Button>
          <Button variant="outline" onClick={onSave} disabled={saving || !config.name || !config.dataset || !(config.metrics?.length)} className="gap-1.5">
            <Save className="w-3.5 h-3.5" /> Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
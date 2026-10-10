import React, { useId, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge, badgeVariants } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { X, Plus, Save, Clock } from 'lucide-react';
import { DATASET_CONFIG } from '../customReports/reportConfig';

const EXTRA_DATASETS = {
  providers: {
    label: 'Providers',
    metrics: [
      { key: 'npi', label: 'NPI Count' },
    ],
    groupOptions: [
      { key: 'entity_type', label: 'Entity Type' },
      { key: 'status', label: 'Status' },
      { key: 'gender', label: 'Gender' },
    ],
  },
  locations: {
    label: 'Provider Locations',
    metrics: [
      { key: 'npi', label: 'Location Count' },
    ],
    groupOptions: [
      { key: 'state', label: 'State' },
      { key: 'location_type', label: 'Location Type' },
      { key: 'city', label: 'City' },
    ],
  },
};

const ALL_DATASETS = { ...DATASET_CONFIG, ...EXTRA_DATASETS };
const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function ReportScheduleForm({ initialData, onSave, onCancel, saving }) {
  const uid = useId();
  const [form, setForm] = useState({
    name: '',
    description: '',
    dataset: '',
    metrics: [],
    group_by: '',
    chart_type: 'bar',
    filters: {},
    frequency: 'weekly',
    schedule_day: 'Monday',
    schedule_time: '08:00',
    recipients: [],
    is_active: true,
    include_csv: true,
    include_summary: true,
    max_rows: 500,
    ...initialData,
  });
  const [newEmail, setNewEmail] = useState('');

  const dsConfig = ALL_DATASETS[form.dataset];

  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const addRecipient = () => {
    if (newEmail && newEmail.includes('@') && !form.recipients.includes(newEmail)) {
      update('recipients', [...form.recipients, newEmail]);
      setNewEmail('');
    }
  };

  const removeRecipient = (email) => {
    update('recipients', form.recipients.filter(e => e !== email));
  };

  const toggleMetric = (key) => {
    update('metrics', form.metrics.includes(key)
      ? form.metrics.filter(m => m !== key)
      : [...form.metrics, key]
    );
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="w-4 h-4 text-blue-600" />
          {initialData?.id ? 'Edit Scheduled Report' : 'Create Scheduled Report'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name & Description */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor={`${uid}-name`} id={`${uid}-name-label`} className="text-xs">Report Name *</Label>
              <Input
                id={`${uid}-name`}
                aria-labelledby={`${uid}-name-label`}
                placeholder="Weekly Provider Summary"
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${uid}-description`} id={`${uid}-description-label`} className="text-xs">Description</Label>
              <Input
                id={`${uid}-description`}
                aria-labelledby={`${uid}-description-label`}
                placeholder="Optional description..."
                value={form.description}
                onChange={(e) => update('description', e.target.value)}
              />
            </div>
          </div>

          {/* Dataset */}
          <div className="space-y-1">
            <Label htmlFor={`${uid}-dataset`} className="text-xs">Dataset *</Label>
            <Select value={form.dataset} onValueChange={(v) => { update('dataset', v); update('metrics', []); update('group_by', ''); }}>
              <SelectTrigger id={`${uid}-dataset`}><SelectValue placeholder="Select dataset..." /></SelectTrigger>
              <SelectContent>
                {Object.entries(ALL_DATASETS).map(([key, cfg]) => (
                  <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Metrics */}
          {dsConfig && (
            <>
              <div className="space-y-1">
                <span id={`${uid}-metrics-label`} className="text-xs font-medium leading-none">Metrics</span>
                <div role="group" aria-labelledby={`${uid}-metrics-label`} className="flex flex-wrap gap-1.5">
                  {dsConfig.metrics.map(m => (
                    <button
                      type="button"
                      key={m.key}
                      aria-pressed={form.metrics.includes(m.key)}
                      className={cn(badgeVariants({ variant: form.metrics.includes(m.key) ? 'default' : 'outline' }), 'cursor-pointer text-xs')}
                      onClick={() => toggleMetric(m.key)}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor={`${uid}-group-by`} className="text-xs">Group By</Label>
                  <Select value={form.group_by} onValueChange={(v) => update('group_by', v)}>
                    <SelectTrigger id={`${uid}-group-by`}><SelectValue placeholder="Select grouping..." /></SelectTrigger>
                    <SelectContent>
                      {dsConfig.groupOptions.map(g => (
                        <SelectItem key={g.key} value={g.key}>{g.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`${uid}-chart-type`} className="text-xs">Chart Type</Label>
                  <Select value={form.chart_type} onValueChange={(v) => update('chart_type', v)}>
                    <SelectTrigger id={`${uid}-chart-type`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bar">Bar Chart</SelectItem>
                      <SelectItem value="line">Line Chart</SelectItem>
                      <SelectItem value="pie">Pie Chart</SelectItem>
                      <SelectItem value="table_only">Table Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          )}

          {/* Schedule */}
          <div role="group" aria-labelledby={`${uid}-schedule-label`} className="border-t pt-3 space-y-3">
            <span id={`${uid}-schedule-label`} className="text-xs font-semibold leading-none text-slate-300">Schedule</span>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor={`${uid}-frequency`} className="text-xs">Frequency *</Label>
                <Select value={form.frequency} onValueChange={(v) => update('frequency', v)}>
                  <SelectTrigger id={`${uid}-frequency`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.frequency === 'weekly' && (
                <div className="space-y-1">
                  <Label htmlFor={`${uid}-day`} className="text-xs">Day</Label>
                  <Select value={form.schedule_day} onValueChange={(v) => update('schedule_day', v)}>
                    <SelectTrigger id={`${uid}-day`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DAYS_OF_WEEK.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {form.frequency === 'monthly' && (
                <div className="space-y-1">
                  <Label htmlFor={`${uid}-day-of-month`} id={`${uid}-day-of-month-label`} className="text-xs">Day of Month</Label>
                  <Input
                    id={`${uid}-day-of-month`}
                    aria-labelledby={`${uid}-day-of-month-label`}
                    type="number"
                    min={1}
                    max={28}
                    value={form.schedule_day}
                    onChange={(e) => update('schedule_day', e.target.value)}
                  />
                </div>
              )}
              <div className="space-y-1">
                <Label htmlFor={`${uid}-time`} id={`${uid}-time-label`} className="text-xs">Time (ET)</Label>
                <Input
                  id={`${uid}-time`}
                  aria-labelledby={`${uid}-time-label`}
                  type="time"
                  value={form.schedule_time}
                  onChange={(e) => update('schedule_time', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Recipients */}
          <div className="border-t pt-3 space-y-2">
            <Label htmlFor={`${uid}-recipient`} id={`${uid}-recipient-label`} className="text-xs font-semibold text-slate-300">Recipients *</Label>
            <p id={`${uid}-recipient-hint`} className="text-[11px] text-slate-500">Reports are only emailed to people who have an account in this app.</p>
            <div className="flex gap-2">
              <Input
                id={`${uid}-recipient`}
                aria-labelledby={`${uid}-recipient-label`}
                aria-describedby={`${uid}-recipient-hint`}
                placeholder="email@example.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addRecipient())}
                className="flex-1"
              />
              <Button type="button" size="sm" variant="outline" onClick={addRecipient} aria-label="Add recipient">
                <Plus className="w-3 h-3" aria-hidden="true" />
              </Button>
            </div>
            {form.recipients.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {form.recipients.map(email => (
                  <Badge key={email} variant="secondary" className="text-xs gap-1">
                    {email}
                    <button type="button" onClick={() => removeRecipient(email)} aria-label={`Remove recipient ${email}`} className="cursor-pointer">
                      <X className="w-3 h-3" aria-hidden="true" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Options */}
          <div className="border-t pt-3 space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor={`${uid}-include-summary`} id={`${uid}-include-summary-label`} className="text-xs">Include AI Summary</Label>
              <Switch id={`${uid}-include-summary`} aria-labelledby={`${uid}-include-summary-label`} checked={form.include_summary} onCheckedChange={(v) => update('include_summary', v)} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor={`${uid}-include-csv`} id={`${uid}-include-csv-label`} className="text-xs">Include CSV Data</Label>
              <Switch id={`${uid}-include-csv`} aria-labelledby={`${uid}-include-csv-label`} checked={form.include_csv} onCheckedChange={(v) => update('include_csv', v)} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor={`${uid}-is-active`} id={`${uid}-is-active-label`} className="text-xs">Active</Label>
              <Switch id={`${uid}-is-active`} aria-labelledby={`${uid}-is-active-label`} checked={form.is_active} onCheckedChange={(v) => update('is_active', v)} />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button type="submit" className="flex-1 gap-2" disabled={saving || !form.name || !form.dataset || !form.recipients.length}>
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : (initialData?.id ? 'Update Report' : 'Create Report')}
            </Button>
            {onCancel && (
              <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
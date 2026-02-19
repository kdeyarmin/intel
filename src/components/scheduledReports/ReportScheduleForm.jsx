import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
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
              <Label className="text-xs">Report Name *</Label>
              <Input
                placeholder="Weekly Provider Summary"
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Description</Label>
              <Input
                placeholder="Optional description..."
                value={form.description}
                onChange={(e) => update('description', e.target.value)}
              />
            </div>
          </div>

          {/* Dataset */}
          <div className="space-y-1">
            <Label className="text-xs">Dataset *</Label>
            <Select value={form.dataset} onValueChange={(v) => { update('dataset', v); update('metrics', []); update('group_by', ''); }}>
              <SelectTrigger><SelectValue placeholder="Select dataset..." /></SelectTrigger>
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
                <Label className="text-xs">Metrics</Label>
                <div className="flex flex-wrap gap-1.5">
                  {dsConfig.metrics.map(m => (
                    <Badge
                      key={m.key}
                      variant={form.metrics.includes(m.key) ? 'default' : 'outline'}
                      className="cursor-pointer text-xs"
                      onClick={() => toggleMetric(m.key)}
                    >
                      {m.label}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Group By</Label>
                  <Select value={form.group_by} onValueChange={(v) => update('group_by', v)}>
                    <SelectTrigger><SelectValue placeholder="Select grouping..." /></SelectTrigger>
                    <SelectContent>
                      {dsConfig.groupOptions.map(g => (
                        <SelectItem key={g.key} value={g.key}>{g.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Chart Type</Label>
                  <Select value={form.chart_type} onValueChange={(v) => update('chart_type', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
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
          <div className="border-t pt-3 space-y-3">
            <Label className="text-xs font-semibold text-slate-700">Schedule</Label>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Frequency *</Label>
                <Select value={form.frequency} onValueChange={(v) => update('frequency', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.frequency === 'weekly' && (
                <div className="space-y-1">
                  <Label className="text-xs">Day</Label>
                  <Select value={form.schedule_day} onValueChange={(v) => update('schedule_day', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DAYS_OF_WEEK.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {form.frequency === 'monthly' && (
                <div className="space-y-1">
                  <Label className="text-xs">Day of Month</Label>
                  <Input
                    type="number"
                    min={1}
                    max={28}
                    value={form.schedule_day}
                    onChange={(e) => update('schedule_day', e.target.value)}
                  />
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs">Time (ET)</Label>
                <Input
                  type="time"
                  value={form.schedule_time}
                  onChange={(e) => update('schedule_time', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Recipients */}
          <div className="border-t pt-3 space-y-2">
            <Label className="text-xs font-semibold text-slate-700">Recipients *</Label>
            <div className="flex gap-2">
              <Input
                placeholder="email@example.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addRecipient())}
                className="flex-1"
              />
              <Button type="button" size="sm" variant="outline" onClick={addRecipient}>
                <Plus className="w-3 h-3" />
              </Button>
            </div>
            {form.recipients.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {form.recipients.map(email => (
                  <Badge key={email} variant="secondary" className="text-xs gap-1">
                    {email}
                    <X className="w-3 h-3 cursor-pointer" onClick={() => removeRecipient(email)} />
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Options */}
          <div className="border-t pt-3 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Include AI Summary</Label>
              <Switch checked={form.include_summary} onCheckedChange={(v) => update('include_summary', v)} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Include CSV Data</Label>
              <Switch checked={form.include_csv} onCheckedChange={(v) => update('include_csv', v)} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Active</Label>
              <Switch checked={form.is_active} onCheckedChange={(v) => update('is_active', v)} />
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
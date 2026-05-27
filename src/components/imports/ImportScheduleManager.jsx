import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
  PlayCircle, RotateCcw, PlayCircle as ResumeIcon, AlertTriangle,
  Plus, Pencil, Trash2, Loader2, Clock, CalendarClock,
} from 'lucide-react';
import { toast } from 'sonner';

const MAINTENANCE_TASKS = [
  { key: 'runScheduledImports', label: 'Run Scheduled Imports', desc: 'Process all due schedules and fan out the maintenance workers.', icon: PlayCircle, accent: 'text-emerald-400 border-emerald-500/30 hover:bg-emerald-900/20' },
  { key: 'autoRetryFailedImports', label: 'Retry Failed', desc: 'Re-dispatch failed batches whose error looks transient.', icon: RotateCcw, accent: 'text-amber-400 border-amber-500/30 hover:bg-amber-900/20' },
  { key: 'autoResumePausedImports', label: 'Resume Paused', desc: 'Resume paused batches from their saved offset.', icon: ResumeIcon, accent: 'text-sky-400 border-sky-500/30 hover:bg-sky-900/20' },
  { key: 'cancelStalledImports', label: 'Cancel Stalled', desc: 'Fail batches stuck processing for over 2 hours.', icon: AlertTriangle, accent: 'text-rose-400 border-rose-500/30 hover:bg-rose-900/20' },
];

const FREQUENCIES = ['daily', 'weekly', 'monthly', 'on_completion'];

const STATUS_STYLES = {
  success: 'bg-emerald-900/30 text-emerald-400 border-emerald-500/30',
  running: 'bg-sky-900/30 text-sky-400 border-sky-500/30',
  partial: 'bg-amber-900/30 text-amber-400 border-amber-500/30',
  failed: 'bg-rose-900/30 text-rose-400 border-rose-500/30',
};

const EMPTY_FORM = {
  label: '', import_type: '', schedule_frequency: 'daily', schedule_time: '02:00',
  api_url: '', data_year: '', depends_on_import_type: '', is_active: true,
};

function summarizeResult(task, data) {
  if (!data) return 'No response';
  if (task === 'runScheduledImports') {
    const m = (data.maintenance || []).filter((w) => w.ok).length;
    return `Checked ${data.checked ?? 0}, ran ${data.processed ?? 0}, ${m}/${(data.maintenance || []).length} maintenance workers ok`;
  }
  if (task === 'autoRetryFailedImports') return `Scanned ${data.scanned ?? 0}, retried ${data.retried_count ?? 0}`;
  if (task === 'autoResumePausedImports') return `Resumed ${data.resumed_count ?? 0}`;
  if (task === 'cancelStalledImports') return `Cancelled ${data.cancelled_count ?? 0}`;
  return data.message || 'Done';
}

function fmt(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

export default function ImportScheduleManager() {
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ['importSchedules'],
    queryFn: () => base44.entities.ImportScheduleConfig.list('-updated_date', 100),
    refetchInterval: 30000,
  });

  const runTask = async (key) => {
    setRunning(key);
    try {
      const { data } = await base44.functions.invoke(key);
      const summary = summarizeResult(key, data);
      setLastResult({ key, summary, at: new Date().toISOString() });
      toast.success(summary);
      queryClient.invalidateQueries({ queryKey: ['importSchedules'] });
    } catch (e) {
      toast.error(e?.data?.detail || e?.message || 'Task failed');
    } finally {
      setRunning(null);
    }
  };

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setDialogOpen(true); };
  const openEdit = (s) => {
    setEditing(s);
    setForm({
      label: s.label || s.name || '',
      import_type: s.import_type || '',
      schedule_frequency: s.schedule_frequency || 'daily',
      schedule_time: s.schedule_time || '02:00',
      api_url: s.api_url || '',
      data_year: s.data_year || '',
      depends_on_import_type: s.depends_on_import_type || '',
      is_active: s.is_active !== false,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.import_type.trim()) { toast.error('Import type is required'); return; }
    setSaving(true);
    const payload = {
      ...form,
      name: form.label || form.import_type,
      import_type: form.import_type.trim(),
      data_year: form.data_year ? String(form.data_year).trim() : null,
      api_url: form.api_url.trim() || null,
      depends_on_import_type: form.depends_on_import_type.trim() || null,
      enabled: form.is_active,
    };
    try {
      if (editing?.id) {
        await base44.entities.ImportScheduleConfig.update(editing.id, payload);
        toast.success('Schedule updated');
      } else {
        await base44.entities.ImportScheduleConfig.create(payload);
        toast.success('Schedule created');
      }
      setDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['importSchedules'] });
    } catch (e) {
      toast.error(e?.data?.detail || e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (s) => {
    const next = !(s.is_active !== false);
    try {
      await base44.entities.ImportScheduleConfig.update(s.id, { is_active: next, enabled: next });
      queryClient.invalidateQueries({ queryKey: ['importSchedules'] });
    } catch (e) {
      toast.error(e?.message || 'Failed to update');
    }
  };

  const remove = async (s) => {
    if (!window.confirm(`Delete schedule "${s.label || s.name || s.import_type}"?`)) return;
    setDeletingId(s.id);
    try {
      await base44.entities.ImportScheduleConfig.delete(s.id);
      toast.success('Schedule deleted');
      queryClient.invalidateQueries({ queryKey: ['importSchedules'] });
    } catch (e) {
      toast.error(e?.message || 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  const inputCls = 'bg-slate-900/60 border-slate-700 text-slate-200';
  const labelCls = 'text-xs font-medium text-slate-400 mb-1 block';

  return (
    <div className="space-y-6">
      {/* Manual triggers */}
      <Card className="bg-[#141d30] border-slate-700/50">
        <CardHeader>
          <CardTitle className="text-slate-200 text-base flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-cyan-400" /> Maintenance
          </CardTitle>
          <p className="text-xs text-slate-400">
            Run a maintenance task now. These normally run on a schedule via an external cron hitting
            <code className="mx-1 px-1 rounded bg-slate-800 text-slate-300">/api/maintenance/runScheduledImports</code>.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {MAINTENANCE_TASKS.map((t) => {
              const Icon = t.icon;
              const isRunning = running === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => runTask(t.key)}
                  disabled={!!running}
                  className={`text-left p-3 rounded-lg border bg-slate-900/40 transition-colors disabled:opacity-50 ${t.accent}`}
                >
                  <div className="flex items-center gap-2 font-medium text-sm">
                    {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
                    {t.label}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{t.desc}</p>
                </button>
              );
            })}
          </div>
          {lastResult && (
            <div className="mt-3 text-xs text-slate-300 bg-slate-900/60 border border-slate-700/50 rounded-md p-2">
              <span className="text-slate-500">{fmt(lastResult.at)} · {lastResult.key}:</span> {lastResult.summary}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Schedules */}
      <Card className="bg-[#141d30] border-slate-700/50">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-slate-200 text-base flex items-center gap-2">
            <Clock className="w-4 h-4 text-cyan-400" /> Import Schedules
          </CardTitle>
          <Button size="sm" onClick={openCreate} className="bg-cyan-600 hover:bg-cyan-700 text-white">
            <Plus className="w-4 h-4 mr-1" /> New Schedule
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-slate-400 text-sm py-8 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading schedules…
            </div>
          ) : schedules.length === 0 ? (
            <div className="text-center text-slate-500 text-sm py-8">
              No schedules yet. Create one and wire an external cron to <code className="px-1 rounded bg-slate-800">/api/maintenance/runScheduledImports</code> to run them.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-700/50">
                    <th className="py-2 pr-3 font-medium">Schedule</th>
                    <th className="py-2 px-3 font-medium">Cadence</th>
                    <th className="py-2 px-3 font-medium">Next run</th>
                    <th className="py-2 px-3 font-medium">Last run</th>
                    <th className="py-2 px-3 font-medium">Active</th>
                    <th className="py-2 pl-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {schedules.map((s) => (
                    <tr key={s.id} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                      <td className="py-2 pr-3">
                        <div className="text-slate-200">{s.label || s.name || '(unnamed)'}</div>
                        <div className="text-xs text-slate-500 font-mono">{s.import_type}</div>
                        {s.depends_on_import_type && (
                          <div className="text-[10px] text-slate-500">depends on {s.depends_on_import_type}</div>
                        )}
                      </td>
                      <td className="py-2 px-3 text-slate-300">
                        {s.schedule_frequency || '—'}
                        {s.schedule_frequency && s.schedule_frequency !== 'on_completion' && s.schedule_time ? ` @ ${s.schedule_time}` : ''}
                      </td>
                      <td className="py-2 px-3 text-slate-400 whitespace-nowrap">{fmt(s.next_run_at)}</td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        {s.last_run_status ? (
                          <Badge variant="outline" className={STATUS_STYLES[s.last_run_status] || 'bg-slate-800 text-slate-300 border-slate-600'}>
                            {s.last_run_status}
                          </Badge>
                        ) : <span className="text-slate-500">—</span>}
                        {(s.consecutive_failures || 0) > 0 && (
                          <span className="ml-1 text-[10px] text-rose-400">×{s.consecutive_failures}</span>
                        )}
                        <div className="text-[10px] text-slate-500">{fmt(s.last_run_at)}</div>
                      </td>
                      <td className="py-2 px-3">
                        <Switch checked={s.is_active !== false} onCheckedChange={() => toggleActive(s)} />
                      </td>
                      <td className="py-2 pl-3 text-right whitespace-nowrap">
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-cyan-400" onClick={() => openEdit(s)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-rose-400" onClick={() => remove(s)} disabled={deletingId === s.id}>
                          {deletingId === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-[#141d30] border-slate-700 text-slate-200">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Schedule' : 'New Schedule'}</DialogTitle>
            <DialogDescription className="text-slate-400">
              Define when an import runs. The cron tick processes due schedules; same-family imports run sequentially.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Label</label>
              <Input className={inputCls} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Monthly hospice refresh" />
            </div>
            <div>
              <label className={labelCls}>Import type *</label>
              <Input className={inputCls} value={form.import_type} onChange={(e) => setForm({ ...form, import_type: e.target.value })} placeholder="e.g. hospice_general_info or nppes_registry" />
              <p className="text-[10px] text-slate-500 mt-1">Use a dataset id from Data Center, or <code>nppes_registry</code> for a crawler run.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Frequency</label>
                <select
                  className="w-full bg-slate-900/60 border border-slate-700 rounded-md px-2 py-2 text-sm text-slate-200"
                  value={form.schedule_frequency}
                  onChange={(e) => setForm({ ...form, schedule_frequency: e.target.value })}
                >
                  {FREQUENCIES.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Time (UTC, HH:MM)</label>
                <Input
                  className={inputCls}
                  value={form.schedule_time}
                  onChange={(e) => setForm({ ...form, schedule_time: e.target.value })}
                  placeholder="02:00"
                  disabled={form.schedule_frequency === 'on_completion'}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Data year (optional)</label>
                <Input className={inputCls} value={form.data_year} onChange={(e) => setForm({ ...form, data_year: e.target.value })} placeholder="defaults to latest" />
              </div>
              <div>
                <label className={labelCls}>Depends on import type (optional)</label>
                <Input className={inputCls} value={form.depends_on_import_type} onChange={(e) => setForm({ ...form, depends_on_import_type: e.target.value })} placeholder="parent import_type" />
              </div>
            </div>
            <div>
              <label className={labelCls}>API URL override (optional)</label>
              <Input className={inputCls} value={form.api_url} onChange={(e) => setForm({ ...form, api_url: e.target.value })} placeholder="leave blank to use the built-in CMS URL" />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              <span className="text-sm text-slate-300">Active</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" className="text-slate-400" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button className="bg-cyan-600 hover:bg-cyan-700 text-white" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
              {editing ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

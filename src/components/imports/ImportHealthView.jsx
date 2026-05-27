import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, XCircle, Pause, AlertCircle, RefreshCw, Activity } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { base44 } from '@/api/base44Client';
import { ERROR_CATEGORIES } from './errorCategories';
import { buildImportTypeLabels } from '@/lib/cmsImportTypes';
import {
  successRateByDay,
  summarizeWindow,
  topErrorCategoriesFromBatches,
  summarizeRetryPipeline,
  unhealthySchedules,
} from './healthMetrics';

const IMPORT_TYPE_LABELS = buildImportTypeLabels({
  provider_service_utilization: 'Provider Service Utilization',
});

const RETRY_STATE_LABELS = {
  pending: 'Waiting for backoff',
  eligible: 'Eligible (next tick)',
  never_tried: 'Awaiting first attempt',
  disabled: 'Operator-disabled',
  max_reached: 'Max attempts hit',
  too_old: 'Outside lookback window',
  out_of_scope: 'NPPES / out of scope',
};

const RETRY_STATE_TONES = {
  pending: 'text-blue-300',
  eligible: 'text-cyan-300',
  never_tried: 'text-slate-300',
  disabled: 'text-slate-400',
  max_reached: 'text-orange-400',
  too_old: 'text-slate-500',
  out_of_scope: 'text-slate-500',
};

function KpiTile({ label, value, sublabel, icon: Icon, tone = 'text-slate-200' }) {
  return (
    <Card className="bg-slate-800/40 border-slate-700/50">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">
          {Icon && <Icon className={`w-3.5 h-3.5 ${tone}`} />}
          <p className="text-[11px] text-slate-400 uppercase tracking-wide">{label}</p>
        </div>
        <p className={`text-2xl font-bold ${tone}`}>{value ?? '—'}</p>
        {sublabel && <p className="text-xs text-slate-500 mt-1">{sublabel}</p>}
      </CardContent>
    </Card>
  );
}

function DailyChart({ buckets }) {
  if (!buckets.length) return null;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={buckets} margin={{ top: 4, right: 4, left: -16, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis
          dataKey="date"
          tick={{ fill: '#94a3b8', fontSize: 10 }}
          tickFormatter={(d) => d.slice(5)}
        />
        <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
        <Tooltip
          contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 6, fontSize: 12 }}
          labelStyle={{ color: '#cbd5e1' }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="completed" stackId="a" fill="#10b981" name="Completed" />
        <Bar dataKey="failed" stackId="a" fill="#ef4444" name="Failed" />
        <Bar dataKey="paused" stackId="a" fill="#f59e0b" name="Paused" />
        <Bar dataKey="other" stackId="a" fill="#64748b" name="Other" />
      </BarChart>
    </ResponsiveContainer>
  );
}

function ErrorBreakdown({ rows }) {
  if (!rows.length) {
    return <p className="text-xs text-slate-500">No error samples in the window.</p>;
  }
  const max = Math.max(...rows.map(r => r.count));
  return (
    <div className="space-y-2">
      {rows.map(r => {
        const pct = max === 0 ? 0 : Math.round((r.count / max) * 100);
        const cat = ERROR_CATEGORIES[r.category];
        return (
          <div key={r.category}>
            <div className="flex justify-between text-xs mb-0.5">
              <span className={`${cat?.color || 'text-slate-300'}`}>{r.label}</span>
              <span className="text-slate-400 font-medium">{r.count.toLocaleString()}</span>
            </div>
            <div className="h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${cat?.color?.replace('text-', 'bg-') || 'bg-slate-500'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RetryPipeline({ buckets }) {
  const total = Object.values(buckets).reduce((a, b) => a + b, 0);
  if (total === 0) {
    return <p className="text-xs text-slate-500">No failed batches in the window.</p>;
  }
  const order = ['pending', 'eligible', 'never_tried', 'disabled', 'max_reached', 'too_old', 'out_of_scope'];
  return (
    <div className="grid grid-cols-2 gap-2">
      {order.map(state => (
        <div key={state} className="flex items-center justify-between text-xs px-2.5 py-2 rounded bg-slate-800/30 border border-slate-700/50">
          <span className={RETRY_STATE_TONES[state] || 'text-slate-300'}>
            {RETRY_STATE_LABELS[state] || state}
          </span>
          <span className="font-bold text-slate-200">{buckets[state]}</span>
        </div>
      ))}
    </div>
  );
}

function ScheduleHealthTable({ schedules }) {
  if (!schedules.length) {
    return <p className="text-xs text-slate-500">No schedules with consecutive failures.</p>;
  }
  return (
    <div className="space-y-1.5">
      {schedules.map(s => {
        const failures = s.consecutive_failures || 0;
        const tone = failures >= 5 ? 'border-red-500/30 bg-red-500/5'
          : failures >= 3 ? 'border-orange-500/30 bg-orange-500/5'
          : 'border-amber-500/30 bg-amber-500/5';
        return (
          <div key={s.id} className={`flex items-center justify-between text-xs px-3 py-2 rounded border ${tone}`}>
            <div className="flex-1 min-w-0">
              <p className="text-slate-200 font-medium truncate">{s.label || IMPORT_TYPE_LABELS[s.import_type] || s.import_type}</p>
              <p className="text-slate-500 truncate">
                {s.last_run_status && <span className="mr-2">last: <span className="text-slate-400">{s.last_run_status}</span></span>}
                {s.next_run_at && <span>next: <span className="text-slate-400">{new Date(s.next_run_at).toLocaleString()}</span></span>}
              </p>
            </div>
            <Badge className="bg-orange-500/15 text-orange-400 border border-orange-500/20 ml-2">
              {failures} consecutive failure{failures === 1 ? '' : 's'}
            </Badge>
          </div>
        );
      })}
    </div>
  );
}

export default function ImportHealthView() {
  const { data: batches = [], isLoading: batchesLoading } = useQuery({
    queryKey: ['importHealthBatches'],
    queryFn: () => base44.entities.ImportBatch.list('-created_date', 500),
    refetchInterval: 30_000,
  });

  const { data: schedules = [], isLoading: schedulesLoading } = useQuery({
    queryKey: ['importHealthSchedules'],
    queryFn: () => base44.entities.ImportScheduleConfig.list('-updated_date', 100),
    refetchInterval: 30_000,
  });

  const dailyBuckets = useMemo(() => successRateByDay(batches, 30), [batches]);
  const windowSummary = useMemo(() => summarizeWindow(dailyBuckets), [dailyBuckets]);
  const errorBreakdown = useMemo(() => topErrorCategoriesFromBatches(batches, 8), [batches]);
  const retryBuckets = useMemo(
    () => summarizeRetryPipeline(batches.filter(b => b.status === 'failed')),
    [batches],
  );
  const failingSchedules = useMemo(() => unhealthySchedules(schedules, 1), [schedules]);

  if (batchesLoading || schedulesLoading) {
    return (
      <div className="py-6 flex items-center gap-2 text-slate-400">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading import health metrics...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-xs text-slate-500">
        30-day overview of import outcomes, error patterns, schedule health, and the auto-retry pipeline.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile
          label="Batches (30d)"
          value={windowSummary.total.toLocaleString()}
          sublabel={`${windowSummary.completed} completed, ${windowSummary.failed} failed`}
          icon={Activity}
        />
        <KpiTile
          label="Success rate"
          value={windowSummary.successRate == null ? '—' : `${windowSummary.successRate}%`}
          sublabel={`${windowSummary.completed.toLocaleString()} / ${windowSummary.total.toLocaleString()}`}
          icon={CheckCircle2}
          tone={windowSummary.successRate != null && windowSummary.successRate >= 90 ? 'text-emerald-400' : 'text-amber-400'}
        />
        <KpiTile
          label="In retry pipeline"
          value={(retryBuckets.pending + retryBuckets.eligible + retryBuckets.never_tried).toLocaleString()}
          sublabel={`${retryBuckets.disabled} disabled, ${retryBuckets.max_reached} maxed`}
          icon={RefreshCw}
          tone="text-cyan-300"
        />
        <KpiTile
          label="Failing schedules"
          value={failingSchedules.length.toLocaleString()}
          sublabel={failingSchedules.length === 0 ? 'all healthy' : 'consecutive_failures > 0'}
          icon={AlertCircle}
          tone={failingSchedules.length === 0 ? 'text-emerald-400' : 'text-orange-400'}
        />
      </div>

      <Card className="bg-slate-800/40 border-slate-700/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2 text-slate-200">
            <Activity className="w-4 h-4 text-cyan-400" /> Daily outcomes (last 30 days)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DailyChart buckets={dailyBuckets} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="bg-slate-800/40 border-slate-700/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-slate-200">
              <XCircle className="w-4 h-4 text-red-400" /> Top error categories
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ErrorBreakdown rows={errorBreakdown} />
          </CardContent>
        </Card>

        <Card className="bg-slate-800/40 border-slate-700/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-slate-200">
              <RefreshCw className="w-4 h-4 text-cyan-400" /> Auto-retry pipeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RetryPipeline buckets={retryBuckets} />
          </CardContent>
        </Card>
      </div>

      <Card className="bg-slate-800/40 border-slate-700/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2 text-slate-200">
            <Pause className="w-4 h-4 text-orange-400" /> Schedule health
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScheduleHealthTable schedules={failingSchedules} />
        </CardContent>
      </Card>
    </div>
  );
}

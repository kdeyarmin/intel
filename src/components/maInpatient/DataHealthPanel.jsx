import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertTriangle, XCircle, Database } from 'lucide-react';

function Metric({ label, value, status }) {
  const colors = {
    good: 'text-green-600',
    warn: 'text-amber-600',
    bad: 'text-red-600',
  };
  const icons = {
    good: <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />,
    warn: <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />,
    bad: <XCircle className="w-3.5 h-3.5 text-red-500" />,
  };
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
      <span className="text-sm text-slate-600">{label}</span>
      <div className="flex items-center gap-1.5">
        {icons[status]}
        <span className={`text-sm font-medium ${colors[status]}`}>{value}</span>
      </div>
    </div>
  );
}

export default function DataHealthPanel({ data, recentBatches = [] }) {
  const health = useMemo(() => {
    const total = data.length;
    const withDischarges = data.filter(r => r.total_discharges > 0).length;
    const withALOS = data.filter(r => r.avg_length_of_stay > 0).length;
    const withEnrollees = data.filter(r => r.total_enrollees > 0).length;
    const withRawData = data.filter(r => r.raw_data && Object.keys(r.raw_data).length > 0).length;
    const years = [...new Set(data.map(r => r.data_year).filter(Boolean))].sort();
    const tables = [...new Set(data.map(r => r.table_name).filter(Boolean))];

    const pctDischarges = total > 0 ? ((withDischarges / total) * 100).toFixed(0) : 0;
    const pctALOS = total > 0 ? ((withALOS / total) * 100).toFixed(0) : 0;
    const pctEnrollees = total > 0 ? ((withEnrollees / total) * 100).toFixed(0) : 0;

    return {
      total, withDischarges, withALOS, withEnrollees, withRawData,
      years, tables, pctDischarges, pctALOS, pctEnrollees,
    };
  }, [data]);

  const getStatus = (pct) => pct >= 70 ? 'good' : pct >= 40 ? 'warn' : 'bad';

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-slate-400" />
          <CardTitle className="text-base">Data Health</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="flex gap-2 mb-3 flex-wrap">
          <Badge variant="outline" className="text-xs">{health.total.toLocaleString()} records</Badge>
          <Badge variant="outline" className="text-xs">{health.tables.length} tables</Badge>
          <Badge variant="outline" className="text-xs">
            {health.years.length > 0 ? `${health.years[0]}–${health.years[health.years.length - 1]}` : 'No years'}
          </Badge>
        </div>
        <Metric label="Discharge coverage" value={`${health.pctDischarges}%`} status={getStatus(+health.pctDischarges)} />
        <Metric label="ALOS coverage" value={`${health.pctALOS}%`} status={getStatus(+health.pctALOS)} />
        <Metric label="Enrollee coverage" value={`${health.pctEnrollees}%`} status={getStatus(+health.pctEnrollees)} />
        <Metric label="Raw data attached" value={`${health.total > 0 ? ((health.withRawData / health.total) * 100).toFixed(0) : 0}%`} status={getStatus(health.total > 0 ? (health.withRawData / health.total) * 100 : 0)} />

        {/* Top validation issues from recent batches */}
        <TopValidationIssues batches={recentBatches} />
      </CardContent>
    </Card>
  );
}

function TopValidationIssues({ batches }) {
  const issues = useMemo(() => {
    const ruleCounts = {};
    batches.forEach(batch => {
      // Aggregate from error_samples (validation errors/warnings stored on batch)
      if (batch.error_samples?.length > 0) {
        batch.error_samples.forEach(e => {
          const rule = e.rule || e.phase || 'unknown';
          ruleCounts[rule] = (ruleCounts[rule] || { count: 0, type: 'error' });
          ruleCounts[rule].count++;
        });
      }
    });
    return Object.entries(ruleCounts)
      .map(([rule, info]) => ({ rule, count: info.count, type: info.type }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [batches]);

  // Also compute inline data quality warnings from the data itself
  const dataIssues = useMemo(() => {
    const checks = {};
    // no_metrics: records with no numeric values
    const noMetrics = batches.reduce((sum, b) => {
      const noMetricsRule = Object.entries(
        // look for validation_rule_summary or error_samples
        {}
      );
      return sum;
    }, 0);
    return checks;
  }, [batches]);

  // Combine batch error_samples with inline analysis
  const inlineIssues = useMemo(() => {
    if (issues.length > 0) return issues;
    // If no batch-level error samples, derive from the batches' known fields
    const derived = [];
    batches.forEach(b => {
      if (b.invalid_rows > 0) derived.push({ rule: 'invalid_rows', count: b.invalid_rows, type: 'error' });
      if (b.duplicate_rows > 0) derived.push({ rule: 'duplicates', count: b.duplicate_rows, type: 'warning' });
      if (b.skipped_rows > 0) derived.push({ rule: 'skipped_identical', count: b.skipped_rows, type: 'warning' });
    });
    // Merge by rule
    const merged = {};
    derived.forEach(d => {
      if (!merged[d.rule]) merged[d.rule] = { ...d };
      else merged[d.rule].count += d.count;
    });
    return Object.values(merged).sort((a, b) => b.count - a.count).slice(0, 5);
  }, [issues, batches]);

  if (inlineIssues.length === 0) return null;

  return (
    <div className="mt-4 pt-3 border-t border-slate-200">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Top Validation Issues</p>
      <div className="space-y-1.5">
        {inlineIssues.map(issue => (
          <div key={issue.rule} className="flex items-center justify-between py-1.5 px-2 rounded bg-slate-50">
            <div className="flex items-center gap-1.5">
              {issue.type === 'error'
                ? <XCircle className="w-3 h-3 text-red-400" />
                : <AlertTriangle className="w-3 h-3 text-amber-400" />
              }
              <span className="text-xs text-slate-600">{issue.rule.replace(/_/g, ' ')}</span>
            </div>
            <Badge variant="outline" className="text-xs">{issue.count.toLocaleString()}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}
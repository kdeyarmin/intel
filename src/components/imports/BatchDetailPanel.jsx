import React, { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  CheckCircle2, XCircle, Clock, Loader2, Pause, FileText,
  Database, Settings, BarChart3, ArrowUpDown, RefreshCw, Link2, ShieldCheck, Sparkles
} from 'lucide-react';
import ErrorSummaryPanel from './ErrorSummaryPanel';
import ErrorCategoryDisplay from './ErrorCategoryDisplay';
import ValidationRuleResults from './ValidationRuleResults';
import ErrorDistributionChart from './ErrorDistributionChart';
import ErrorFilterBar from './ErrorFilterBar';
import AIRuleSuggestions from './AIRuleSuggestions';
import DetailedErrorRows from './DetailedErrorRows';
import { categorizeError } from './errorCategories';
import AIFailureAnalysis from './AIFailureAnalysis';
import AIDatasetAnalysis from './AIDatasetAnalysis';

const IMPORT_TYPE_LABELS = {
  'nppes_monthly': 'NPPES Monthly', 'nppes_registry': 'NPPES Registry',
  'cms_utilization': 'CMS Utilization', 'cms_part_d': 'CMS Part D',
  'cms_order_referring': 'Order & Referring', 'pa_home_health': 'PA Home Health',
  'hospice_providers': 'Hospice Providers', 'nursing_home_chains': 'Nursing Home Chains',
  'hospice_enrollments': 'Hospice Enrollments', 'home_health_enrollments': 'Home Health Enrollments',
  'home_health_cost_reports': 'Home Health Cost Reports', 'cms_service_utilization': 'Service Utilization',
  'provider_service_utilization': 'Provider Service Utilization', 'home_health_pdgm': 'Home Health PDGM',
  'inpatient_drg': 'Inpatient DRG', 'provider_ownership': 'Provider Ownership',
  'medicare_hha_stats': 'Medicare HHA Stats', 'medicare_ma_inpatient': 'Medicare MA Inpatient',
  'medicare_part_d_stats': 'Medicare Part D Stats', 'medicare_snf_stats': 'Medicare SNF Stats',
};

const statusColors = {
  processing: 'bg-blue-500/15 text-blue-400 border border-blue-500/20',
  validating: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/20',
  completed: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20',
  failed: 'bg-red-500/15 text-red-400 border border-red-500/20',
  paused: 'bg-amber-500/15 text-amber-400 border border-amber-500/20',
  cancelled: 'bg-slate-500/15 text-slate-400 border border-slate-500/20',
};

function formatTimestamp(ts) {
  if (!ts) return 'N/A';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(new Date(ts)) + ' ET';
}

function StatBox({ label, value, color = 'text-slate-200', icon: Icon }) {
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3 text-center">
      {Icon && <Icon className={`w-3.5 h-3.5 mx-auto mb-1 ${color}`} />}
      <p className="text-[10px] text-slate-400 mb-0.5">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value ?? '—'}</p>
    </div>
  );
}

function ProgressBreakdown({ batch }) {
  const total = batch.total_rows || 0;
  if (total === 0) return null;

  const validated = batch.valid_rows || 0;
  const invalid = batch.invalid_rows || 0;
  const imported = batch.imported_rows || 0;
  const updated = batch.updated_rows || 0;
  const skipped = batch.skipped_rows || 0;
  const duplicates = batch.duplicate_rows || 0;

  const stages = [
    { label: 'Scanned', count: total, pct: 100, color: 'bg-slate-500' },
    { label: 'Validated', count: validated, pct: total > 0 ? (validated / total) * 100 : 0, color: 'bg-emerald-500' },
    { label: 'Imported', count: imported, pct: total > 0 ? (imported / total) * 100 : 0, color: 'bg-blue-500' },
    { label: 'Updated', count: updated, pct: total > 0 ? (updated / total) * 100 : 0, color: 'bg-violet-500' },
  ];

  return (
    <div>
      <h4 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
        <BarChart3 className="w-4 h-4 text-cyan-400" /> Progress Breakdown
      </h4>
      <div className="space-y-2.5">
        {stages.map(s => (
          s.count > 0 && (
            <div key={s.label}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400">{s.label}</span>
                <span className="text-slate-300 font-medium">{s.count.toLocaleString()} / {total.toLocaleString()} ({Math.round(s.pct)}%)</span>
              </div>
              <div className="h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${s.color} transition-all`} style={{ width: `${s.pct}%` }} />
              </div>
            </div>
          )
        ))}
      </div>
      {(skipped > 0 || duplicates > 0 || invalid > 0) && (
        <div className="flex gap-4 mt-3 text-xs">
          {skipped > 0 && <span className="text-slate-500">Skipped: <span className="text-slate-400 font-medium">{skipped.toLocaleString()}</span></span>}
          {duplicates > 0 && <span className="text-slate-500">Duplicates: <span className="text-amber-400 font-medium">{duplicates.toLocaleString()}</span></span>}
          {invalid > 0 && <span className="text-slate-500">Invalid: <span className="text-red-400 font-medium">{invalid.toLocaleString()}</span></span>}
        </div>
      )}
    </div>
  );
}

function classifySeverity(msg) {
  const lower = (msg || '').toLowerCase();
  if (lower.includes('flag')) return 'flag';
  if (lower.includes('warn') || lower.includes('length') || lower.includes('duplicate') || lower.includes('unique')) return 'warn';
  return 'reject';
}

function FilteredErrors({ errors, filters, batchName }) {
  const filtered = useMemo(() => {
    return errors.filter(err => {
      if (filters.severity) {
        const sev = classifySeverity(err.message);
        if (sev !== filters.severity) return false;
      }
      if (filters.category) {
        const cat = categorizeError(err.message);
        if (cat !== filters.category) return false;
      }
      return true;
    });
  }, [errors, filters]);

  const hasFilters = filters.severity || filters.category;

  return (
    <>
      {hasFilters && (
        <p className="text-xs text-slate-500">
          Showing {filtered.length} of {errors.length} error{errors.length !== 1 ? 's' : ''}
        </p>
      )}
      <ErrorSummaryPanel errors={filtered} batchName={batchName} />
      <ErrorCategoryDisplay errors={filtered} />
    </>
  );
}

export default function BatchDetailPanel({ batch }) {
  const [errorFilters, setErrorFilters] = useState({ severity: null, category: null });

  if (!batch) return null;

  const columnFields = useMemo(() => {
    if (!batch.column_mapping) return null;
    if (Array.isArray(batch.column_mapping)) return batch.column_mapping;
    if (batch.column_mapping.fields) return batch.column_mapping.fields;
    if (typeof batch.column_mapping === 'object') return Object.entries(batch.column_mapping);
    return null;
  }, [batch.column_mapping]);

  const duration = useMemo(() => {
    if (!batch.created_date) return null;
    const end = batch.completed_at || batch.paused_at || batch.cancelled_at || batch.updated_date;
    if (!end) return null;
    const ms = new Date(end) - new Date(batch.created_date);
    if (ms < 0) return null;
    const secs = Math.floor(ms / 1000);
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    const remSecs = secs % 60;
    if (mins < 60) return `${mins}m ${remSecs}s`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m`;
  }, [batch]);

  return (
    <div className="space-y-5 mt-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge className={statusColors[batch.status] || ''}>{batch.status}</Badge>
          {batch.dry_run && <Badge className="bg-violet-500/15 text-violet-400 border border-violet-500/20">Dry Run</Badge>}
          {batch.retry_of && (
            <Badge className="text-xs gap-1 bg-amber-500/15 text-amber-400 border border-amber-500/20">
              <RefreshCw className="w-3 h-3" /> Retry #{batch.retry_count || 1}
            </Badge>
          )}
        </div>
        {duration && <span className="text-xs text-slate-500">Duration: {duration}</span>}
      </div>

      {/* Metadata Grid */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div><span className="text-slate-500">Import Type:</span><p className="font-medium text-slate-200">{IMPORT_TYPE_LABELS[batch.import_type] || batch.import_type}</p></div>
        <div><span className="text-slate-500">Status:</span><p className="font-medium text-slate-200">{batch.status}</p></div>
        <div><span className="text-slate-500">Created:</span><p className="font-medium text-slate-200">{formatTimestamp(batch.created_date)}</p></div>
        <div><span className="text-slate-500">Completed:</span><p className="font-medium text-slate-200">{formatTimestamp(batch.completed_at)}</p></div>
        {batch.paused_at && <div><span className="text-slate-500">Paused:</span><p className="font-medium text-amber-400">{formatTimestamp(batch.paused_at)}</p></div>}
        {batch.cancelled_at && <div><span className="text-slate-500">Cancelled:</span><p className="font-medium text-slate-400">{formatTimestamp(batch.cancelled_at)}</p></div>}
        {batch.retry_of && <div><span className="text-slate-500">Retry Of:</span><p className="font-medium text-xs font-mono text-slate-300">{batch.retry_of}</p></div>}
        {batch.cancel_reason && <div className="col-span-2"><span className="text-slate-500">Reason:</span><p className="font-medium text-red-400 text-xs">{batch.cancel_reason}</p></div>}
      </div>

      {/* File & Source */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3 space-y-1.5">
        <h4 className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5" /> Source File
        </h4>
        <p className="text-sm text-slate-300 break-all">{batch.file_name}</p>
        {batch.file_url && (
          <p className="text-xs text-slate-500 flex items-center gap-1 break-all">
            <Link2 className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{batch.file_url}</span>
          </p>
        )}
      </div>

      {/* Row Statistics */}
      <div>
        <h4 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
          <ArrowUpDown className="w-4 h-4 text-cyan-400" /> Row Statistics
        </h4>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-2">
          <StatBox label="Total" value={batch.total_rows?.toLocaleString() || 0} />
          <StatBox label="Valid" value={batch.valid_rows?.toLocaleString() || 0} color="text-emerald-400" />
          <StatBox label="Invalid" value={batch.invalid_rows?.toLocaleString() || 0} color="text-red-400" />
          <StatBox label="Duplicates" value={batch.duplicate_rows?.toLocaleString() || 0} color="text-amber-400" />
          <StatBox label="Imported" value={batch.imported_rows?.toLocaleString() || 0} color="text-blue-400" />
          <StatBox label="Updated" value={batch.updated_rows?.toLocaleString() || 0} color="text-violet-400" />
          <StatBox label="Skipped" value={batch.skipped_rows?.toLocaleString() || 0} color="text-slate-400" />
        </div>
      </div>

      {/* Progress Breakdown */}
      <ProgressBreakdown batch={batch} />

      {/* Dedup Summary */}
      {batch.dedup_summary && Object.keys(batch.dedup_summary).length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-slate-300 mb-2 flex items-center gap-2">
            <Database className="w-4 h-4 text-cyan-400" /> Deduplication Summary
          </h4>
          <div className="grid grid-cols-3 gap-2">
            {batch.dedup_summary.created != null && <StatBox label="Created" value={batch.dedup_summary.created?.toLocaleString()} color="text-emerald-400" />}
            {batch.dedup_summary.updated != null && <StatBox label="Updated" value={batch.dedup_summary.updated?.toLocaleString()} color="text-violet-400" />}
            {batch.dedup_summary.skipped != null && <StatBox label="Skipped" value={batch.dedup_summary.skipped?.toLocaleString()} color="text-slate-400" />}
          </div>
        </div>
      )}

      {/* Import Configuration */}
      <div>
        <h4 className="text-sm font-semibold text-slate-300 mb-2 flex items-center gap-2">
          <Settings className="w-4 h-4 text-cyan-400" /> Import Configuration
        </h4>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3 space-y-2 text-xs">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
            <div className="flex justify-between"><span className="text-slate-500">Import Type</span><span className="text-slate-300">{batch.import_type}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Dry Run</span><span className={batch.dry_run ? 'text-violet-400' : 'text-slate-400'}>{batch.dry_run ? 'Yes' : 'No'}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Category</span><span className="text-slate-300">{batch.category || 'None'}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Retry Count</span><span className="text-slate-300">{batch.retry_count || 0}</span></div>
          </div>
          {batch.tags?.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-slate-700/50">
              <span className="text-slate-500">Tags:</span>
              {batch.tags.map(t => <Badge key={t} className="bg-slate-700/50 text-slate-300 text-[10px]">{t}</Badge>)}
            </div>
          )}
        </div>
      </div>

      {/* Retry Parameters */}
      {batch.retry_params && Object.keys(batch.retry_params).length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-slate-300 mb-2 flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-cyan-400" /> Retry Parameters
          </h4>
          <pre className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3 text-xs overflow-auto text-slate-300 max-h-40">
            {JSON.stringify(batch.retry_params, null, 2)}
          </pre>
        </div>
      )}

      {/* Column Mapping */}
      {columnFields && (
        <div>
          <h4 className="text-sm font-semibold text-slate-300 mb-2">Column Mapping</h4>
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3 max-h-48 overflow-y-auto">
            {Array.isArray(columnFields) && typeof columnFields[0] === 'string' ? (
              <div className="flex flex-wrap gap-1.5">
                {columnFields.map((f, i) => (
                  <Badge key={i} className="bg-slate-700/50 text-slate-300 text-[10px] font-mono">{f}</Badge>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-1 text-xs">
                {(Array.isArray(columnFields) ? columnFields : []).map(([key, val], i) => (
                  <div key={i} className="flex justify-between py-0.5 border-b border-slate-700/30">
                    <span className="font-medium text-slate-300">{key}</span>
                    <span className="text-slate-500">{typeof val === 'string' ? val : JSON.stringify(val)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Validation Rule Results */}
      <div>
        <h4 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-cyan-400" /> Validation Rule Analysis
        </h4>
        <ValidationRuleResults batch={batch} />
      </div>

      {/* AI Dataset Analysis (for completed batches) */}
      {batch.status === 'completed' && (
        <AIDatasetAnalysis batch={batch} />
      )}

      {/* AI Failure Analysis */}
      {batch.status === 'failed' && (
        <AIFailureAnalysis batch={batch} />
      )}

      {/* Error Visualization & Filtering */}
      {batch.error_samples?.length > 0 && (
        <>
          <ErrorDistributionChart errors={batch.error_samples} />

          <ErrorFilterBar
            filters={errorFilters}
            onFilterChange={setErrorFilters}
            errorCategories={[...new Set(batch.error_samples.map(e => categorizeError(e.message)))]}
          />

          <FilteredErrors
            errors={batch.error_samples}
            filters={errorFilters}
            batchName={batch.file_name}
          />

          <DetailedErrorRows errors={batch.error_samples} maxVisible={15} />
        </>
      )}

      {/* AI Rule Suggestions for failed batches */}
      {batch.status === 'failed' && batch.import_type && (
        <div>
          <h4 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" /> Suggested Rules
          </h4>
          <AIRuleSuggestions importType={batch.import_type} />
        </div>
      )}
    </div>
  );
}
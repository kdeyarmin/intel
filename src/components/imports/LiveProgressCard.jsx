import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Loader2, CheckCircle2, XCircle, Pause, Clock, Zap, ArrowUpDown,
  FileText, Activity, Play
} from 'lucide-react';
import ResumeImportButton from './ResumeImportButton';

const IMPORT_TYPE_LABELS = {
  'nppes_monthly': 'NPPES Monthly', 'nppes_registry': 'NPPES Registry',
  'cms_utilization': 'CMS Utilization', 'cms_part_d': 'CMS Part D',
  'cms_order_referring': 'Order & Referring', 'hospice_enrollments': 'Hospice Enrollments',
  'home_health_enrollments': 'HH Enrollments', 'home_health_cost_reports': 'HH Cost Reports',
  'nursing_home_chains': 'Nursing Home Chains', 'provider_service_utilization': 'Provider Service Util',
  'home_health_pdgm': 'HH PDGM', 'inpatient_drg': 'Inpatient DRG',
  'provider_ownership': 'Provider Ownership', 'medicare_hha_stats': 'Medicare HHA Stats',
  'medicare_ma_inpatient': 'Medicare MA Inpatient', 'medicare_part_d_stats': 'Medicare Part D Stats',
  'medicare_snf_stats': 'Medicare SNF Stats',
};

function getPhaseLabel(status) {
  if (status === 'validating') return 'Validating rows...';
  if (status === 'processing') return 'Importing data...';
  if (status === 'paused') return 'Paused';
  return status;
}

function getProgressValue(batch) {
  const total = batch.total_rows || 0;
  if (total === 0) {
    if (batch.status === 'validating') return 15;
    if (batch.status === 'processing') return 50;
    return 0;
  }
  const processed = (batch.imported_rows || 0) + (batch.updated_rows || 0) + (batch.skipped_rows || 0) + (batch.invalid_rows || 0);
  if (batch.status === 'validating') {
    const validated = (batch.valid_rows || 0) + (batch.invalid_rows || 0);
    return Math.min(Math.round((validated / total) * 50), 49);
  }
  return Math.min(50 + Math.round((processed / total) * 50), 99);
}

function getElapsedTime(startDate) {
  if (!startDate) return '';
  const ms = Date.now() - new Date(startDate).getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ${secs % 60}s`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function RowProgressBar({ label, current, total, color }) {
  if (!total || total === 0) return null;
  const pct = Math.round((current / total) * 100);
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-[10px]">
        <span className="text-slate-500">{label}</span>
        <span className="text-slate-400">{current.toLocaleString()} / {total.toLocaleString()} ({pct}%)</span>
      </div>
      <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function LiveProgressCard({ activeBatches }) {
  const [elapsedTick, setElapsedTick] = useState(0);

  // Tick every second for elapsed time
  useEffect(() => {
    if (activeBatches.length === 0) return;
    const interval = setInterval(() => setElapsedTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, [activeBatches.length]);

  if (activeBatches.length === 0) return null;

  return (
    <Card className="bg-[#141d30] border-blue-500/30">
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-blue-400 animate-pulse" />
          <span className="text-sm font-semibold text-slate-200">
            Live Import Progress — {activeBatches.length} active job{activeBatches.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="space-y-3">
          {activeBatches.map(batch => {
            const progress = getProgressValue(batch);
            const total = batch.total_rows || 0;
            const validated = (batch.valid_rows || 0) + (batch.invalid_rows || 0);
            const imported = (batch.imported_rows || 0) + (batch.updated_rows || 0) + (batch.skipped_rows || 0);
            const elapsed = getElapsedTime(batch.created_date);
            const isPaused = batch.status === 'paused';

            return (
              <div key={batch.id} className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-3 space-y-2">
                {/* Title row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isPaused ? (
                      <Pause className="w-4 h-4 text-amber-400" />
                    ) : (
                      <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                    )}
                    <span className="text-sm font-medium text-slate-200">
                      {IMPORT_TYPE_LABELS[batch.import_type] || batch.import_type}
                    </span>
                    <Badge className={`text-[9px] ${
                      isPaused ? 'bg-amber-500/15 text-amber-400' : 'bg-blue-500/15 text-blue-400'
                    }`}>
                      {getPhaseLabel(batch.status)}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    {elapsed && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {elapsed}
                      </span>
                    )}
                    <span className="font-semibold text-slate-300">{progress}%</span>
                  </div>
                </div>

                {/* Main progress bar */}
                <Progress value={progress} className="h-2 bg-slate-700" />

                {/* Row-level breakdowns */}
                {total > 0 && (
                  <div className="space-y-1.5 pt-1">
                    {batch.status === 'validating' && (
                      <RowProgressBar label="Rows Validated" current={validated} total={total} color="bg-emerald-500" />
                    )}
                    {batch.status === 'processing' && (
                      <>
                        <RowProgressBar label="Rows Imported" current={batch.imported_rows || 0} total={total} color="bg-blue-500" />
                        {(batch.updated_rows || 0) > 0 && (
                          <RowProgressBar label="Rows Updated" current={batch.updated_rows} total={total} color="bg-violet-500" />
                        )}
                      </>
                    )}
                    {(batch.invalid_rows || 0) > 0 && (
                      <div className="flex items-center gap-1 text-[10px] text-red-400">
                        <XCircle className="w-3 h-3" /> {batch.invalid_rows.toLocaleString()} invalid rows
                      </div>
                    )}
                  </div>
                )}

                {/* Resume button for paused */}
                {isPaused && (
                  <div className="flex items-center gap-2 pt-1">
                    <ResumeImportButton batch={batch} onResumed={() => {}} />
                    {batch.cancel_reason && (
                      <span className="text-[10px] text-amber-400/70 truncate">{batch.cancel_reason}</span>
                    )}
                  </div>
                )}

                {/* File info */}
                <div className="flex items-center gap-1.5 text-[10px] text-slate-600">
                  <FileText className="w-3 h-3" />
                  <span className="truncate">{batch.file_name}</span>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
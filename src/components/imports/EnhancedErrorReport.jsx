import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import {
  AlertTriangle, Download, Search, ChevronDown, ChevronRight,
  Lightbulb, Copy, FileText, Filter, XCircle, CheckCircle2,
  FileWarning, Clock, Database
} from 'lucide-react';
import { toast } from 'sonner';
import { categorizeError, ERROR_CATEGORIES, groupErrors } from './errorCategories';
import ValidationErrorBreakdown from './ValidationErrorBreakdown';

const IMPORT_TYPE_LABELS = {
  'nppes_monthly': 'NPPES Monthly', 'nppes_registry': 'NPPES Registry',
  'cms_utilization': 'CMS Utilization', 'cms_part_d': 'CMS Part D',
  'medicare_hha_stats': 'Medicare HHA Stats', 'medicare_ma_inpatient': 'Medicare MA Inpatient',
  'medicare_part_d_stats': 'Medicare Part D Stats', 'medicare_snf_stats': 'Medicare SNF Stats',
};

function getSuggestedFix(error) {
  const msg = (error.message || '').toLowerCase();
  if (msg.includes('rate limit') || msg.includes('429')) return { fix: 'Reduce import speed or wait before retrying. The API is rate-limited.', severity: 'warning', retryable: true };
  if (msg.includes('missing required') || msg.includes('required field')) return { fix: `Populate the missing field "${error.field || 'unknown'}" in your source data before re-importing.`, severity: 'error', retryable: false };
  if (msg.includes('invalid npi') || msg.includes('npi')) return { fix: 'Verify this NPI is a valid 10-digit number. Remove spaces, dashes, or letters.', severity: 'error', retryable: false };
  if (msg.includes('duplicate')) return { fix: 'This record already exists. Use "update existing" mode or skip duplicates.', severity: 'info', retryable: false };
  if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('stall')) return { fix: 'Transient timeout — simply retry the import. Consider smaller batch sizes.', severity: 'warning', retryable: true };
  if (msg.includes('parse') || msg.includes('json')) return { fix: 'Source data has malformed rows. Check file encoding (UTF-8) and format.', severity: 'error', retryable: false };
  if (msg.includes('numeric') || msg.includes('number') || msg.includes('nan')) return { fix: 'A numeric field contains text. Clean the source data or update column mapping.', severity: 'error', retryable: false };
  if (msg.includes('date') || msg.includes('format')) return { fix: 'Date format mismatch. Use YYYY-MM-DD or MM/DD/YYYY consistently.', severity: 'error', retryable: false };
  if (msg.includes('chunk') || msg.includes('bulk')) return { fix: 'Batch insert failed. Check for schema mismatches in the affected rows.', severity: 'error', retryable: true };
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('connection')) return { fix: 'Network error — check connectivity and retry.', severity: 'warning', retryable: true };
  return { fix: 'Review the error message and check your source data for issues.', severity: 'error', retryable: false };
}

function downloadFullReport(batch) {
  const errors = batch.error_samples || [];
  const lines = [];
  lines.push('Row,NPI,Error Category,Severity,Error Message,Suggested Fix,Retryable,Field,Sheet,Phase');
  for (const err of errors) {
    const cat = categorizeError(err.message);
    const config = ERROR_CATEGORIES[cat];
    const suggestion = getSuggestedFix(err);
    lines.push([
      err.row ?? '',
      err.npi ?? '',
      config?.label || 'Other',
      suggestion.severity,
      `"${(err.message || '').replace(/"/g, '""')}"`,
      `"${suggestion.fix.replace(/"/g, '""')}"`,
      suggestion.retryable ? 'Yes' : 'No',
      err.field || '',
      err.sheet || '',
      err.phase || '',
    ].join(','));
  }
  const csv = lines.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `error_report_${batch.import_type}_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(url);
  a.remove();
  toast.success('Error report downloaded');
}

function downloadJSONReport(batch) {
  const errors = batch.error_samples || [];
  const report = {
    batch_id: batch.id,
    import_type: IMPORT_TYPE_LABELS[batch.import_type] || batch.import_type,
    file_name: batch.file_name,
    created_at: batch.created_date,
    total_rows: batch.total_rows,
    total_errors: errors.length,
    errors: errors.map(err => {
      const cat = categorizeError(err.message);
      const suggestion = getSuggestedFix(err);
      return {
        row: err.row,
        npi: err.npi,
        field: err.field,
        sheet: err.sheet,
        phase: err.phase,
        category: ERROR_CATEGORIES[cat]?.label || 'Other',
        severity: suggestion.severity,
        message: err.message,
        suggested_fix: suggestion.fix,
        retryable: suggestion.retryable,
      };
    }),
  };
  const json = JSON.stringify(report, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `error_report_${batch.import_type}_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(url);
  a.remove();
  toast.success('JSON report downloaded');
}

const severityColors = {
  error: 'bg-red-500/15 text-red-400 border-red-500/20',
  warning: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  info: 'bg-slate-500/15 text-slate-400 border-slate-500/20',
};

export default function EnhancedErrorReport({ batch, open, onOpenChange }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [viewMode, setViewMode] = useState('grouped'); // 'grouped' or 'list'

  const errors = batch?.error_samples || [];

  const { grouped, sortedCategories, totalErrors } = useMemo(() => groupErrors(errors), [errors]);

  const filteredErrors = useMemo(() => {
    let result = errors;
    if (categoryFilter !== 'all') {
      result = result.filter(e => categorizeError(e.message) === categoryFilter);
    }
    if (severityFilter !== 'all') {
      result = result.filter(e => getSuggestedFix(e).severity === severityFilter);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(e =>
        (e.message || '').toLowerCase().includes(q) ||
        (e.field || '').toLowerCase().includes(q) ||
        String(e.row || '').includes(q) ||
        (e.npi || '').includes(q)
      );
    }
    return result;
  }, [errors, categoryFilter, severityFilter, searchQuery]);

  const toggleRow = (idx) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  if (!batch) return null;

  const retryableCount = errors.filter(e => getSuggestedFix(e).retryable).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] bg-[#141d30] border-slate-700 text-slate-200 flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-400">
            <AlertTriangle className="w-5 h-5" />
            Detailed Error Report
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            {IMPORT_TYPE_LABELS[batch.import_type] || batch.import_type} — {batch.file_name}
          </DialogDescription>
        </DialogHeader>

        {/* Summary bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 py-2">
          <div className="bg-slate-800/50 rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-slate-400">Total Errors</p>
            <p className="text-lg font-bold text-red-400">{totalErrors}</p>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-slate-400">Categories</p>
            <p className="text-lg font-bold text-slate-200">{sortedCategories.length}</p>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-slate-400">Retryable</p>
            <p className="text-lg font-bold text-amber-400">{retryableCount}</p>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-slate-400">Total Rows</p>
            <p className="text-lg font-bold text-slate-300">{(batch.total_rows || 0).toLocaleString()}</p>
          </div>
        </div>

        {/* View mode toggle */}
        <div className="flex items-center gap-2 py-1">
          <div className="flex bg-slate-800/50 rounded-lg p-0.5 border border-slate-700/50">
            <button
              onClick={() => setViewMode('grouped')}
              className={`px-3 py-1 rounded-md text-[11px] font-medium transition-colors ${
                viewMode === 'grouped' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Grouped by Type
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1 rounded-md text-[11px] font-medium transition-colors ${
                viewMode === 'list' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Row List
            </button>
          </div>
        </div>

        {viewMode === 'grouped' ? (
          <ScrollArea className="flex-1 min-h-0 rounded-md border border-slate-700/50 bg-slate-900/30">
            <div className="p-3">
              <ValidationErrorBreakdown errors={errors} batchName={batch.file_name} />
            </div>
          </ScrollArea>
        ) : (
        <>
        {/* Category breakdown */}
        <div className="flex gap-2 flex-wrap py-1">
          {sortedCategories.map(cat => {
            const config = ERROR_CATEGORIES[cat];
            const count = grouped[cat].length;
            return (
              <button
                key={cat}
                onClick={() => setCategoryFilter(categoryFilter === cat ? 'all' : cat)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all border ${
                  categoryFilter === cat
                    ? `${config.bgColor} ring-1 ring-current`
                    : 'bg-slate-800/50 border-slate-700/50 text-slate-400 hover:text-slate-300'
                }`}
              >
                <span className={categoryFilter === cat ? config.color : ''}>{config.label}</span>
                <Badge className="bg-slate-700/50 text-slate-300 text-[9px] h-4">{count}</Badge>
              </button>
            );
          })}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 py-1">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by row, NPI, field, or message..."
              className="h-8 pl-8 text-xs bg-slate-800/50 border-slate-700 text-slate-300"
            />
          </div>
          <select
            className="text-xs border border-slate-700 rounded-md px-2 py-1.5 bg-slate-800/50 text-slate-300 h-8"
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
          >
            <option value="all">All Severity</option>
            <option value="error">Errors</option>
            <option value="warning">Warnings</option>
            <option value="info">Info</option>
          </select>
          <Badge className="bg-slate-800 text-slate-400 text-[10px]">{filteredErrors.length} shown</Badge>
        </div>

        {/* Error rows */}
        <ScrollArea className="flex-1 min-h-0 rounded-md border border-slate-700/50 bg-slate-900/30">
          <div className="p-3 space-y-2">
            {filteredErrors.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No errors match your filters</p>
              </div>
            ) : (
              filteredErrors.map((err, idx) => {
                const cat = categorizeError(err.message);
                const config = ERROR_CATEGORIES[cat];
                const suggestion = getSuggestedFix(err);
                const isExpanded = expandedRows.has(idx);

                return (
                  <div key={idx} className="bg-slate-800/40 border border-slate-700/40 rounded-lg overflow-hidden">
                    <button
                      className="w-full flex items-start gap-2.5 p-3 text-left hover:bg-slate-700/20 transition-colors"
                      onClick={() => toggleRow(idx)}
                    >
                      <div className={`w-1 h-8 rounded-full flex-shrink-0 mt-0.5 ${
                        suggestion.severity === 'error' ? 'bg-red-500' :
                        suggestion.severity === 'warning' ? 'bg-amber-500' : 'bg-slate-500'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          {err.row != null && (
                            <Badge className="bg-slate-700/50 text-slate-300 text-[9px] font-mono">
                              Row {typeof err.row === 'number' ? err.row.toLocaleString() : err.row}
                            </Badge>
                          )}
                          {err.npi && (
                            <Badge className="bg-slate-700/50 text-slate-300 text-[9px] font-mono">
                              NPI: {err.npi}
                            </Badge>
                          )}
                          <Badge className={`${config.badgeColor} text-[9px]`}>{config.label}</Badge>
                          <Badge className={`${severityColors[suggestion.severity]} text-[9px]`}>{suggestion.severity}</Badge>
                          {err.field && (
                            <span className="text-[9px] text-slate-500">Field: <span className="text-slate-400 font-mono">{err.field}</span></span>
                          )}
                          {suggestion.retryable && (
                            <Badge className="bg-emerald-500/15 text-emerald-400 text-[9px]">Retryable</Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 truncate">
                          {err.message || 'Unknown error'}
                        </p>
                      </div>
                      {isExpanded
                        ? <ChevronDown className="w-4 h-4 text-slate-500 mt-1 flex-shrink-0" />
                        : <ChevronRight className="w-4 h-4 text-slate-500 mt-1 flex-shrink-0" />
                      }
                    </button>

                    {isExpanded && (
                      <div className="px-3 pb-3 border-t border-slate-700/30 space-y-2 pt-2">
                        {/* Full error message */}
                        <div className="bg-slate-900/50 rounded-md p-2">
                          <p className="text-[10px] text-slate-500 mb-1">Full Error Message</p>
                          <p className="text-[11px] text-slate-300 font-mono break-all whitespace-pre-wrap">
                            {err.message || 'No details'}
                          </p>
                        </div>

                        {/* Suggested fix */}
                        <div className="flex items-start gap-2 bg-emerald-500/5 border border-emerald-500/20 rounded-md p-2.5">
                          <Lightbulb className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-[10px] font-semibold text-emerald-400 mb-0.5">Suggested Fix</p>
                            <p className="text-[11px] text-slate-400">{suggestion.fix}</p>
                          </div>
                        </div>

                        {/* Metadata */}
                        <div className="flex gap-4 text-[10px] text-slate-500 flex-wrap">
                          {err.sheet && <span>Sheet: <span className="text-slate-400">{err.sheet}</span></span>}
                          {err.phase && <span>Phase: <span className="text-slate-400">{err.phase}</span></span>}
                          {err.timestamp && <span>Time: <span className="text-slate-400">{new Date(err.timestamp).toLocaleTimeString()}</span></span>}
                          {err.chunk_start && <span>Chunk: <span className="text-slate-400">{err.chunk_start}–{err.chunk_end}</span></span>}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
        </>
        )}

        <DialogFooter className="flex items-center justify-between gap-2">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5 bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-cyan-400"
              onClick={() => downloadFullReport(batch)}
            >
              <Download className="w-3.5 h-3.5" /> Download CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5 bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-cyan-400"
              onClick={() => downloadJSONReport(batch)}
            >
              <FileText className="w-3.5 h-3.5" /> Download JSON
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5 bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-cyan-400"
              onClick={() => {
                navigator.clipboard.writeText(JSON.stringify(batch.error_samples, null, 2));
                toast.success('Copied to clipboard');
              }}
            >
              <Copy className="w-3.5 h-3.5" /> Copy All
            </Button>
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="h-8 border-slate-700 text-slate-300 hover:bg-slate-800">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
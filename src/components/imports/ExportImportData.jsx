import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Download, FileJson, FileText, Loader2, Filter, CheckCircle2 } from 'lucide-react';

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

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(url);
  a.remove();
}

function batchToRow(b) {
  return {
    id: b.id,
    import_type: b.import_type,
    import_type_label: IMPORT_TYPE_LABELS[b.import_type] || b.import_type,
    file_name: b.file_name,
    status: b.status,
    category: b.category || '',
    tags: (b.tags || []).join('; '),
    total_rows: b.total_rows || 0,
    valid_rows: b.valid_rows || 0,
    invalid_rows: b.invalid_rows || 0,
    imported_rows: b.imported_rows || 0,
    updated_rows: b.updated_rows || 0,
    skipped_rows: b.skipped_rows || 0,
    duplicate_rows: b.duplicate_rows || 0,
    dry_run: b.dry_run ? 'Yes' : 'No',
    retry_count: b.retry_count || 0,
    created_date: b.created_date || '',
    completed_at: b.completed_at || '',
  };
}

function ruleToRow(r) {
  return {
    id: r.id,
    import_type: r.import_type,
    rule_name: r.rule_name,
    description: r.description || '',
    column: r.column,
    rule_type: r.rule_type,
    severity: r.severity,
    enabled: r.enabled !== false ? 'Yes' : 'No',
    order: r.order || 0,
    config: JSON.stringify(r.config || {}),
    created_date: r.created_date || '',
  };
}

function toCSV(rows) {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map(h => {
      const val = String(row[h] ?? '');
      return val.includes(',') || val.includes('"') || val.includes('\n')
        ? `"${val.replace(/"/g, '""')}"` : val;
    }).join(','));
  }
  return lines.join('\n');
}

export default function ExportImportData({ open, onOpenChange }) {
  const [exportTarget, setExportTarget] = useState('history'); // 'history' | 'rules'
  const [format, setFormat] = useState('csv');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState(false);

  const { data: batches = [] } = useQuery({
    queryKey: ['exportBatches'],
    queryFn: () => base44.entities.ImportBatch.list('-created_date', 500),
    enabled: open && exportTarget === 'history',
  });

  const { data: rules = [] } = useQuery({
    queryKey: ['exportRules'],
    queryFn: () => base44.entities.ImportValidationRule.list('-created_date', 500),
    enabled: open && exportTarget === 'rules',
  });

  const filteredBatches = useMemo(() => {
    let result = batches;
    if (statusFilter !== 'all') result = result.filter(b => b.status === statusFilter);
    if (typeFilter !== 'all') result = result.filter(b => b.import_type === typeFilter);
    if (dateStart) {
      const start = new Date(dateStart);
      result = result.filter(b => new Date(b.created_date) >= start);
    }
    if (dateEnd) {
      const end = new Date(dateEnd);
      end.setHours(23, 59, 59, 999);
      result = result.filter(b => new Date(b.created_date) <= end);
    }
    return result;
  }, [batches, statusFilter, typeFilter, dateStart, dateEnd]);

  const filteredRules = useMemo(() => {
    let result = rules;
    if (typeFilter !== 'all') result = result.filter(r => r.import_type === typeFilter);
    return result;
  }, [rules, typeFilter]);

  const uniqueTypes = useMemo(() => {
    const data = exportTarget === 'history' ? batches : rules;
    return [...new Set(data.map(d => d.import_type))].sort();
  }, [batches, rules, exportTarget]);

  const previewCount = exportTarget === 'history' ? filteredBatches.length : filteredRules.length;

  const handleExport = () => {
    setExporting(true);
    const rows = exportTarget === 'history'
      ? filteredBatches.map(batchToRow)
      : filteredRules.map(ruleToRow);

    const timestamp = new Date().toISOString().slice(0, 10);
    const baseName = `${exportTarget}_export_${timestamp}`;

    if (format === 'csv') {
      downloadFile(toCSV(rows), `${baseName}.csv`, 'text/csv');
    } else {
      downloadFile(JSON.stringify(rows, null, 2), `${baseName}.json`, 'application/json');
    }

    setExporting(false);
    setExported(true);
    setTimeout(() => setExported(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-[#141d30] border-slate-700">
        <DialogHeader>
          <DialogTitle className="text-slate-200 flex items-center gap-2">
            <Download className="w-5 h-5 text-cyan-400" />
            Export Data
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Target selector */}
          <div>
            <label className="text-xs text-slate-400 mb-1.5 block">What to export</label>
            <div className="flex gap-2">
              <button
                onClick={() => { setExportTarget('history'); setStatusFilter('all'); setTypeFilter('all'); }}
                className={`flex-1 px-3 py-2 rounded-lg text-sm border transition-colors ${
                  exportTarget === 'history'
                    ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
                    : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileText className="w-4 h-4 mx-auto mb-1" />
                Import Job History
              </button>
              <button
                onClick={() => { setExportTarget('rules'); setStatusFilter('all'); setTypeFilter('all'); }}
                className={`flex-1 px-3 py-2 rounded-lg text-sm border transition-colors ${
                  exportTarget === 'rules'
                    ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
                    : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileText className="w-4 h-4 mx-auto mb-1" />
                Validation Rules
              </button>
            </div>
          </div>

          {/* Format selector */}
          <div>
            <label className="text-xs text-slate-400 mb-1.5 block">Export format</label>
            <div className="flex gap-2">
              <button
                onClick={() => setFormat('csv')}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors ${
                  format === 'csv'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileText className="w-4 h-4" /> CSV
              </button>
              <button
                onClick={() => setFormat('json')}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors ${
                  format === 'json'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileJson className="w-4 h-4" /> JSON
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3 space-y-3">
            <p className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5" /> Filters
            </p>

            <div className="grid grid-cols-2 gap-3">
              {exportTarget === 'history' && (
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Status</label>
                  <select
                    className="w-full text-xs border border-slate-700 rounded-md px-2 py-1.5 bg-slate-800/50 text-slate-300"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="all">All</option>
                    <option value="completed">Completed</option>
                    <option value="failed">Failed</option>
                    <option value="processing">Processing</option>
                    <option value="paused">Paused</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              )}

              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Import Type</label>
                <select
                  className="w-full text-xs border border-slate-700 rounded-md px-2 py-1.5 bg-slate-800/50 text-slate-300"
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                >
                  <option value="all">All Types</option>
                  {uniqueTypes.map(t => (
                    <option key={t} value={t}>{IMPORT_TYPE_LABELS[t] || t}</option>
                  ))}
                </select>
              </div>
            </div>

            {exportTarget === 'history' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">From</label>
                  <input
                    type="date"
                    className="w-full text-xs border border-slate-700 rounded-md px-2 py-1.5 bg-slate-800/50 text-slate-300"
                    value={dateStart}
                    onChange={(e) => setDateStart(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">To</label>
                  <input
                    type="date"
                    className="w-full text-xs border border-slate-700 rounded-md px-2 py-1.5 bg-slate-800/50 text-slate-300"
                    value={dateEnd}
                    onChange={(e) => setDateEnd(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Preview count */}
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>{previewCount} record{previewCount !== 1 ? 's' : ''} will be exported</span>
            {exported && (
              <span className="flex items-center gap-1 text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" /> Downloaded!
              </span>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="bg-transparent border-slate-700 text-slate-300">
            Cancel
          </Button>
          <Button
            onClick={handleExport}
            disabled={exporting || previewCount === 0}
            className="bg-cyan-600 hover:bg-cyan-700 text-white"
          >
            {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            Export {format.toUpperCase()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
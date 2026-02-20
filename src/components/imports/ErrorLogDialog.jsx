import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Download, Search, ChevronDown, ChevronRight, Copy } from 'lucide-react';

const ERROR_CATEGORIES = {
  timeout: { label: 'Timeout', color: 'bg-orange-500/15 text-orange-400', keywords: ['timeout', 'timed out', 'ETIMEDOUT', 'deadline'] },
  validation: { label: 'Validation', color: 'bg-yellow-500/15 text-yellow-400', keywords: ['invalid', 'required', 'missing', 'format', 'schema', 'type'] },
  data_format: { label: 'Data Format', color: 'bg-violet-500/15 text-violet-400', keywords: ['parse', 'csv', 'column', 'header', 'encoding', 'utf'] },
  integrity: { label: 'Integrity', color: 'bg-red-500/15 text-red-400', keywords: ['duplicate', 'unique', 'constraint', 'conflict', 'exists'] },
  network: { label: 'Network', color: 'bg-blue-500/15 text-blue-400', keywords: ['network', 'connection', 'ECONNREFUSED', 'fetch', 'socket'] },
  processing: { label: 'Processing', color: 'bg-slate-500/15 text-slate-400', keywords: [] },
};

function categorizeError(msg) {
  const lower = (msg || '').toLowerCase();
  for (const [key, cat] of Object.entries(ERROR_CATEGORIES)) {
    if (key === 'processing') continue;
    if (cat.keywords.some(k => lower.includes(k))) return key;
  }
  return 'processing';
}

function downloadErrorCSV(errors, batchName) {
  const headers = ['Row', 'NPI', 'Category', 'Message'];
  const rows = errors.map(e => [
    e.row || '', e.npi || '', categorizeError(e.message), (e.message || '').replace(/"/g, '""')
  ]);
  const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `errors-${batchName || 'batch'}-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ErrorLogDialog({ batch, open, onOpenChange }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [expandedRows, setExpandedRows] = useState(new Set());

  const errors = batch?.error_samples || [];

  const categorizedErrors = useMemo(() => {
    return errors.map((e, idx) => ({ ...e, _idx: idx, _category: categorizeError(e.message) }));
  }, [errors]);

  const categoryCounts = useMemo(() => {
    const counts = {};
    categorizedErrors.forEach(e => {
      counts[e._category] = (counts[e._category] || 0) + 1;
    });
    return counts;
  }, [categorizedErrors]);

  const filteredErrors = useMemo(() => {
    return categorizedErrors.filter(e => {
      if (categoryFilter !== 'all' && e._category !== categoryFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (e.message || '').toLowerCase().includes(q) ||
          (e.npi || '').includes(q) ||
          String(e.row || '').includes(q);
      }
      return true;
    });
  }, [categorizedErrors, categoryFilter, searchQuery]);

  const toggleRow = (idx) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  if (!batch) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col bg-[#141d30] border-slate-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-200">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            Error Log — {batch.file_name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          {/* Category pills */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setCategoryFilter('all')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                categoryFilter === 'all' ? 'bg-cyan-500/20 text-cyan-400 ring-1 ring-cyan-500/30' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              All ({errors.length})
            </button>
            {Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]).map(([key, count]) => {
              const cat = ERROR_CATEGORIES[key];
              return (
                <button
                  key={key}
                  onClick={() => setCategoryFilter(key)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    categoryFilter === key ? 'bg-cyan-500/20 text-cyan-400 ring-1 ring-cyan-500/30' : `${cat.color} hover:opacity-80`
                  }`}
                >
                  {cat.label} ({count})
                </button>
              );
            })}
          </div>

          {/* Search + download */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search errors by message, NPI, or row..."
                className="pl-8 h-8 text-xs bg-slate-800/50 border-slate-700 text-slate-300 placeholder:text-slate-600"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadErrorCSV(errors, batch.file_name)}
              className="h-8 text-xs bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-cyan-400"
            >
              <Download className="w-3.5 h-3.5 mr-1" /> Download CSV
            </Button>
          </div>

          {/* Error list */}
          <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0">
            {filteredErrors.length === 0 ? (
              <p className="text-center text-slate-500 py-8 text-sm">No errors match your filter</p>
            ) : (
              filteredErrors.map((err) => {
                const isExpanded = expandedRows.has(err._idx);
                const cat = ERROR_CATEGORIES[err._category];
                return (
                  <div key={err._idx} className="border border-slate-700/50 rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggleRow(err._idx)}
                      className="w-full flex items-start gap-3 p-3 text-left hover:bg-slate-800/30 transition-colors"
                    >
                      {isExpanded ? <ChevronDown className="w-4 h-4 mt-0.5 text-slate-500 shrink-0" /> : <ChevronRight className="w-4 h-4 mt-0.5 text-slate-500 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-red-400 line-clamp-1">{err.message}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {err.row && <span className="text-xs text-slate-500">Row {err.row}</span>}
                          {err.npi && <span className="text-xs text-slate-500 font-mono">NPI: {err.npi}</span>}
                        </div>
                      </div>
                      <Badge className={`${cat.color} text-[10px] shrink-0`}>{cat.label}</Badge>
                    </button>
                    {isExpanded && (
                      <div className="px-10 pb-3 space-y-2">
                        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                          <div className="flex items-start justify-between">
                            <p className="text-sm text-red-400 whitespace-pre-wrap break-all">{err.message}</p>
                            <button
                              onClick={() => navigator.clipboard.writeText(err.message || '')}
                              className="text-slate-500 hover:text-slate-300 shrink-0 ml-2"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          {err.stack && (
                            <pre className="text-xs text-red-400/70 mt-2 whitespace-pre-wrap break-all border-t border-red-500/20 pt-2">{err.stack}</pre>
                          )}
                        </div>
                        {err.data && (
                          <div>
                            <p className="text-xs text-slate-500 mb-1">Row Data:</p>
                            <pre className="text-xs bg-slate-800/50 border border-slate-700/50 rounded p-2 overflow-auto max-h-32 text-slate-300">
                              {JSON.stringify(err.data, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <p className="text-xs text-slate-500 text-center pt-1">
            Showing {filteredErrors.length} of {errors.length} errors
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Download, Search, ChevronDown, ChevronRight, Copy } from 'lucide-react';

const ERROR_CATEGORIES = {
  timeout: { label: 'Timeout', color: 'bg-orange-100 text-orange-700', keywords: ['timeout', 'timed out', 'ETIMEDOUT', 'deadline'] },
  validation: { label: 'Validation', color: 'bg-yellow-100 text-yellow-700', keywords: ['invalid', 'required', 'missing', 'format', 'schema', 'type'] },
  data_format: { label: 'Data Format', color: 'bg-purple-100 text-purple-700', keywords: ['parse', 'csv', 'column', 'header', 'encoding', 'utf'] },
  integrity: { label: 'Integrity', color: 'bg-red-100 text-red-700', keywords: ['duplicate', 'unique', 'constraint', 'conflict', 'exists'] },
  network: { label: 'Network', color: 'bg-blue-100 text-blue-700', keywords: ['network', 'connection', 'ECONNREFUSED', 'fetch', 'socket'] },
  processing: { label: 'Processing', color: 'bg-gray-100 text-gray-700', keywords: [] },
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
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            Error Log — {batch.file_name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          {/* Category pills */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setCategoryFilter('all')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                categoryFilter === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
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
                    categoryFilter === key ? 'bg-slate-800 text-white' : `${cat.color} hover:opacity-80`
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
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search errors by message, NPI, or row..."
                className="pl-8 h-8 text-xs"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadErrorCSV(errors, batch.file_name)}
              className="h-8 text-xs"
            >
              <Download className="w-3.5 h-3.5 mr-1" /> Download CSV
            </Button>
          </div>

          {/* Error list */}
          <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0">
            {filteredErrors.length === 0 ? (
              <p className="text-center text-gray-400 py-8 text-sm">No errors match your filter</p>
            ) : (
              filteredErrors.map((err) => {
                const isExpanded = expandedRows.has(err._idx);
                const cat = ERROR_CATEGORIES[err._category];
                return (
                  <div key={err._idx} className="border rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggleRow(err._idx)}
                      className="w-full flex items-start gap-3 p-3 text-left hover:bg-gray-50 transition-colors"
                    >
                      {isExpanded ? <ChevronDown className="w-4 h-4 mt-0.5 text-gray-400 shrink-0" /> : <ChevronRight className="w-4 h-4 mt-0.5 text-gray-400 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-red-700 line-clamp-1">{err.message}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {err.row && <span className="text-xs text-gray-400">Row {err.row}</span>}
                          {err.npi && <span className="text-xs text-gray-400 font-mono">NPI: {err.npi}</span>}
                        </div>
                      </div>
                      <Badge className={`${cat.color} text-[10px] shrink-0`}>{cat.label}</Badge>
                    </button>
                    {isExpanded && (
                      <div className="px-10 pb-3 space-y-2">
                        <div className="bg-red-50 rounded-lg p-3">
                          <div className="flex items-start justify-between">
                            <p className="text-sm text-red-800 whitespace-pre-wrap break-all">{err.message}</p>
                            <button
                              onClick={() => navigator.clipboard.writeText(err.message || '')}
                              className="text-gray-400 hover:text-gray-600 shrink-0 ml-2"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          {err.stack && (
                            <pre className="text-xs text-red-500 mt-2 whitespace-pre-wrap break-all border-t border-red-200 pt-2">{err.stack}</pre>
                          )}
                        </div>
                        {err.data && (
                          <div>
                            <p className="text-xs text-gray-500 mb-1">Row Data:</p>
                            <pre className="text-xs bg-gray-50 rounded p-2 overflow-auto max-h-32">
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

          <p className="text-xs text-gray-400 text-center pt-1">
            Showing {filteredErrors.length} of {errors.length} errors
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
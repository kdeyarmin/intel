import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle, Download, Search, ChevronDown, ChevronRight, Copy,
  Lightbulb, ExternalLink, ShieldAlert, FileWarning, Type, Clock,
  Wifi, Wrench, HelpCircle
} from 'lucide-react';
import { ERROR_CATEGORIES, categorizeError, downloadErrorCSV } from './errorCategories';

const ICON_MAP = {
  ShieldAlert, FileWarning, Type, Copy, Clock, Wifi, Wrench, HelpCircle, AlertTriangle,
};

export default function ErrorLogDialog({ batch, open, onOpenChange }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [showSolutionFor, setShowSolutionFor] = useState(null);

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

  const activeSolutionConfig = showSolutionFor ? ERROR_CATEGORIES[showSolutionFor] : null;

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
              onClick={() => { setCategoryFilter('all'); setShowSolutionFor(null); }}
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
                  onClick={() => { setCategoryFilter(key); setShowSolutionFor(key); }}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    categoryFilter === key ? 'bg-cyan-500/20 text-cyan-400 ring-1 ring-cyan-500/30' : `${cat.badgeColor} hover:opacity-80`
                  }`}
                >
                  {cat.label} ({count})
                </button>
              );
            })}
          </div>

          {/* Solution panel for selected category */}
          {activeSolutionConfig && (
            <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Lightbulb className="w-4 h-4 text-yellow-400" />
                <span className="text-xs font-semibold text-slate-200">How to Fix: {activeSolutionConfig.label} Errors</span>
                <button
                  onClick={() => setShowSolutionFor(null)}
                  className="ml-auto text-slate-500 hover:text-slate-300 text-xs"
                >
                  Dismiss
                </button>
              </div>
              <p className="text-xs text-slate-400 mb-2">{activeSolutionConfig.description}</p>
              <ol className="space-y-1.5">
                {activeSolutionConfig.solutions.map((step, i) => (
                  <li key={i} className="text-xs text-slate-400 flex gap-2">
                    <span className="font-semibold text-yellow-400/70 flex-shrink-0">{i + 1}.</span>
                    {step}
                  </li>
                ))}
              </ol>
              {activeSolutionConfig.docUrl && (
                <a
                  href={activeSolutionConfig.docUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 mt-2 text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  {activeSolutionConfig.docLabel || 'Documentation'}
                </a>
              )}
            </div>
          )}

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
                const Icon = ICON_MAP[cat.icon] || AlertTriangle;
                return (
                  <div key={err._idx} className="border border-slate-700/50 rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggleRow(err._idx)}
                      className="w-full flex items-start gap-3 p-3 text-left hover:bg-slate-800/30 transition-colors"
                    >
                      {isExpanded ? <ChevronDown className="w-4 h-4 mt-0.5 text-slate-500 shrink-0" /> : <ChevronRight className="w-4 h-4 mt-0.5 text-slate-500 shrink-0" />}
                      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${cat.color}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-red-400 line-clamp-1">{err.message}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {err.row && <span className="text-xs text-slate-500">Row {err.row}</span>}
                          {err.npi && <span className="text-xs text-slate-500 font-mono">NPI: {err.npi}</span>}
                        </div>
                      </div>
                      <Badge className={`${cat.badgeColor} text-[10px] shrink-0`}>{cat.label}</Badge>
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
                        </div>

                        {/* Inline solution hint */}
                        <div className="bg-slate-800/50 border border-slate-700/30 rounded-lg p-2.5">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <Lightbulb className="w-3 h-3 text-yellow-400" />
                            <span className="text-[11px] font-medium text-slate-300">Quick Fix</span>
                          </div>
                          <p className="text-[11px] text-slate-400">{cat.solutions[0]}</p>
                          {cat.docUrl && (
                            <a
                              href={cat.docUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 mt-1.5 text-[11px] text-cyan-400 hover:text-cyan-300"
                            >
                              <ExternalLink className="w-2.5 h-2.5" />
                              {cat.docLabel}
                            </a>
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
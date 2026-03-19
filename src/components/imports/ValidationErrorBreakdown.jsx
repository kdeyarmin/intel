import React, { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle, ChevronDown, ChevronRight, Lightbulb, Download,
  Search, FileText, ShieldAlert, FileWarning, Type, Copy, Clock, Wifi,
  Wrench, HelpCircle, Database, Eye, Hash
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ERROR_CATEGORIES, groupErrors, downloadErrorCSV } from './errorCategories';

const ICON_MAP = {
  ShieldAlert, FileWarning, Type, Copy, Clock, Wifi, Wrench, HelpCircle, AlertTriangle,
};

function RowInspector({ error, onClose }) {
  const msg = error.message || error.detail || '';
  const fields = [];
  if (error.row != null) fields.push({ label: 'Row', value: error.row });
  if (error.npi) fields.push({ label: 'NPI', value: error.npi });
  if (error.field) fields.push({ label: 'Field', value: error.field });
  if (error.phase) fields.push({ label: 'Phase', value: error.phase });
  if (error.sheet) fields.push({ label: 'Sheet', value: error.sheet });
  if (error.expected_type) fields.push({ label: 'Expected Type', value: error.expected_type });
  if (error.actual_value !== undefined) fields.push({ label: 'Actual Value', value: String(error.actual_value) });
  if (error.column) fields.push({ label: 'Column', value: error.column });
  if (error.chunk_start != null) fields.push({ label: 'Chunk Start', value: error.chunk_start });

  return (
    <div className="bg-slate-900/60 border border-slate-600/40 rounded-lg p-3 space-y-2.5 mt-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
          <Eye className="w-3 h-3 text-cyan-400" /> Row Detail
        </span>
        <Button variant="ghost" size="sm" className="h-5 text-[10px] text-slate-500 px-1" onClick={onClose}>
          Close
        </Button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
        {fields.map(f => (
          <div key={f.label} className="bg-slate-800/60 rounded px-2 py-1">
            <span className="text-[9px] text-slate-500 block">{f.label}</span>
            <span className="text-[11px] text-slate-200 font-mono break-all">{f.value}</span>
          </div>
        ))}
      </div>
      <div className="bg-red-500/5 border border-red-500/15 rounded px-2.5 py-2">
        <span className="text-[9px] text-slate-500 block mb-0.5">Error Message</span>
        <p className="text-[11px] text-red-300 break-words">{msg}</p>
      </div>
    </div>
  );
}

function ErrorTypeGroup({ categoryKey, errors, batchName, defaultExpanded = false }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [showAllRows, setShowAllRows] = useState(false);
  const [inspectedRow, setInspectedRow] = useState(null);
  const [rowSearch, setRowSearch] = useState('');

  const config = ERROR_CATEGORIES[categoryKey];
  const Icon = ICON_MAP[config.icon] || AlertTriangle;
  const count = errors.length;

  // Deduplicate messages to find unique error patterns
  const patterns = useMemo(() => {
    const map = {};
    for (const err of errors) {
      // Normalize message to find patterns - strip numbers and specifics
      const msg = err.message || err.detail || 'No details';
      const normalized = msg
        .replace(/row \d+/gi, 'row N')
        .replace(/\b\d{10}\b/g, '<NPI>')
        .replace(/\b\d{4}-\d{2}-\d{2}\b/g, '<DATE>')
        .replace(/"[^"]+"/g, '"..."')
        .trim();
      if (!map[normalized]) {
        map[normalized] = { pattern: normalized, sample: msg, rows: [], errors: [] };
      }
      map[normalized].rows.push(err.row ?? err.row_index ?? err.chunk_start);
      map[normalized].errors.push(err);
    }
    return Object.values(map).sort((a, b) => b.rows.length - a.rows.length);
  }, [errors]);

  const filteredErrors = useMemo(() => {
    if (!rowSearch) return errors;
    const q = rowSearch.toLowerCase();
    return errors.filter(e =>
      String(e.row ?? e.row_index ?? '').includes(q) ||
      (e.npi || '').includes(q) ||
      (e.message || e.detail || '').toLowerCase().includes(q) ||
      (e.field || '').toLowerCase().includes(q)
    );
  }, [errors, rowSearch]);

  const visibleErrors = showAllRows ? filteredErrors : filteredErrors.slice(0, 5);

  return (
    <div className="border border-slate-700/40 rounded-lg overflow-hidden bg-slate-800/20">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-slate-700/15 transition-colors"
      >
        <Icon className={`w-4 h-4 flex-shrink-0 ${config.color}`} />
        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
          <Badge className={`${config.badgeColor} text-[10px]`}>{config.label}</Badge>
          <span className="text-xs font-semibold text-slate-300">{count} error{count !== 1 ? 's' : ''}</span>
          <span className="text-[10px] text-slate-500">{patterns.length} unique pattern{patterns.length !== 1 ? 's' : ''}</span>
        </div>
        {/* Mini distribution bar */}
        <div className="hidden sm:block w-20 h-1.5 bg-slate-700 rounded-full overflow-hidden flex-shrink-0">
          <div
            className={`h-full rounded-full ${config.color.replace('text-', 'bg-')}`}
            style={{ width: '100%', opacity: 0.7 }}
          />
        </div>
        {expanded ? <ChevronDown className="w-4 h-4 text-slate-500 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t border-slate-700/30 p-3 space-y-3">
          {/* Description */}
          <p className="text-[11px] text-slate-500">{config.description}</p>

          {/* Error Patterns */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-semibold text-slate-400 flex items-center gap-1">
              <Hash className="w-3 h-3" /> Error Patterns
            </span>
            {patterns.slice(0, 5).map((p, i) => (
              <div key={i} className="bg-slate-900/40 rounded px-2.5 py-1.5 flex items-start gap-2">
                <Badge className="bg-slate-700/60 text-slate-300 text-[9px] px-1.5 mt-0.5 shrink-0">
                  ×{p.rows.length}
                </Badge>
                <p className="text-[11px] text-slate-400 break-words flex-1 min-w-0">{p.sample}</p>
              </div>
            ))}
            {patterns.length > 5 && (
              <p className="text-[10px] text-slate-600">+{patterns.length - 5} more patterns</p>
            )}
          </div>

          {/* Row-level drill-down */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-[10px] font-semibold text-slate-400 flex items-center gap-1">
                <FileText className="w-3 h-3" /> Affected Rows
              </span>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3 h-3 absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-600" />
                  <Input
                    value={rowSearch}
                    onChange={(e) => setRowSearch(e.target.value)}
                    placeholder="Search rows..."
                    className="h-6 w-32 pl-5 text-[10px] bg-slate-900/40 border-slate-700/50 text-slate-300 placeholder:text-slate-600"
                  />
                </div>
                <Button
                  variant="ghost" size="sm"
                  className="h-6 text-[10px] text-cyan-400 hover:text-cyan-300 px-1.5"
                  onClick={() => downloadErrorCSV(errors, batchName)}
                >
                  <Download className="w-3 h-3 mr-0.5" /> CSV
                </Button>
              </div>
            </div>

            {/* Table-style row listing */}
            <div className="bg-slate-900/30 rounded-lg border border-slate-700/30 overflow-hidden">
              <div className="grid grid-cols-[60px_80px_1fr_40px] text-[9px] font-semibold text-slate-500 px-2.5 py-1.5 border-b border-slate-700/20 bg-slate-800/30">
                <span>Row</span>
                <span>Phase</span>
                <span>Message</span>
                <span className="text-right">View</span>
              </div>
              <div className="max-h-48 overflow-y-auto">
                {visibleErrors.map((err, idx) => {
                  const rowNum = err.row ?? err.row_index ?? err.chunk_start;
                  return (
                    <div key={idx}>
                      <div
                        className={`grid grid-cols-[60px_80px_1fr_40px] px-2.5 py-1.5 text-[11px] border-b border-slate-700/10 hover:bg-slate-700/15 transition-colors ${
                          inspectedRow === idx ? 'bg-cyan-500/5' : ''
                        }`}
                      >
                        <span className="text-slate-300 font-mono">
                          {rowNum != null ? (typeof rowNum === 'number' ? rowNum.toLocaleString() : rowNum) : '—'}
                        </span>
                        <span>
                          {err.phase ? (
                            <Badge className="text-[8px] bg-slate-700/50 text-slate-400 px-1 py-0">{err.phase}</Badge>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </span>
                        <span className="text-slate-400 truncate">{err.message || err.detail || 'No details'}</span>
                        <span className="text-right">
                          <Button
                            variant="ghost" size="sm"
                            className="h-5 w-5 p-0 text-slate-500 hover:text-cyan-400"
                            onClick={() => setInspectedRow(inspectedRow === idx ? null : idx)}
                          >
                            <Eye className="w-3 h-3" />
                          </Button>
                        </span>
                      </div>
                      {inspectedRow === idx && (
                        <div className="px-2.5 pb-2">
                          <RowInspector error={err} onClose={() => setInspectedRow(null)} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {filteredErrors.length > 5 && (
              <Button
                variant="ghost" size="sm"
                className="h-6 text-[10px] text-cyan-400 hover:text-cyan-300 w-full"
                onClick={() => setShowAllRows(!showAllRows)}
              >
                {showAllRows ? 'Show Less' : `Show All ${filteredErrors.length} Rows`}
              </Button>
            )}
          </div>

          {/* Solutions */}
          <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-lg p-2.5 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Lightbulb className="w-3.5 h-3.5 text-yellow-400" />
              <span className="text-[10px] font-semibold text-emerald-400">How to Fix "{config.label}" Errors</span>
            </div>
            <ol className="space-y-1">
              {config.solutions.map((step, i) => (
                <li key={i} className="text-[11px] text-slate-400 flex gap-1.5">
                  <span className="font-semibold text-slate-500 flex-shrink-0">{i + 1}.</span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ValidationErrorBreakdown({ errors, batchName, compact = false }) {
  const [showAll, setShowAll] = useState(false);

  const { grouped, sortedCategories, totalErrors } = useMemo(() => groupErrors(errors), [errors]);

  if (totalErrors === 0) return null;

  // Distribution data for compact bar chart
  const distribution = sortedCategories.map(cat => ({
    key: cat,
    count: grouped[cat].length,
    pct: Math.round((grouped[cat].length / totalErrors) * 100),
    config: ERROR_CATEGORIES[cat],
  }));

  if (compact) {
    const _top3 = distribution.slice(0, 3);
    return (
      <Card className="bg-[#141d30] border-red-500/15">
        <CardContent className="py-3 px-4 space-y-2.5">
          {/* Compact header */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-red-400" />
              <span className="text-xs font-semibold text-slate-200">
                {totalErrors} Validation Error{totalErrors !== 1 ? 's' : ''}
              </span>
              <span className="text-[10px] text-slate-500">
                {sortedCategories.length} type{sortedCategories.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost" size="sm"
                className="h-6 text-[10px] text-cyan-400 hover:text-cyan-300 px-1.5"
                onClick={() => downloadErrorCSV(errors, batchName)}
              >
                <Download className="w-3 h-3 mr-1" /> Export
              </Button>
              <Button
                variant="ghost" size="sm"
                className="h-6 text-[10px] text-slate-400 hover:text-slate-200 px-1.5"
                onClick={() => setShowAll(!showAll)}
              >
                {showAll ? 'Collapse' : 'Expand All'}
              </Button>
            </div>
          </div>

          {/* Distribution bar */}
          <div className="flex h-2 rounded-full overflow-hidden bg-slate-700/50">
            {distribution.map(d => (
              <div
                key={d.key}
                className={`h-full ${d.config.color.replace('text-', 'bg-')} opacity-70`}
                style={{ width: `${d.pct}%` }}
                title={`${d.config.label}: ${d.count} (${d.pct}%)`}
              />
            ))}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {distribution.map(d => {
              const _Icon = ICON_MAP[d.config.icon] || AlertTriangle;
              return (
                <div key={d.key} className="flex items-center gap-1">
                  <div className={`w-2 h-2 rounded-full ${d.config.color.replace('text-', 'bg-')} opacity-70`} />
                  <span className="text-[10px] text-slate-400">{d.config.label}</span>
                  <span className="text-[10px] text-slate-500 font-mono">{d.count}</span>
                </div>
              );
            })}
          </div>

          {/* Error type groups */}
          {showAll && (
            <div className="space-y-2 pt-1">
              {sortedCategories.map((cat, i) => (
                <ErrorTypeGroup
                  key={cat}
                  categoryKey={cat}
                  errors={grouped[cat]}
                  batchName={batchName}
                  defaultExpanded={i === 0}
                />
              ))}
            </div>
          )}

          {!showAll && (
            <div className="space-y-2 pt-1">
              {sortedCategories.slice(0, 2).map((cat, i) => (
                <ErrorTypeGroup
                  key={cat}
                  categoryKey={cat}
                  errors={grouped[cat]}
                  batchName={batchName}
                  defaultExpanded={i === 0}
                />
              ))}
              {sortedCategories.length > 2 && (
                <Button
                  variant="ghost" size="sm"
                  className="h-6 text-[10px] text-cyan-400 hover:text-cyan-300 w-full"
                  onClick={() => setShowAll(true)}
                >
                  +{sortedCategories.length - 2} more error type{sortedCategories.length - 2 !== 1 ? 's' : ''}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // Full expanded view
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-red-400" />
          <span className="text-sm font-semibold text-slate-200">
            Validation Errors — {totalErrors} total
          </span>
        </div>
        <Button
          variant="outline" size="sm"
          className="h-7 text-xs gap-1 bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-cyan-400"
          onClick={() => downloadErrorCSV(errors, batchName)}
        >
          <Download className="w-3 h-3" /> Download All
        </Button>
      </div>

      {/* Distribution bar */}
      <div className="flex h-2.5 rounded-full overflow-hidden bg-slate-700/50">
        {distribution.map(d => (
          <div
            key={d.key}
            className={`h-full ${d.config.color.replace('text-', 'bg-')} opacity-70`}
            style={{ width: `${d.pct}%` }}
            title={`${d.config.label}: ${d.count} (${d.pct}%)`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {distribution.map(d => (
          <div key={d.key} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-full ${d.config.color.replace('text-', 'bg-')} opacity-70`} />
            <span className="text-xs text-slate-400">{d.config.label}</span>
            <span className="text-xs text-slate-300 font-semibold">{d.count}</span>
            <span className="text-[10px] text-slate-500">({d.pct}%)</span>
          </div>
        ))}
      </div>

      {/* All groups expanded */}
      <div className="space-y-2">
        {sortedCategories.map((cat, i) => (
          <ErrorTypeGroup
            key={cat}
            categoryKey={cat}
            errors={grouped[cat]}
            batchName={batchName}
            defaultExpanded={i === 0}
          />
        ))}
      </div>
    </div>
  );
}
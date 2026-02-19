import React, { useState, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertTriangle, FileWarning, ShieldAlert, Clock, Hash,
  Download, ChevronDown, ChevronRight, Database, Type
} from 'lucide-react';

const ERROR_TYPE_CONFIG = {
  data_format: {
    label: 'Data Format',
    icon: Type,
    color: 'text-orange-600',
    badgeColor: 'bg-orange-100 text-orange-800',
    keywords: ['format', 'malformed', 'parse', 'invalid date', 'invalid number', 'not a number', 'type', 'NaN', 'JSON', 'CSV', 'encoding', 'charset', 'unexpected token'],
    description: 'Values are in the wrong format or cannot be parsed',
  },
  missing_values: {
    label: 'Missing Values',
    icon: FileWarning,
    color: 'text-amber-600',
    badgeColor: 'bg-amber-100 text-amber-800',
    keywords: ['missing', 'required', 'null', 'undefined', 'empty', 'blank', 'not provided', 'is required'],
    description: 'Required fields are missing or empty',
  },
  integrity: {
    label: 'Integrity Constraint',
    icon: ShieldAlert,
    color: 'text-red-600',
    badgeColor: 'bg-red-100 text-red-800',
    keywords: ['duplicate', 'unique', 'constraint', 'conflict', 'already exists', 'foreign key', 'referenc', 'integrity', 'duplicate key'],
    description: 'Records violate uniqueness or referential integrity rules',
  },
  validation: {
    label: 'Validation Error',
    icon: AlertTriangle,
    color: 'text-purple-600',
    badgeColor: 'bg-purple-100 text-purple-800',
    keywords: ['invalid', 'validation', 'schema', 'NPI', 'out of range', 'too long', 'too short', 'pattern', 'enum', 'length'],
    description: 'Values fail schema or business rule validation',
  },
  timeout: {
    label: 'Timeout / Stall',
    icon: Clock,
    color: 'text-blue-600',
    badgeColor: 'bg-blue-100 text-blue-800',
    keywords: ['timeout', 'timed out', 'stalled', 'exceeded', 'too long', 'abort'],
    description: 'Operation took too long and was terminated',
  },
  other: {
    label: 'Other',
    icon: Hash,
    color: 'text-gray-600',
    badgeColor: 'bg-gray-100 text-gray-700',
    keywords: [],
    description: 'Uncategorized errors',
  },
};

function categorizeError(message) {
  if (!message) return 'other';
  const lower = message.toLowerCase();
  for (const [key, config] of Object.entries(ERROR_TYPE_CONFIG)) {
    if (key === 'other') continue;
    if (config.keywords.some(kw => lower.includes(kw))) return key;
  }
  return 'other';
}

function downloadFailedRowsCSV(errors, batchName) {
  const headers = ['Row', 'NPI', 'Error Category', 'Error Message'];
  const rows = errors.map(err => [
    err.row ?? '',
    err.npi ?? '',
    ERROR_TYPE_CONFIG[categorizeError(err.message)]?.label || 'Other',
    (err.message || '').replace(/"/g, '""'),
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(r => r.map(v => `"${v}"`).join(',')),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `failed_rows_${batchName || 'batch'}.csv`;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(url);
  a.remove();
}

export default function ErrorSummaryPanel({ errors, batchName, compact = false }) {
  const [expanded, setExpanded] = useState(false);

  const { grouped, sortedCategories, totalErrors } = useMemo(() => {
    if (!errors || errors.length === 0) return { grouped: {}, sortedCategories: [], totalErrors: 0 };

    const g = {};
    for (const err of errors) {
      const cat = categorizeError(err.message);
      if (!g[cat]) g[cat] = [];
      g[cat].push(err);
    }

    const sorted = Object.keys(g).sort((a, b) => g[b].length - g[a].length);
    return { grouped: g, sortedCategories: sorted, totalErrors: errors.length };
  }, [errors]);

  if (totalErrors === 0) return null;

  const top3 = sortedCategories.slice(0, 3);

  if (compact) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
          <span className="text-xs font-semibold text-gray-700">{totalErrors} error{totalErrors !== 1 ? 's' : ''} in {sortedCategories.length} categor{sortedCategories.length !== 1 ? 'ies' : 'y'}:</span>
          {top3.map(cat => {
            const config = ERROR_TYPE_CONFIG[cat];
            return (
              <Badge key={cat} className={`${config.badgeColor} text-[10px] py-0`}>
                {config.label} ({grouped[cat].length})
              </Badge>
            );
          })}
          {sortedCategories.length > 3 && (
            <span className="text-[10px] text-gray-500">+{sortedCategories.length - 3} more</span>
          )}
        </div>
        <Button
          variant="ghost" size="sm"
          className="h-6 text-[10px] text-blue-600 hover:text-blue-800 px-1"
          onClick={() => downloadFailedRowsCSV(errors, batchName)}
        >
          <Download className="w-3 h-3 mr-1" /> Download failed rows
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Summary header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-red-500" />
          <span className="text-sm font-semibold text-gray-800">
            Error Analysis — {totalErrors} error{totalErrors !== 1 ? 's' : ''}
          </span>
        </div>
        <Button
          variant="outline" size="sm"
          className="h-7 text-xs gap-1"
          onClick={() => downloadFailedRowsCSV(errors, batchName)}
        >
          <Download className="w-3 h-3" /> Download Failed Rows CSV
        </Button>
      </div>

      {/* Top 3 error types */}
      <Card className="border-red-100 bg-red-50/30">
        <CardContent className="py-3 px-4">
          <p className="text-xs font-semibold text-gray-600 mb-2">Top Error Types</p>
          <div className="space-y-2">
            {top3.map(cat => {
              const config = ERROR_TYPE_CONFIG[cat];
              const Icon = config.icon;
              const count = grouped[cat].length;
              const pct = Math.round((count / totalErrors) * 100);
              const sample = grouped[cat][0];
              return (
                <div key={cat} className="flex items-start gap-3 bg-white rounded-lg p-2.5 border border-gray-100">
                  <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${config.color}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <Badge className={`${config.badgeColor} text-[10px]`}>{config.label}</Badge>
                      <span className="text-xs font-semibold text-gray-700">{count} ({pct}%)</span>
                    </div>
                    <p className="text-[11px] text-gray-500 mb-1">{config.description}</p>
                    <div className="bg-gray-50 rounded px-2 py-1 text-[11px] text-gray-600 truncate">
                      <span className="text-gray-400">Sample: </span>
                      {sample?.row != null && <span className="text-gray-500">Row {sample.row} — </span>}
                      {sample?.message || 'No details'}
                    </div>
                    {/* Progress bar for proportion */}
                    <div className="mt-1.5 h-1 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${config.color.replace('text-', 'bg-')}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {sortedCategories.length > 3 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 mt-2"
            >
              {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              {sortedCategories.length - 3} more categor{sortedCategories.length - 3 !== 1 ? 'ies' : 'y'}
            </button>
          )}

          {expanded && sortedCategories.slice(3).map(cat => {
            const config = ERROR_TYPE_CONFIG[cat];
            const Icon = config.icon;
            const count = grouped[cat].length;
            const pct = Math.round((count / totalErrors) * 100);
            return (
              <div key={cat} className="flex items-center gap-2 mt-2 bg-white rounded-lg p-2 border border-gray-100">
                <Icon className={`w-3.5 h-3.5 ${config.color}`} />
                <Badge className={`${config.badgeColor} text-[10px]`}>{config.label}</Badge>
                <span className="text-xs text-gray-600">{count} ({pct}%)</span>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
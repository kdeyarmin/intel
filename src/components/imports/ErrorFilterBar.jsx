import React from 'react';
import { Button } from '@/components/ui/button';
import { X, Filter } from 'lucide-react';
import { ERROR_CATEGORIES } from './errorCategories';

const SEVERITY_OPTIONS = [
  { key: 'reject', label: 'Rejected', color: 'bg-red-500/15 text-red-400 border-red-500/20' },
  { key: 'warn', label: 'Warned', color: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
  { key: 'flag', label: 'Flagged', color: 'bg-blue-500/15 text-blue-400 border-blue-500/20' },
];

export default function ErrorFilterBar({ filters, onFilterChange, errorCategories = [] }) {
  const toggleSeverity = (sev) => {
    const next = filters.severity === sev ? null : sev;
    onFilterChange({ ...filters, severity: next });
  };

  const toggleCategory = (cat) => {
    const next = filters.category === cat ? null : cat;
    onFilterChange({ ...filters, category: next });
  };

  const clearAll = () => onFilterChange({ severity: null, category: null });
  const hasFilters = filters.severity || filters.category;

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400">
          <Filter className="w-3.5 h-3.5 text-cyan-400" />
          Filter Errors
        </div>
        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-5 text-[10px] text-slate-500 hover:text-slate-300 px-1" onClick={clearAll}>
            <X className="w-3 h-3 mr-0.5" /> Clear
          </Button>
        )}
      </div>

      {/* Severity row */}
      <div>
        <p className="text-[10px] text-slate-500 mb-1.5">By Severity</p>
        <div className="flex gap-1.5 flex-wrap">
          {SEVERITY_OPTIONS.map(s => (
            <button
              key={s.key}
              onClick={() => toggleSeverity(s.key)}
              className={`px-2 py-0.5 rounded-md text-[10px] font-medium border transition-all ${
                filters.severity === s.key
                  ? s.color + ' ring-1 ring-offset-1 ring-offset-slate-900'
                  : 'border-slate-700/50 text-slate-500 hover:text-slate-300 hover:border-slate-600'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Category row */}
      {errorCategories.length > 0 && (
        <div>
          <p className="text-[10px] text-slate-500 mb-1.5">By Type</p>
          <div className="flex gap-1.5 flex-wrap">
            {errorCategories.map(cat => {
              const config = ERROR_CATEGORIES[cat];
              if (!config) return null;
              return (
                <button
                  key={cat}
                  onClick={() => toggleCategory(cat)}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-medium border transition-all ${
                    filters.category === cat
                      ? config.badgeColor + ' ring-1 ring-offset-1 ring-offset-slate-900'
                      : 'border-slate-700/50 text-slate-500 hover:text-slate-300 hover:border-slate-600'
                  }`}
                >
                  {config.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
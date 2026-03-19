import React from 'react';
import { Input } from '@/components/ui/input';
import { Filter } from 'lucide-react';
import { buildImportTypeLabels } from '@/lib/cmsImportTypes';

const IMPORT_TYPE_LABELS = buildImportTypeLabels({
  home_health_enrollments: 'HH Enrollments',
  home_health_cost_reports: 'HH Cost Reports',
  home_health_pdgm: 'HH PDGM',
});

export default function AnalyticsFilters({ filters, onChange, importTypes = [] }) {
  const updateFilter = (key, value) => onChange({ ...filters, [key]: value });

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-1.5 text-xs text-slate-500">
        <Filter className="w-3.5 h-3.5" />
        Filters:
      </div>
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-slate-500">From:</label>
        <Input
          type="date"
          value={filters.dateStart || ''}
          onChange={(e) => updateFilter('dateStart', e.target.value)}
          className="h-7 w-36 text-[11px] bg-slate-800/50 border-slate-700 text-slate-300"
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-slate-500">To:</label>
        <Input
          type="date"
          value={filters.dateEnd || ''}
          onChange={(e) => updateFilter('dateEnd', e.target.value)}
          className="h-7 w-36 text-[11px] bg-slate-800/50 border-slate-700 text-slate-300"
        />
      </div>
      <select
        className="text-xs border border-slate-700 rounded-md px-2 py-1 bg-slate-800/50 text-slate-300 h-7"
        value={filters.importType || ''}
        onChange={(e) => updateFilter('importType', e.target.value)}
      >
        <option value="">All Types</option>
        {importTypes.map(t => (
          <option key={t} value={t}>{IMPORT_TYPE_LABELS[t] || t}</option>
        ))}
      </select>
      <select
        className="text-xs border border-slate-700 rounded-md px-2 py-1 bg-slate-800/50 text-slate-300 h-7"
        value={filters.status || ''}
        onChange={(e) => updateFilter('status', e.target.value)}
      >
        <option value="">All Statuses</option>
        <option value="completed">Completed</option>
        <option value="failed">Failed</option>
        <option value="processing">Processing</option>
        <option value="paused">Paused</option>
        <option value="cancelled">Cancelled</option>
      </select>
      {(filters.dateStart || filters.dateEnd || filters.importType || filters.status) && (
        <button
          onClick={() => onChange({ dateStart: '', dateEnd: '', importType: '', status: '' })}
          className="text-[10px] text-cyan-400 hover:text-cyan-300"
        >
          Clear all
        </button>
      )}
    </div>
  );
}

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowUpDown } from 'lucide-react';

const SORT_OPTIONS = [
  { value: 'created_date_desc', label: 'Created Date (Newest)' },
  { value: 'created_date_asc', label: 'Created Date (Oldest)' },
  { value: 'completed_date_desc', label: 'Completed Date (Newest)' },
  { value: 'completed_date_asc', label: 'Completed Date (Oldest)' },
  { value: 'total_rows_desc', label: 'Total Rows (High to Low)' },
  { value: 'total_rows_asc', label: 'Total Rows (Low to High)' },
];

export default function BatchFilterSort({ 
  sortBy, 
  onSortChange, 
  onFilterTypeChange,
  importTypes,
  currentImportTypeFilter 
}) {
  const [showSortMenu, setShowSortMenu] = useState(false);

  return (
    <div className="flex items-center gap-2">
      {/* Sort Button */}
      <div className="relative">
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-cyan-400"
          onClick={() => setShowSortMenu(!showSortMenu)}
        >
          <ArrowUpDown className="w-3.5 h-3.5 mr-1.5" />
          Sort
        </Button>
        {showSortMenu && (
          <div className="absolute top-full mt-1 right-0 bg-[#141d30] border border-slate-700/50 rounded-lg shadow-lg z-20 min-w-48">
            <div className="py-1">
              {SORT_OPTIONS.map(option => (
                <button
                  key={option.value}
                  onClick={() => {
                    onSortChange(option.value);
                    setShowSortMenu(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                    sortBy === option.value
                      ? 'bg-slate-700 text-cyan-400'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {sortBy === option.value && <span className="mr-2">✓</span>}
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Import Type Filter */}
      {importTypes.length > 0 && (
        <select
          className="text-xs border border-slate-700 rounded-md px-2 py-1.5 bg-slate-800/50 text-slate-300 h-8"
          value={currentImportTypeFilter || ''}
          onChange={(e) => onFilterTypeChange(e.target.value)}
        >
          <option value="">All Import Types</option>
          {importTypes.map(type => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
      )}
    </div>
  );
}
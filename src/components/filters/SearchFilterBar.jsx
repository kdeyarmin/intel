import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, X } from 'lucide-react';

export default function SearchFilterBar({ searchTerm, onSearchChange, filters = [], onReset }) {
  const hasActiveFilters = searchTerm || filters.some(f => f.value && f.value !== 'all');

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Search by name, NPI, or keyword..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={onReset} className="text-gray-500 hover:text-gray-700">
            <X className="w-4 h-4 mr-1" /> Clear
          </Button>
        )}
      </div>
      {filters.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {filters.map((filter) => (
            <div key={filter.key} className="min-w-[140px]">
              {filter.type === 'select' ? (
                <Select value={filter.value || 'all'} onValueChange={(v) => filter.onChange(v)}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder={filter.label} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{filter.label}: All</SelectItem>
                    {filter.options.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : filter.type === 'text' ? (
                <Input
                  placeholder={filter.label}
                  value={filter.value || ''}
                  onChange={(e) => filter.onChange(e.target.value)}
                  className="h-9 text-sm"
                />
              ) : filter.type === 'number' ? (
                <Input
                  type="number"
                  placeholder={filter.label}
                  value={filter.value || ''}
                  onChange={(e) => filter.onChange(e.target.value)}
                  className="h-9 text-sm"
                />
              ) : filter.type === 'date' ? (
                <Input
                  type="date"
                  value={filter.value || ''}
                  onChange={(e) => filter.onChange(e.target.value)}
                  className="h-9 text-sm"
                  title={filter.label}
                />
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
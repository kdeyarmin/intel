import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronUp, X, SlidersHorizontal } from 'lucide-react';

export default function ProviderAdvancedFilters({
  filters,
  onFilterChange,
  onReset,
  specialtyOptions = [],
  stateOptions = [],
  credentialOptions = [],
}) {
  const [expanded, setExpanded] = useState(false);

  const activeCount = Object.entries(filters).filter(
    ([k, v]) => v && v !== 'all' && k !== 'searchTerm' && k !== 'sortField' && k !== 'sortDir'
  ).length;

  const setFilter = (key, value) => onFilterChange({ ...filters, [key]: value });

  return (
    <div className="space-y-2">
      {/* Primary row: always visible filters */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect
          label="Type"
          value={filters.entityTypeFilter}
          onChange={(v) => setFilter('entityTypeFilter', v)}
          options={[
            { value: 'Individual', label: 'Individual' },
            { value: 'Organization', label: 'Organization' },
          ]}
        />
        <FilterSelect
          label="Status"
          value={filters.statusFilter}
          onChange={(v) => setFilter('statusFilter', v)}
          options={[
            { value: 'Active', label: 'Active' },
            { value: 'Deactivated', label: 'Deactivated' },
          ]}
        />
        <FilterSelect
          label="State"
          value={filters.stateFilter}
          onChange={(v) => setFilter('stateFilter', v)}
          options={stateOptions}
        />
        <FilterSelect
          label="Specialty"
          value={filters.specialtyFilter}
          onChange={(v) => setFilter('specialtyFilter', v)}
          options={specialtyOptions}
        />

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(!expanded)}
          className="text-slate-500 hover:text-slate-700 h-9 text-xs gap-1"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          More
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </Button>

        {activeCount > 0 && (
          <Button variant="ghost" size="sm" onClick={onReset} className="text-slate-400 hover:text-slate-600 h-9 text-xs gap-1">
            <X className="w-3 h-3" /> Clear ({activeCount})
          </Button>
        )}
      </div>

      {/* Expanded row */}
      {expanded && (
        <div className="flex flex-wrap items-center gap-2 pl-0.5">
          <FilterSelect
            label="Credential"
            value={filters.credentialFilter}
            onChange={(v) => setFilter('credentialFilter', v)}
            options={credentialOptions}
          />
          <FilterSelect
            label="Email"
            value={filters.emailFilter}
            onChange={(v) => setFilter('emailFilter', v)}
            options={[
              { value: 'has_email', label: 'Has Email' },
              { value: 'no_email', label: 'No Email' },
              { value: 'high', label: 'High Confidence' },
              { value: 'medium', label: 'Medium Confidence' },
              { value: 'not_searched', label: 'Not Searched' },
            ]}
          />
          <FilterSelect
            label="Enrichment"
            value={filters.enrichmentFilter}
            onChange={(v) => setFilter('enrichmentFilter', v)}
            options={[
              { value: 'yes', label: 'Needs Enrichment' },
              { value: 'no', label: 'Enriched' },
            ]}
          />
        </div>
      )}

      {/* Active filter chips */}
      {activeCount > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {filters.entityTypeFilter && filters.entityTypeFilter !== 'all' && (
            <FilterChip label={`Type: ${filters.entityTypeFilter}`} onRemove={() => setFilter('entityTypeFilter', 'all')} />
          )}
          {filters.statusFilter && filters.statusFilter !== 'all' && (
            <FilterChip label={`Status: ${filters.statusFilter}`} onRemove={() => setFilter('statusFilter', 'all')} />
          )}
          {filters.stateFilter && filters.stateFilter !== 'all' && (
            <FilterChip label={`State: ${filters.stateFilter}`} onRemove={() => setFilter('stateFilter', 'all')} />
          )}
          {filters.specialtyFilter && filters.specialtyFilter !== 'all' && (
            <FilterChip label={`Specialty: ${filters.specialtyFilter}`} onRemove={() => setFilter('specialtyFilter', 'all')} />
          )}
          {filters.credentialFilter && filters.credentialFilter !== 'all' && (
            <FilterChip label={`Credential: ${filters.credentialFilter}`} onRemove={() => setFilter('credentialFilter', 'all')} />
          )}
          {filters.emailFilter && filters.emailFilter !== 'all' && (
            <FilterChip label={`Email: ${filters.emailFilter}`} onRemove={() => setFilter('emailFilter', 'all')} />
          )}
          {filters.enrichmentFilter && filters.enrichmentFilter !== 'all' && (
            <FilterChip label={`Enrichment: ${filters.enrichmentFilter}`} onRemove={() => setFilter('enrichmentFilter', 'all')} />
          )}
        </div>
      )}
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <Select value={value || 'all'} onValueChange={onChange}>
      <SelectTrigger className="h-9 text-xs w-[140px] bg-slate-800/50 border-slate-700 text-slate-300">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{label}: All</SelectItem>
        {options.map(opt => (
          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function FilterChip({ label, onRemove }) {
  return (
    <Badge variant="secondary" className="text-xs py-0.5 pl-2 pr-1 gap-1 bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/15 cursor-default">
      {label}
      <button onClick={onRemove} className="hover:bg-cyan-500/20 rounded-full p-0.5 transition-colors">
        <X className="w-3 h-3" />
      </button>
    </Badge>
  );
}
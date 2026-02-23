import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, X, TextSearch } from 'lucide-react';

const MATCH_MODES = [
  { value: 'contains', label: 'Contains' },
  { value: 'starts_with', label: 'Starts with' },
  { value: 'ends_with', label: 'Ends with' },
  { value: 'exact', label: 'Exact match' },
  { value: 'not_contains', label: 'Does not contain' },
];

export default function TextMatchFilter({ columns, activeTextFilters, onFiltersChange }) {
  const [column, setColumn] = useState(columns[0]?.value || '');
  const [mode, setMode] = useState('contains');
  const [term, setTerm] = useState('');

  const addFilter = () => {
    if (!term.trim() || !column) return;
    const newFilter = { column, mode, term: term.trim(), id: Date.now() };
    onFiltersChange([...activeTextFilters, newFilter]);
    setTerm('');
  };

  const removeFilter = (id) => {
    onFiltersChange(activeTextFilters.filter(f => f.id !== id));
  };

  const getModeLabel = (m) => MATCH_MODES.find(mm => mm.value === m)?.label || m;
  const getColumnLabel = (v) => columns.find(c => c.value === v)?.label || v;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs text-slate-400">
        <TextSearch className="w-3.5 h-3.5" />
        Text Matching
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Select value={column} onValueChange={setColumn}>
          <SelectTrigger className="h-8 text-xs w-[120px] bg-slate-800/50 border-slate-700 text-slate-300">
            <SelectValue placeholder="Column" />
          </SelectTrigger>
          <SelectContent>
            {columns.map(c => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={mode} onValueChange={setMode}>
          <SelectTrigger className="h-8 text-xs w-[130px] bg-slate-800/50 border-slate-700 text-slate-300">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MATCH_MODES.map(m => (
              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Value..."
          className="h-8 text-xs w-[140px] bg-slate-800/50 border-slate-700 text-slate-200"
          onKeyDown={(e) => e.key === 'Enter' && addFilter()}
        />
        <Button variant="outline" size="sm" onClick={addFilter} className="h-8 text-xs border-slate-700 text-slate-300 hover:text-cyan-400" disabled={!term.trim()}>
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </div>
      {activeTextFilters.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {activeTextFilters.map(f => (
            <Badge key={f.id} variant="secondary" className="text-xs py-0.5 pl-2 pr-1 gap-1 bg-violet-500/10 text-violet-400 border border-violet-500/20">
              {getColumnLabel(f.column)} {getModeLabel(f.mode)} "{f.term}"
              <button onClick={() => removeFilter(f.id)} className="hover:bg-violet-500/20 rounded-full p-0.5">
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// Apply text match filters to data
export function applyTextFilters(data, textFilters) {
  if (!textFilters || textFilters.length === 0) return data;
  return data.filter(row => {
    return textFilters.every(f => {
      const val = String(row[f.column] || '').toLowerCase();
      const term = f.term.toLowerCase();
      switch (f.mode) {
        case 'contains': return val.includes(term);
        case 'starts_with': return val.startsWith(term);
        case 'ends_with': return val.endsWith(term);
        case 'exact': return val === term;
        case 'not_contains': return !val.includes(term);
        default: return true;
      }
    });
  });
}
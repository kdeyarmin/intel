import React, { useId } from 'react';
import { Checkbox } from '@/components/ui/checkbox';

export default function ColumnSelector({ fields, selectedFields, onToggle, onSelectAll, onSelectNone }) {
  const uid = useId();
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span id={`${uid}-columns`} className="font-medium leading-none text-xs text-slate-400 uppercase tracking-wider">Columns</span>
        <div className="flex gap-2">
          <button onClick={onSelectAll} className="text-xs text-cyan-400 hover:underline">Select All</button>
          <button onClick={onSelectNone} className="text-xs text-slate-400 hover:underline">Clear</button>
        </div>
      </div>
      <div role="group" aria-labelledby={`${uid}-columns`} className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto p-2 border border-slate-700 rounded-lg bg-slate-800/50">
        {fields.map(f => (
          <label key={f.key} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-slate-700/40 rounded p-1.5 text-slate-300">
            <Checkbox
              aria-label={f.label}
              checked={selectedFields.includes(f.key)}
              onCheckedChange={() => onToggle(f.key)}
            />
            <span className="text-xs">{f.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
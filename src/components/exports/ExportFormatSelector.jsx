import React from 'react';
import { FileText, Sheet, FileDown, Braces } from 'lucide-react';

const FORMAT_OPTIONS = [
  { key: 'csv', label: 'CSV', icon: FileText, desc: 'Comma-separated values' },
  { key: 'excel', label: 'Excel', icon: Sheet, desc: 'Excel spreadsheet' },
  { key: 'json', label: 'JSON', icon: Braces, desc: 'Structured data format' },
  { key: 'pdf', label: 'PDF', icon: FileDown, desc: 'Printable document' },
];

export default function ExportFormatSelector({ format, onFormatChange }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {FORMAT_OPTIONS.map(opt => {
        const Icon = opt.icon;
        const active = format === opt.key;
        return (
          <button
            key={opt.key}
            onClick={() => onFormatChange(opt.key)}
            className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all text-sm ${
              active
                ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                : 'border-slate-700 hover:border-slate-600 text-slate-400'
            }`}
          >
            <Icon className="w-5 h-5" />
            <span className="font-medium text-xs">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
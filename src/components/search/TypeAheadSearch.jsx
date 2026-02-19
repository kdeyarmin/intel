import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Users, Building2, MapPin, Stethoscope } from 'lucide-react';

const TYPE_ICONS = {
  provider: Users,
  organization: Building2,
  location: MapPin,
  specialty: Stethoscope,
};

export default function TypeAheadSearch({
  value,
  onChange,
  suggestions = [],
  placeholder = 'Search...',
  onSuggestionSelect,
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  const filtered = useMemo(() => {
    if (!value || value.length < 2) return [];
    return suggestions.slice(0, 8);
  }, [value, suggestions]);

  useEffect(() => {
    setHighlightIdx(-1);
  }, [value]);

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleKeyDown = (e) => {
    if (!open || filtered.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx(prev => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && highlightIdx >= 0) {
      e.preventDefault();
      const item = filtered[highlightIdx];
      if (onSuggestionSelect) onSuggestionSelect(item);
      else onChange(item.text || item.label);
      setOpen(false);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 z-10" />
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => { if (filtered.length > 0) setOpen(true); }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="pl-9"
      />
      {open && filtered.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-64 overflow-auto">
          {filtered.map((item, idx) => {
            const Icon = TYPE_ICONS[item.type] || Search;
            return (
              <button
                key={idx}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
                  idx === highlightIdx ? 'bg-slate-100' : 'hover:bg-slate-50'
                }`}
                onMouseEnter={() => setHighlightIdx(idx)}
                onClick={() => {
                  if (onSuggestionSelect) onSuggestionSelect(item);
                  else onChange(item.text || item.label);
                  setOpen(false);
                }}
              >
                <Icon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-slate-800 truncate block">{item.label}</span>
                  {item.sublabel && <span className="text-[11px] text-slate-400 truncate block">{item.sublabel}</span>}
                </div>
                {item.badge && (
                  <Badge variant="outline" className="text-[10px] shrink-0">{item.badge}</Badge>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
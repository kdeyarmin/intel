import React from 'react';
import { BUSINESS_LINES } from '@/lib/businessLine';
import { useBusinessLine } from '@/lib/BusinessLineContext';

/** The business this account works in. All lines turns the filter off. */
export default function BusinessLineSelect({ compact = false }) {
  const { line, setLine, profile } = useBusinessLine();
  return (
    <label className={compact ? 'block px-2 pb-2 min-w-[14rem]' : 'block space-y-1'}>
      <span className={compact ? 'text-[10px] uppercase tracking-wide text-slate-500' : 'text-sm font-medium text-slate-200'}>
        {compact ? 'Business' : 'Your business'}
      </span>
      <select
        aria-label="Business line"
        value={line}
        onChange={(e) => setLine(e.target.value)}
        className={compact
          ? 'mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200'
          : 'mt-1 w-full max-w-xs rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100'}
      >
        {BUSINESS_LINES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
      {!compact && (
        <p className="text-xs text-slate-500 max-w-xl">
          {profile ? profile.blurb : 'Pick a line to open reports, facilities, the county, and call sheets on that business. All lines shows everything.'}
        </p>
      )}
    </label>
  );
}

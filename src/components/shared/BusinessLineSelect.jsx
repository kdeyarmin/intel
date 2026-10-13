import React from 'react';
import { BUSINESS_LINES } from '@/lib/businessLine';
import { useBusinessLine } from '@/lib/BusinessLineContext';

/** The business this account works in. All lines turns the filter off. */
export default function BusinessLineSelect({ compact = false }) {
  const { line, setLine, profile } = useBusinessLine();
  return (
    <label className={compact ? 'block px-4 pt-4 pb-2 min-w-[16rem]' : 'block space-y-1'}>
      <span className={compact ? 'text-[10px] font-semibold uppercase tracking-wider text-slate-400' : 'text-sm font-medium text-slate-200'}>
        {compact ? 'Care setting' : 'Your care setting'}
      </span>
      <select
        aria-label="Business line"
        value={line}
        onChange={(e) => setLine(e.target.value)}
        className={compact
          ? 'mt-2 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
          : 'mt-1 w-full max-w-xs rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100'}
      >
        {BUSINESS_LINES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
      {!compact && (
        <p className="text-xs text-slate-400 max-w-xl leading-relaxed">
          {profile ? profile.blurb : 'Select a care setting to tailor reports, facilities, county insights, and call sheets. Select All lines to view every setting.'}
        </p>
      )}
    </label>
  );
}

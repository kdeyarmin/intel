import React from 'react';
import { Info } from 'lucide-react';

/** What a network analysis covered: the scope, whether it was capped, and when it ran. */
export default function AnalysisScopeNote({ analysis }) {
  const scope = analysis?.scope;
  if (!scope) return null;
  return (
    <p className="flex items-start gap-1.5 text-xs text-slate-400">
      <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
      <span>
        {scope.label}
        {scope.truncated && ' (capped for speed, so totals are partial)'}
        {analysis.generated_at && ` · computed ${new Date(analysis.generated_at).toLocaleTimeString()}`}
      </span>
    </p>
  );
}

export function scopeHint(state, leadListName = null) {
  if (leadListName) return `Uses referral data for the providers on the lead list "${leadListName}".`;
  return state
    ? `Uses referral data for providers practicing in ${state}.`
    : 'Uses a nationwide sample of referral data. Pick a state or a lead list above for a complete picture.';
}

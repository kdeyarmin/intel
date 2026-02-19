import React from 'react';
import { Info } from 'lucide-react';

export default function DataSourcesFooter() {
  return (
    <div className="mt-8 pt-4 border-t border-slate-200">
      <div className="flex items-start gap-2 text-xs text-slate-500">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-400" />
        <p>
          <strong>Data Sources:</strong> All data is derived from publicly available CMS Medicare datasets and NPPES National Provider files. Insights are estimates based on public data patterns and do not represent confirmed referral relationships. Small cell counts (&lt;11) are suppressed for privacy compliance.
        </p>
      </div>
    </div>
  );
}
import React from 'react';
import { Button } from '@/components/ui/button';

export default function MarketDataState({ loading = false, error = false, title = 'Market data unavailable', onRetry }) {
  if (loading) return <p role="status" className="text-sm text-slate-400">Loading market data…</p>;
  return (
    <div role={error ? 'alert' : 'status'} className="rounded-lg border border-amber-500/30 bg-amber-900/20 p-4 space-y-2">
      <p className="text-sm font-medium text-amber-400">{title}</p>
      <p className="text-xs text-slate-300">{error
        ? 'The request could not be completed. Retry or choose another location. If this continues, contact your administrator.'
        : 'No usable data is available for this selection. Try another location or ask your administrator to check source imports and market rollups. Missing data does not mean zero activity.'}</p>
      {onRetry && <Button type="button" variant="outline" size="sm" onClick={onRetry}>Retry data</Button>}
    </div>
  );
}

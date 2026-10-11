import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Inline "this failed to load" state with a retry button. Use it instead of
 * letting a failed query fall back to `[]`, which renders as "No results" and
 * hides the failure.
 */
export default function QueryErrorState({ title = "Couldn't load this data", error, onRetry, className = '' }) {
  const detail = error?.message && error.message !== title ? error.message : null;
  return (
    <div
      role="alert"
      className={`flex flex-col items-center gap-3 rounded-lg border border-red-500/30 bg-red-900/20 px-4 py-6 text-center ${className}`}
    >
      <AlertTriangle className="h-6 w-6 text-red-400" />
      <div>
        <p className="text-sm font-medium text-red-300">{title}</p>
        {detail && <p className="mt-1 text-xs text-red-300/70">{detail}</p>}
      </div>
      {onRetry && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => onRetry()}
          className="border-red-500/30 bg-transparent text-red-300 hover:bg-red-900/30"
        >
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Try again
        </Button>
      )}
    </div>
  );
}

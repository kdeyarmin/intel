import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Check, X, RotateCcw, Loader2 } from 'lucide-react';

export default function BulkActionsBar({ selectedCount, onBulkAction, onClearSelection }) {
  const [loading, setLoading] = useState(null);

  const handleAction = async (status) => {
    setLoading(status);
    await onBulkAction(status);
    setLoading(null);
  };

  if (selectedCount === 0) return null;

  return (
    <div className="sticky top-0 z-10 bg-blue-600 text-white rounded-lg px-4 py-3 mb-4 flex items-center justify-between shadow-lg">
      <span className="text-sm font-medium">{selectedCount} match{selectedCount !== 1 ? 'es' : ''} selected</span>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          className="bg-green-500 hover:bg-green-600 text-white border-0"
          onClick={() => handleAction('approved')}
          disabled={!!loading}
        >
          {loading === 'approved' ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Check className="w-3 h-3 mr-1" />}
          Approve All
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="bg-red-500 hover:bg-red-600 text-white border-0"
          onClick={() => handleAction('rejected')}
          disabled={!!loading}
        >
          {loading === 'rejected' ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <X className="w-3 h-3 mr-1" />}
          Reject All
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="bg-yellow-500 hover:bg-yellow-600 text-white border-0"
          onClick={() => handleAction('suggested')}
          disabled={!!loading}
        >
          {loading === 'suggested' ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RotateCcw className="w-3 h-3 mr-1" />}
          Reset All
        </Button>
        <div className="w-px h-6 bg-white/30 mx-1" />
        <Button size="sm" variant="ghost" className="text-white hover:bg-white/20" onClick={onClearSelection}>
          Clear
        </Button>
      </div>
    </div>
  );
}
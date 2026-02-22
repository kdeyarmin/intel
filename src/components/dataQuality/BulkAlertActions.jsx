import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, XCircle, Sparkles, Loader2 } from 'lucide-react';

export default function BulkAlertActions({ selectedIds = [], alerts = [], onClear }) {
  const queryClient = useQueryClient();
  const [processing, setProcessing] = useState(false);

  const selectedAlerts = alerts.filter(a => selectedIds.includes(a.id));
  const withSuggestions = selectedAlerts.filter(a => a.suggested_value);

  const bulkAction = async (action) => {
    setProcessing(true);
    for (const id of selectedIds) {
      const alert = alerts.find(a => a.id === id);
      if (!alert) continue;
      const base = { title: alert.title, alert_type: alert.alert_type, severity: alert.severity, status: alert.status };
      if (action === 'dismiss') {
        await base44.entities.DataQualityAlert.update(id, { ...base, status: 'closed' });
      } else if (action === 'apply_fix') {
        await base44.entities.DataQualityAlert.update(id, { ...base, status: 'resolved', resolved_at: new Date().toISOString() });
      }
    }
    queryClient.invalidateQueries({ queryKey: ['dqAlerts'] });
    setProcessing(false);
    onClear();
  };

  if (selectedIds.length === 0) return null;

  return (
    <div className="flex items-center gap-3 p-3 bg-slate-100 border rounded-lg">
      <Badge variant="outline" className="text-xs">{selectedIds.length} selected</Badge>
      <div className="flex gap-2 ml-auto">
        {withSuggestions.length > 0 && (
          <Button
            size="sm"
            disabled={processing}
            onClick={() => bulkAction('apply_fix')}
            className="bg-green-600 hover:bg-green-700 text-xs h-7 gap-1"
          >
            {processing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            Apply {withSuggestions.length} Fix{withSuggestions.length > 1 ? 'es' : ''}
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={processing}
          onClick={() => bulkAction('dismiss')}
          className="text-xs h-7 gap-1"
        >
          {processing ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
          Dismiss All
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onClear}
          className="text-xs h-7"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
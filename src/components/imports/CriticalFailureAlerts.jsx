import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, XCircle, Clock, ChevronRight, Trash2, Loader2, X } from 'lucide-react';
import { categorizeError, ERROR_CATEGORIES } from './errorCategories';
import { base44 } from '@/api/base44Client';
import { IMPORT_TYPE_LABELS } from '@/constants/importTypes';

export default function CriticalFailureAlerts({ batches, onViewErrors, onRefresh }) {
  const [isDismissing, setIsDismissing] = useState(false);
  const [dismissingId, setDismissingId] = useState(null);

  const criticalBatches = useMemo(() => {
    const now = new Date();
    const last48h = new Date(now - 48 * 60 * 60 * 1000);
    return batches
      .filter(b => b.status === 'failed' && new Date(b.created_date) >= last48h)
      .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))
      .slice(0, 5);
  }, [batches]);

  if (criticalBatches.length === 0) return null;

  const formatTimeAgo = (date) => {
    const ms = Date.now() - new Date(date).getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const handleDismissOne = async (e, batchId) => {
    e.stopPropagation();
    setDismissingId(batchId);
    try {
      await base44.entities.ImportBatch.delete(batchId);
      onRefresh?.();
    } catch (err) {
      console.error('Failed to dismiss alert:', err);
    } finally {
      setDismissingId(null);
    }
  };

  const handleDismissAll = async () => {
    setIsDismissing(true);
    try {
      for (const batch of criticalBatches) {
        await base44.entities.ImportBatch.delete(batch.id);
      }
      onRefresh?.();
    } catch (err) {
      console.error('Failed to dismiss all alerts:', err);
    } finally {
      setIsDismissing(false);
    }
  };

  return (
    <Card className="border-red-500/30 bg-red-500/5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2 text-red-400">
            <AlertTriangle className="w-5 h-5" />
            Critical Import Failures ({criticalBatches.length})
            <Badge className="bg-red-500/20 text-red-300 text-[10px] ml-2">Last 48h</Badge>
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDismissAll}
            disabled={isDismissing}
            className="h-7 text-[11px] bg-transparent border-red-800/50 text-red-400 hover:bg-red-900/30 hover:text-red-300"
          >
            {isDismissing ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <Trash2 className="w-3 h-3 mr-1.5" />}
            {isDismissing ? 'Clearing...' : 'Clear All'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {criticalBatches.map(batch => {
            const topError = batch.error_samples?.[0];
            const topErrorMsg = topError?.message || topError?.detail || null;
            const errorCat = topErrorMsg ? categorizeError(topErrorMsg) : 'other';
            const errorConfig = ERROR_CATEGORIES[errorCat];

            return (
              <div
                key={batch.id}
                className="flex items-center gap-3 bg-slate-800/60 border border-red-500/15 rounded-lg p-3 hover:bg-slate-800/80 transition-colors cursor-pointer group"
                onClick={() => onViewErrors?.(batch)}
              >
                <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-slate-200">
                      {IMPORT_TYPE_LABELS[batch.import_type] || batch.import_type}
                    </span>
                    <Badge className={`${errorConfig.badgeColor} text-[9px]`}>{errorConfig.label}</Badge>
                  </div>
                  <p className="text-[11px] text-slate-400 truncate">
                    {topErrorMsg || batch.cancel_reason || 'Failed before processing'}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[10px] text-slate-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatTimeAgo(batch.created_date)}
                  </span>
                  {batch.error_samples?.length > 0 && (
                    <Badge className="bg-red-500/15 text-red-400 text-[9px]">
                      {batch.error_samples.length} error{batch.error_samples.length !== 1 ? 's' : ''}
                    </Badge>
                  )}
                  <button
                    onClick={(e) => handleDismissOne(e, batch.id)}
                    disabled={dismissingId === batch.id}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-500/20 text-slate-500 hover:text-red-400"
                    title="Dismiss this alert"
                  >
                    {dismissingId === batch.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <X className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

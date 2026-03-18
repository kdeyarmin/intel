import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Layers, RotateCcw, CheckCircle2, Loader2, ChevronDown, ChevronRight
} from 'lucide-react';
import { toast } from 'sonner';
import { categorizeError, ERROR_CATEGORIES, getErrorMessage, groupErrors } from './errorCategories';

const IMPORT_TYPE_LABELS = {
  'nppes_monthly': 'NPPES Monthly', 'nppes_registry': 'NPPES Registry',
  'cms_utilization': 'CMS Utilization', 'cms_part_d': 'CMS Part D',
  'medicare_hha_stats': 'Medicare HHA Stats', 'medicare_ma_inpatient': 'Medicare MA Inpatient',
  'medicare_part_d_stats': 'Medicare Part D Stats', 'medicare_snf_stats': 'Medicare SNF Stats',
};

export default function CrossBatchErrorResolver({ batches, onActionComplete }) {
  const [selectedBatches, setSelectedBatches] = useState(new Set());
  const [selectedAction, setSelectedAction] = useState(null);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Only show failed batches with errors
  const failedBatches = useMemo(() =>
    (batches || []).filter(b => b.status === 'failed' && b.error_samples?.length > 0),
    [batches]
  );

  // Cross-batch error analysis
  const crossBatchAnalysis = useMemo(() => {
    const categoryMap = {};
    for (const batch of failedBatches) {
      for (const err of (batch.error_samples || [])) {
        const msg = getErrorMessage(err);
        const cat = categorizeError(msg);
        if (!categoryMap[cat]) categoryMap[cat] = { batches: new Set(), count: 0 };
        categoryMap[cat].batches.add(batch.id);
        categoryMap[cat].count++;
      }
    }
    return Object.entries(categoryMap)
      .map(([cat, info]) => ({
        category: cat,
        config: ERROR_CATEGORIES[cat],
        batchCount: info.batches.size,
        errorCount: info.count,
        batchIds: Array.from(info.batches),
      }))
      .sort((a, b) => b.errorCount - a.errorCount);
  }, [failedBatches]);

  const toggleBatch = (id) => {
    setSelectedBatches(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAllFailed = () => {
    if (selectedBatches.size === failedBatches.length) {
      setSelectedBatches(new Set());
    } else {
      setSelectedBatches(new Set(failedBatches.map(b => b.id)));
    }
  };

  const handleBulkRetryBatches = async () => {
    if (selectedBatches.size === 0) return;
    setActionInProgress(true);
    let successCount = 0;

    for (const batchId of selectedBatches) {
      const batch = failedBatches.find(b => b.id === batchId);
      if (!batch) continue;
      try {
        await base44.functions.invoke('triggerImport', {
          import_type: batch.import_type,
          file_url: batch.file_url || undefined,
          dry_run: false,
          year: batch.data_year || undefined,
          retry_of: batch.id,
          retry_count: (batch.retry_count || 0) + 1,
          retry_tags: [...new Set([...(batch.tags || []), 'retry', 'cross-batch-retry'])],
          category: batch.category || undefined,
        });
        successCount++;
      } catch (e) {
        console.warn('Cross-batch retry failed:', batch.import_type, e.message);
      }
    }

    toast.success(`Retried ${successCount} of ${selectedBatches.size} batches`);
    setSelectedBatches(new Set());
    setActionInProgress(false);
    onActionComplete?.();
  };

  const handleBulkDismissBatches = async () => {
    if (selectedBatches.size === 0) return;
    setActionInProgress(true);

    for (const batchId of selectedBatches) {
      const batch = failedBatches.find(b => b.id === batchId);
      if (!batch) continue;
      const updatedErrors = (batch.error_samples || []).map(err => ({
        ...err, bulk_action: 'dismissed', dismissed_at: new Date().toISOString()
      }));
      await base44.entities.ImportBatch.update(batch.id, {
        error_samples: updatedErrors,
        tags: [...new Set([...(batch.tags || []), 'errors-triaged'])],
      });
    }

    toast.success(`Dismissed errors in ${selectedBatches.size} batches`);
    setSelectedBatches(new Set());
    setActionInProgress(false);
    onActionComplete?.();
  };

  if (failedBatches.length === 0) return null;

  return (
    <Card className="bg-[#141d30] border-slate-700/50">
      <CardContent className="py-3 px-4 space-y-3">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center gap-2 text-left"
        >
          <Layers className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-semibold text-slate-200">Cross-Batch Error Resolution</span>
          <Badge className="bg-red-500/15 text-red-400 text-[10px]">
            {failedBatches.length} failed
          </Badge>
          <Badge className="bg-slate-700/50 text-slate-400 text-[10px]">
            {crossBatchAnalysis.reduce((s, c) => s + c.errorCount, 0)} total errors
          </Badge>
          <div className="ml-auto">
            {expanded ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
          </div>
        </button>

        {expanded && (
          <div className="space-y-3">
            {/* Common error patterns across batches */}
            {crossBatchAnalysis.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-slate-500">Common Errors Across Batches</p>
                <div className="flex flex-wrap gap-1.5">
                  {crossBatchAnalysis.slice(0, 6).map(item => (
                    <div key={item.category} className="flex items-center gap-1.5 bg-slate-800/50 rounded-md px-2 py-1 border border-slate-700/30">
                      <Badge className={`${item.config.badgeColor} text-[8px]`}>{item.config.label}</Badge>
                      <span className="text-[10px] text-slate-400">{item.errorCount} in {item.batchCount} batch{item.batchCount !== 1 ? 'es' : ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Batch selection */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[10px] text-slate-400 hover:text-slate-200 px-1.5"
                onClick={selectAllFailed}
              >
                {selectedBatches.size === failedBatches.length ? 'Deselect All' : `Select All ${failedBatches.length} Failed`}
              </Button>
              {selectedBatches.size > 0 && (
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    className="h-7 text-xs bg-cyan-600 hover:bg-cyan-700 text-white gap-1"
                    onClick={handleBulkRetryBatches}
                    disabled={actionInProgress}
                  >
                    {actionInProgress ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                    Retry {selectedBatches.size} Batches
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs bg-transparent border-slate-600 text-slate-400 hover:bg-slate-700/50 gap-1"
                    onClick={handleBulkDismissBatches}
                    disabled={actionInProgress}
                  >
                    {actionInProgress ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                    Dismiss All Errors
                  </Button>
                </div>
              )}
            </div>

            <ScrollArea className="max-h-[300px]">
              <div className="space-y-1.5">
                {failedBatches.map(batch => {
                  const { sortedCategories: cats } = groupErrors(batch.error_samples || []);
                  const isSelected = selectedBatches.has(batch.id);
                  return (
                    <div
                      key={batch.id}
                      className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                        isSelected ? 'bg-cyan-500/5 border-cyan-500/30' : 'bg-slate-800/30 border-slate-700/30 hover:bg-slate-700/20'
                      }`}
                      onClick={() => toggleBatch(batch.id)}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleBatch(batch.id)}
                        className="border-slate-600 data-[state=checked]:bg-cyan-600 data-[state=checked]:border-cyan-600"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium text-slate-300">
                            {IMPORT_TYPE_LABELS[batch.import_type] || batch.import_type}
                          </span>
                          <span className="text-[10px] text-slate-500 truncate">{batch.file_name}</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <Badge className="bg-red-500/15 text-red-400 text-[8px]">
                            {(batch.error_samples || []).length} errors
                          </Badge>
                          {cats.slice(0, 3).map(cat => (
                            <Badge key={cat} className={`${ERROR_CATEGORIES[cat]?.badgeColor} text-[8px]`}>
                              {ERROR_CATEGORIES[cat]?.label}
                            </Badge>
                          ))}
                          {cats.length > 3 && (
                            <span className="text-[9px] text-slate-500">+{cats.length - 3} more</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  RotateCcw, SkipForward, CheckCircle2, Loader2, Layers, ChevronDown, ChevronRight, X
} from 'lucide-react';
import { toast } from 'sonner';
import { categorizeError, ERROR_CATEGORIES, getErrorMessage, groupErrors } from './errorCategories';

export default function BulkErrorActions({ errors, batch, onActionComplete }) {
  const [selectedCategories, setSelectedCategories] = useState(new Set());
  const [actionInProgress, setActionInProgress] = useState(null);
  const [showPanel, setShowPanel] = useState(false);

  const { grouped, sortedCategories, totalErrors } = useMemo(() => groupErrors(errors), [errors]);

  const toggleCategory = (cat) => {
    setSelectedCategories(prev => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedCategories.size === sortedCategories.length) {
      setSelectedCategories(new Set());
    } else {
      setSelectedCategories(new Set(sortedCategories));
    }
  };

  const selectedErrorCount = useMemo(() => {
    let count = 0;
    for (const cat of selectedCategories) {
      count += (grouped[cat]?.length || 0);
    }
    return count;
  }, [selectedCategories, grouped]);

  // Determine which categories contain retryable errors
  const retryableCategories = useMemo(() => {
    const retryable = new Set();
    const retryableKeywords = ['rate limit', '429', 'timeout', 'timed out', 'network', 'fetch', 'connection', 'chunk', 'bulk', 'stall'];
    for (const cat of sortedCategories) {
      const catErrors = grouped[cat] || [];
      const hasRetryable = catErrors.some(e => {
        const msg = getErrorMessage(e).toLowerCase();
        return retryableKeywords.some(kw => msg.includes(kw));
      });
      if (hasRetryable) retryable.add(cat);
    }
    return retryable;
  }, [grouped, sortedCategories]);

  const handleBulkRetry = async () => {
    if (!batch || selectedCategories.size === 0) return;
    setActionInProgress('retry');

    // Get rows affected by selected categories
    const retryableErrors = [];
    for (const cat of selectedCategories) {
      retryableErrors.push(...(grouped[cat] || []));
    }

    // Find row ranges to retry
    const rows = retryableErrors.map(e => e.row || e.row_index || e.chunk_start).filter(Boolean).sort((a, b) => a - b);
    const minRow = rows.length > 0 ? Math.min(...rows) : 0;
    const maxRow = rows.length > 0 ? Math.max(...rows) : undefined;

    try {
      await base44.functions.invoke('triggerImport', {
        import_type: batch.import_type,
        file_url: batch.file_url || undefined,
        dry_run: false,
        year: batch.data_year || undefined,
        retry_of: batch.id,
        retry_count: (batch.retry_count || 0) + 1,
        retry_tags: [...new Set([...(batch.tags || []), 'retry', 'bulk-error-retry'])],
        category: batch.category || undefined,
        row_offset: minRow > 0 ? minRow - 1 : undefined,
        row_limit: maxRow ? (maxRow - minRow + 100) : undefined,
      });

      await base44.entities.AuditEvent.create({
        event_type: 'import',
        user_email: (await base44.auth.me()).email,
        details: {
          action: 'Bulk error retry',
          entity: batch.import_type,
          message: `Retried ${retryableErrors.length} errors across ${selectedCategories.size} categories`,
          batch_id: batch.id,
          categories: Array.from(selectedCategories),
        },
        timestamp: new Date().toISOString(),
      });

      toast.success(`Retry started for ${retryableErrors.length} errors`);
      onActionComplete?.('retry', Array.from(selectedCategories));
    } catch (e) {
      toast.error(`Retry failed: ${e.message}`);
    }
    setActionInProgress(null);
  };

  const handleBulkSkip = async () => {
    if (!batch || selectedCategories.size === 0) return;
    setActionInProgress('skip');

    // Mark selected errors as acknowledged/skipped by updating the batch
    const updatedErrors = (batch.error_samples || []).map(err => {
      const msg = getErrorMessage(err);
      const cat = categorizeError(msg);
      if (selectedCategories.has(cat)) {
        return { ...err, bulk_action: 'skipped', skipped_at: new Date().toISOString() };
      }
      return err;
    });

    await base44.entities.ImportBatch.update(batch.id, {
      error_samples: updatedErrors,
      tags: [...new Set([...(batch.tags || []), 'errors-triaged'])],
    });

    await base44.entities.AuditEvent.create({
      event_type: 'user_action',
      user_email: (await base44.auth.me()).email,
      details: {
        action: 'Bulk skip errors',
        entity: batch.import_type,
        message: `Skipped ${selectedErrorCount} errors in ${selectedCategories.size} categories`,
        batch_id: batch.id,
        categories: Array.from(selectedCategories),
      },
      timestamp: new Date().toISOString(),
    });

    toast.success(`${selectedErrorCount} errors marked as skipped`);
    setSelectedCategories(new Set());
    setActionInProgress(null);
    onActionComplete?.('skip', Array.from(selectedCategories));
  };

  const handleBulkDismiss = async () => {
    if (!batch || selectedCategories.size === 0) return;
    setActionInProgress('dismiss');

    const updatedErrors = (batch.error_samples || []).map(err => {
      const msg = getErrorMessage(err);
      const cat = categorizeError(msg);
      if (selectedCategories.has(cat)) {
        return { ...err, bulk_action: 'dismissed', dismissed_at: new Date().toISOString() };
      }
      return err;
    });

    await base44.entities.ImportBatch.update(batch.id, {
      error_samples: updatedErrors,
      tags: [...new Set([...(batch.tags || []), 'errors-triaged'])],
    });

    toast.success(`${selectedErrorCount} errors dismissed`);
    setSelectedCategories(new Set());
    setActionInProgress(null);
    onActionComplete?.('dismiss', Array.from(selectedCategories));
  };

  // Handle action from AI triage
  const _handleTriageAction = (action, categoryLabel, catKey) => {
    if (catKey) {
      setSelectedCategories(new Set([catKey]));
      setShowPanel(true);
    }
    if (action === 'retry') handleBulkRetry();
    else if (action === 'skip') handleBulkSkip();
    else if (action === 'ignore') handleBulkDismiss();
  };

  if (!errors?.length || totalErrors === 0) return null;

  return (
    <div className="space-y-2">
      {/* Toggle bar */}
      <button
        onClick={() => setShowPanel(!showPanel)}
        className="w-full flex items-center gap-2 p-2.5 rounded-lg bg-slate-800/30 border border-slate-700/40 hover:bg-slate-700/20 transition-colors text-left"
      >
        <Layers className="w-4 h-4 text-cyan-400" />
        <span className="text-xs font-semibold text-slate-300">Bulk Error Actions</span>
        <Badge className="bg-slate-700/50 text-slate-400 text-[9px]">{totalErrors} errors</Badge>
        {selectedCategories.size > 0 && (
          <Badge className="bg-cyan-500/15 text-cyan-400 text-[9px]">{selectedErrorCount} selected</Badge>
        )}
        <div className="ml-auto">
          {showPanel ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
        </div>
      </button>

      {showPanel && (
        <Card className="bg-[#141d30] border-slate-700/50">
          <CardContent className="py-3 px-4 space-y-3">
            {/* Selection header */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px] text-slate-400 hover:text-slate-200 px-1.5"
                  onClick={selectAll}
                >
                  {selectedCategories.size === sortedCategories.length ? 'Deselect All' : 'Select All'}
                </Button>
                {selectedCategories.size > 0 && (
                  <span className="text-[10px] text-slate-500">
                    {selectedErrorCount} errors across {selectedCategories.size} categories
                  </span>
                )}
              </div>

              {/* Action buttons */}
              {selectedCategories.size > 0 && (
                <div className="flex items-center gap-1.5">
                  {/* Show retry only if some selected categories are retryable */}
                  {Array.from(selectedCategories).some(c => retryableCategories.has(c)) && (
                    <Button
                      size="sm"
                      className="h-7 text-xs bg-cyan-600 hover:bg-cyan-700 text-white gap-1"
                      onClick={handleBulkRetry}
                      disabled={!!actionInProgress}
                    >
                      {actionInProgress === 'retry' ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                      Retry Selected
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs bg-transparent border-amber-500/30 text-amber-400 hover:bg-amber-500/10 gap-1"
                    onClick={handleBulkSkip}
                    disabled={!!actionInProgress}
                  >
                    {actionInProgress === 'skip' ? <Loader2 className="w-3 h-3 animate-spin" /> : <SkipForward className="w-3 h-3" />}
                    Skip Selected
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs bg-transparent border-slate-600 text-slate-400 hover:bg-slate-700/50 gap-1"
                    onClick={handleBulkDismiss}
                    disabled={!!actionInProgress}
                  >
                    {actionInProgress === 'dismiss' ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                    Dismiss
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-slate-500 hover:text-slate-300"
                    onClick={() => setSelectedCategories(new Set())}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              )}
            </div>

            {/* Category checkboxes */}
            <ScrollArea className="max-h-[250px]">
              <div className="space-y-1.5">
                {sortedCategories.map(cat => {
                  const config = ERROR_CATEGORIES[cat];
                  const count = grouped[cat]?.length || 0;
                  const isRetryable = retryableCategories.has(cat);
                  const isSelected = selectedCategories.has(cat);

                  // Count how many in this category were already actioned
                  const actionedCount = (grouped[cat] || []).filter(e => e.bulk_action).length;

                  return (
                    <div
                      key={cat}
                      className={`flex items-center gap-2.5 p-2 rounded-lg border transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-cyan-500/5 border-cyan-500/30'
                          : 'bg-slate-800/30 border-slate-700/30 hover:bg-slate-700/20'
                      }`}
                      onClick={() => toggleCategory(cat)}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleCategory(cat)}
                        className="border-slate-600 data-[state=checked]:bg-cyan-600 data-[state=checked]:border-cyan-600"
                      />
                      <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                        <Badge className={`${config.badgeColor} text-[9px]`}>{config.label}</Badge>
                        <span className="text-xs text-slate-400">{count} error{count !== 1 ? 's' : ''}</span>
                        {isRetryable && (
                          <Badge className="bg-cyan-500/10 text-cyan-400 text-[8px]">Retryable</Badge>
                        )}
                        {actionedCount > 0 && (
                          <Badge className="bg-emerald-500/10 text-emerald-400 text-[8px]">
                            {actionedCount} resolved
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
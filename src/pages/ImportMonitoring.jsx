import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { 
  Activity, CheckCircle2, XCircle, Clock, AlertCircle,
  FileText, TrendingUp, Loader2, Search, Tag, Pause, RefreshCw
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import BatchTagManager from '../components/imports/BatchTagManager';
import BatchCategorySelector from '../components/imports/BatchCategorySelector';
import BatchActionButtons from '../components/imports/BatchActionButtons';
import RetryBatchDialog from '../components/imports/RetryBatchDialog';
import ErrorCategoryDisplay from '../components/imports/ErrorCategoryDisplay';

const CATEGORY_LABELS = {
  nppes: 'NPPES',
  cms_claims: 'CMS Claims',
  cms_enrollment: 'CMS Enrollment',
  cms_statistics: 'CMS Statistics',
  provider_data: 'Provider Data',
  other: 'Other',
};

const IMPORT_TYPE_LABELS = {
  'nppes_monthly': 'NPPES Monthly',
  'nppes_registry': 'NPPES Registry',
  'cms_utilization': 'CMS Utilization',
  'cms_part_d': 'CMS Part D',
  'cms_order_referring': 'Order & Referring',
  'pa_home_health': 'PA Home Health',
  'hospice_providers': 'Hospice Providers',
  'nursing_home_chains': 'Nursing Home Chains',
  'hospice_enrollments': 'Hospice Enrollments',
  'home_health_enrollments': 'Home Health Enrollments',
  'home_health_cost_reports': 'Home Health Cost Reports',
  'cms_service_utilization': 'Service Utilization',
  'provider_service_utilization': 'Provider Service Utilization',
  'home_health_pdgm': 'Home Health PDGM',
  'inpatient_drg': 'Inpatient DRG',
  'provider_ownership': 'Provider Ownership',
  'opt_out_physicians': 'Opt-Out Physicians',
  'medicare_hha_stats': 'Medicare HHA Stats',
  'medicare_ma_inpatient': 'Medicare MA Inpatient',
  'medicare_part_d_stats': 'Medicare Part D Stats',
  'medicare_snf_stats': 'Medicare SNF Stats',
};

export default function ImportMonitoring() {
  const [showOnlyLatest, setShowOnlyLatest] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [retryBatch, setRetryBatch] = useState(null);
  const queryClient = useQueryClient();

  const { data: batches = [], isLoading } = useQuery({
    queryKey: ['importMonitoringBatches'],
    queryFn: () => base44.entities.ImportBatch.list('-created_date', 100),
    refetchInterval: 30000,
  });

  const refreshBatches = () => queryClient.invalidateQueries({ queryKey: ['importMonitoringBatches'] });

  // Collect all unique tags
  const allTags = useMemo(() => {
    const tags = new Set();
    batches.forEach(b => (b.tags || []).forEach(t => tags.add(t)));
    return Array.from(tags).sort();
  }, [batches]);

  const STALE_THRESHOLD_MS = 15 * 60 * 1000;
  const isStale = (batch) => {
    if (batch.status !== 'processing' && batch.status !== 'validating') return false;
    const updated = new Date(batch.updated_date || batch.created_date);
    return (Date.now() - updated.getTime()) > STALE_THRESHOLD_MS;
  };

  const runningBatches = batches.filter(b => (b.status === 'processing' || b.status === 'validating') && !isStale(b));
  const staleBatches = batches.filter(b => isStale(b));
  const completedBatches = batches.filter(b => b.status === 'completed');
  const failedBatches = batches.filter(b => b.status === 'failed');
  const pausedBatches = batches.filter(b => b.status === 'paused');

  const displayBatches = useMemo(() => {
    let filtered = batches;

    // Status filter
    if (statusFilter !== 'all') {
      if (statusFilter === 'active') {
        filtered = filtered.filter(b => b.status === 'processing' || b.status === 'validating');
      } else {
        filtered = filtered.filter(b => b.status === statusFilter);
      }
    }

    // Category filter
    if (categoryFilter !== 'all') {
      filtered = filtered.filter(b => b.category === categoryFilter);
    }

    // Tag filter
    if (tagFilter) {
      filtered = filtered.filter(b => (b.tags || []).includes(tagFilter));
    }

    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(b =>
        (b.import_type || '').toLowerCase().includes(q) ||
        (b.file_name || '').toLowerCase().includes(q) ||
        (IMPORT_TYPE_LABELS[b.import_type] || '').toLowerCase().includes(q)
      );
    }

    // Dedup latest per source
    if (showOnlyLatest) {
      const seen = new Map();
      for (const b of filtered) {
        const key = `${b.import_type}_${b.file_name}`;
        if (!seen.has(key) || new Date(b.created_date) > new Date(seen.get(key).created_date)) {
          seen.set(key, b);
        }
      }
      return Array.from(seen.values());
    }
    return filtered;
  }, [batches, statusFilter, categoryFilter, tagFilter, searchQuery, showOnlyLatest]);

  const getStatusIcon = (status) => {
    switch (status) {
      case 'processing':
      case 'validating':
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'completed':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'paused':
        return <Pause className="w-5 h-5 text-amber-500" />;
      case 'cancelled':
        return <XCircle className="w-5 h-5 text-gray-400" />;
      default:
        return <Clock className="w-5 h-5 text-gray-400" />;
    }
  };

  const statusColors = {
    processing: 'bg-blue-100 text-blue-800',
    validating: 'bg-yellow-100 text-yellow-800',
    completed: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
    paused: 'bg-amber-100 text-amber-800',
    cancelled: 'bg-gray-100 text-gray-600',
  };

  const getProgress = (batch) => {
    if (batch.status === 'completed') return 100;
    if (batch.status === 'failed' || batch.status === 'cancelled') return 0;
    if (batch.status === 'paused') return 35;
    if (batch.status === 'processing') return 50;
    if (batch.status === 'validating') return 25;
    return 0;
  };

  const formatTimestamp = (ts) => ts ? new Date(ts).toLocaleString() : 'N/A';

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Import Monitoring</h1>
          <p className="text-gray-600 mt-1">Manage, tag, and retry import jobs</p>
        </div>
        <Button
          onClick={async () => { setIsRefreshing(true); await refreshBatches(); setIsRefreshing(false); }}
          variant="outline"
          disabled={isRefreshing}
        >
          {isRefreshing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Activity className="w-4 h-4 mr-2" />}
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="cursor-pointer hover:border-blue-300" onClick={() => setStatusFilter('active')}>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">Active</p>
                <p className="text-2xl font-bold">{runningBatches.length}</p>
              </div>
              <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-amber-300" onClick={() => setStatusFilter('paused')}>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">Paused</p>
                <p className="text-2xl font-bold text-amber-600">{pausedBatches.length}</p>
              </div>
              <Pause className="w-6 h-6 text-amber-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-green-300" onClick={() => setStatusFilter('completed')}>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">Completed</p>
                <p className="text-2xl font-bold text-green-600">{completedBatches.length}</p>
              </div>
              <CheckCircle2 className="w-6 h-6 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-red-300" onClick={() => setStatusFilter('failed')}>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">Failed</p>
                <p className="text-2xl font-bold text-red-600">{failedBatches.length}</p>
              </div>
              <XCircle className="w-6 h-6 text-red-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-teal-300" onClick={() => setStatusFilter('all')}>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">Total</p>
                <p className="text-2xl font-bold">{batches.length}</p>
              </div>
              <TrendingUp className="w-6 h-6 text-teal-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stale Jobs Warning */}
      {staleBatches.length > 0 && (
        <Card className="border-amber-300 bg-amber-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-amber-800">
              <AlertCircle className="w-5 h-5" />
              {staleBatches.length} Stalled Job{staleBatches.length !== 1 ? 's' : ''} Detected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-amber-700 mb-3">
              These jobs haven't updated in over 15 minutes and are likely stalled.
            </p>
            <div className="space-y-2">
              {staleBatches.map(batch => (
                <div key={batch.id} className="flex items-center justify-between bg-white border border-amber-200 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-500" />
                    <span className="text-sm font-medium">{IMPORT_TYPE_LABELS[batch.import_type] || batch.import_type}</span>
                    <span className="text-xs text-gray-500">{batch.file_name}</span>
                  </div>
                  <Button
                    size="sm" variant="outline"
                    className="text-red-600 border-red-300 hover:bg-red-50"
                    onClick={async () => {
                      await base44.entities.ImportBatch.update(batch.id, {
                        status: 'failed',
                        error_samples: [{ row: 0, message: 'Manually marked as failed — job was stalled' }]
                      });
                      refreshBatches();
                    }}
                  >
                    <XCircle className="w-3 h-3 mr-1" /> Mark Failed
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle>Import Jobs</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search..."
                  className="h-8 w-40 pl-7 text-xs"
                />
              </div>
              <select
                className="text-xs border rounded-md px-2 py-1.5 bg-white h-8"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <select
                className="text-xs border rounded-md px-2 py-1.5 bg-white h-8"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="all">All Categories</option>
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              {allTags.length > 0 && (
                <select
                  className="text-xs border rounded-md px-2 py-1.5 bg-white h-8"
                  value={tagFilter}
                  onChange={(e) => setTagFilter(e.target.value)}
                >
                  <option value="">All Tags</option>
                  {allTags.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              )}
              <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showOnlyLatest}
                  onChange={(e) => setShowOnlyLatest(e.target.checked)}
                  className="rounded"
                />
                Latest only
              </label>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-12 text-gray-500">
              <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin" />
              <p>Loading import jobs...</p>
            </div>
          ) : displayBatches.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="font-medium">No import jobs match filters</p>
              <p className="text-sm mt-1">Try adjusting your filters or start a new import</p>
            </div>
          ) : (
            <div className="space-y-4">
              {displayBatches.map((batch) => (
                <div key={batch.id} className="p-4 border rounded-lg hover:bg-gray-50/50 transition-colors">
                  {/* Row 1: Title, status, actions */}
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(batch.status)}
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-gray-900">
                            {IMPORT_TYPE_LABELS[batch.import_type] || batch.import_type}
                          </h3>
                          {batch.retry_of && (
                            <Badge variant="outline" className="text-xs gap-1">
                              <RefreshCw className="w-3 h-3" /> Retry #{batch.retry_count || 1}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-500">{batch.file_name}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={statusColors[batch.status] || ''}>{batch.status}</Badge>
                      <BatchActionButtons
                        batch={batch}
                        onAction={refreshBatches}
                        onRetryClick={() => setRetryBatch(batch)}
                      />
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" className="h-7 text-xs">Details</Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>Import Job Details</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 mt-4">
                            <div className="grid grid-cols-2 gap-3 text-sm">
                              <div><span className="text-gray-600">Import Type:</span><p className="font-medium">{IMPORT_TYPE_LABELS[batch.import_type] || batch.import_type}</p></div>
                              <div><span className="text-gray-600">Status:</span><p className="font-medium">{batch.status}</p></div>
                              <div><span className="text-gray-600">Created:</span><p className="font-medium">{formatTimestamp(batch.created_date)}</p></div>
                              <div><span className="text-gray-600">Completed:</span><p className="font-medium">{formatTimestamp(batch.completed_at)}</p></div>
                              {batch.retry_of && <div><span className="text-gray-600">Retry Of:</span><p className="font-medium text-xs font-mono">{batch.retry_of}</p></div>}
                              {batch.cancel_reason && <div className="col-span-2"><span className="text-gray-600">Cancel Reason:</span><p className="font-medium text-red-600">{batch.cancel_reason}</p></div>}
                            </div>
                            <div className="grid grid-cols-3 gap-3 text-sm">
                              <div><span className="text-gray-600">Total:</span><p className="font-medium">{batch.total_rows?.toLocaleString() || 0}</p></div>
                              <div><span className="text-gray-600">Valid:</span><p className="font-medium text-green-600">{batch.valid_rows?.toLocaleString() || 0}</p></div>
                              <div><span className="text-gray-600">Invalid:</span><p className="font-medium text-red-600">{batch.invalid_rows?.toLocaleString() || 0}</p></div>
                              <div><span className="text-gray-600">Duplicates:</span><p className="font-medium text-yellow-600">{batch.duplicate_rows?.toLocaleString() || 0}</p></div>
                              <div><span className="text-gray-600">Imported:</span><p className="font-medium text-blue-600">{batch.imported_rows?.toLocaleString() || 0}</p></div>
                              <div><span className="text-gray-600">Updated:</span><p className="font-medium text-purple-600">{batch.updated_rows?.toLocaleString() || 0}</p></div>
                            </div>
                            {batch.retry_params && (
                              <div>
                                <h4 className="font-semibold mb-2 text-sm">Retry Parameters</h4>
                                <pre className="bg-gray-50 rounded-lg p-3 text-xs overflow-auto">{JSON.stringify(batch.retry_params, null, 2)}</pre>
                              </div>
                            )}
                            {batch.error_samples?.length > 0 && (
                              <ErrorCategoryDisplay errors={batch.error_samples} />
                            )}
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>

                  {/* Row 2: Category + Tags */}
                  <div className="flex items-center gap-4 mb-2 flex-wrap">
                    <BatchCategorySelector batch={batch} onUpdate={refreshBatches} />
                    <BatchTagManager batch={batch} onUpdate={refreshBatches} />
                  </div>

                  {/* Progress Bar */}
                  {(batch.status === 'processing' || batch.status === 'validating' || batch.status === 'paused') && (
                    <div className="mb-2">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-500">Progress</span>
                        <span className="font-medium">{getProgress(batch)}%</span>
                      </div>
                      <Progress value={getProgress(batch)} className="h-1.5" />
                    </div>
                  )}

                  {/* Error summary for failed batches */}
                  {batch.status === 'failed' && batch.error_samples?.length > 0 && (
                    <div className="mb-2">
                      <ErrorCategoryDisplay errors={batch.error_samples} />
                    </div>
                  )}

                  {/* Row 3: Stats */}
                  <div className="flex gap-6 text-sm flex-wrap">
                    {batch.status === 'failed' && (!batch.total_rows || batch.total_rows === 0) && !batch.error_samples?.length ? (
                      <div className="text-red-600 text-xs">
                        Import failed before data could be processed
                      </div>
                    ) : (
                      <>
                        {batch.total_rows > 0 && <div><span className="text-gray-600">Total: </span><span className="font-semibold">{batch.total_rows.toLocaleString()}</span></div>}
                        {batch.valid_rows > 0 && <div><span className="text-gray-600">Validated: </span><span className="font-semibold text-green-600">{batch.valid_rows.toLocaleString()}</span></div>}
                        {batch.imported_rows > 0 && <div><span className="text-gray-600">Imported: </span><span className="font-semibold text-blue-600">{batch.imported_rows.toLocaleString()}</span></div>}
                        {batch.updated_rows > 0 && <div><span className="text-gray-600">Updated: </span><span className="font-semibold text-purple-600">{batch.updated_rows.toLocaleString()}</span></div>}
                        {batch.skipped_rows > 0 && <div><span className="text-gray-600">Skipped: </span><span className="font-semibold text-gray-500">{batch.skipped_rows.toLocaleString()}</span></div>}
                        {batch.invalid_rows > 0 && <div><span className="text-gray-600">Invalid: </span><span className="font-semibold text-red-600">{batch.invalid_rows.toLocaleString()}</span></div>}
                        {batch.status === 'failed' && batch.valid_rows > 0 && !batch.imported_rows && (
                          <div className="text-xs text-amber-600 italic">Validated but failed during import</div>
                        )}
                      </>
                    )}
                    <div className="ml-auto text-gray-500 text-xs">{formatTimestamp(batch.created_date)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Retry Dialog */}
      <RetryBatchDialog
        batch={retryBatch}
        open={!!retryBatch}
        onOpenChange={(open) => { if (!open) setRetryBatch(null); }}
        onRetryStarted={refreshBatches}
      />
    </div>
  );
}
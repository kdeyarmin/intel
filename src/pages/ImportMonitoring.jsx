import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  Activity, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  AlertCircle,
  FileText,
  TrendingUp,
  Loader2
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

export default function ImportMonitoring() {
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [showOnlyLatest, setShowOnlyLatest] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  const [isRefreshing, setIsRefreshing] = useState(false);
  const queryClient = useQueryClient();

  const { data: batches = [], isLoading } = useQuery({
    queryKey: ['importMonitoringBatches'],
    queryFn: () => base44.entities.ImportBatch.list('-created_date', 50),
    refetchInterval: 30000,
  });

  const getStatusIcon = (status) => {
    switch (status) {
      case 'processing':
      case 'validating':
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'completed':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusBadge = (status) => {
    const variants = {
      processing: 'default',
      validating: 'default',
      completed: 'default',
      failed: 'destructive',
    };

    const colors = {
      processing: 'bg-blue-100 text-blue-800',
      validating: 'bg-yellow-100 text-yellow-800',
      completed: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
    };

    return (
      <Badge className={colors[status] || ''}>
        {status}
      </Badge>
    );
  };

  const getProgress = (batch) => {
    if (batch.status === 'completed') return 100;
    if (batch.status === 'failed') return 0;
    if (batch.status === 'processing') return 50;
    if (batch.status === 'validating') return 25;
    return 0;
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const STALE_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

  const isStale = (batch) => {
    if (batch.status !== 'processing' && batch.status !== 'validating') return false;
    const updated = new Date(batch.updated_date || batch.created_date);
    return (Date.now() - updated.getTime()) > STALE_THRESHOLD_MS;
  };

  const runningBatches = batches.filter(b => (b.status === 'processing' || b.status === 'validating') && !isStale(b));
  const staleBatches = batches.filter(b => isStale(b));
  const completedBatches = batches.filter(b => b.status === 'completed');
  const failedBatches = batches.filter(b => b.status === 'failed');

  // Deduplicate: for each import_type+file_name combo, keep only the latest
  const getDisplayBatches = () => {
    let filtered = batches;
    if (statusFilter !== 'all') {
      if (statusFilter === 'active') {
        filtered = filtered.filter(b => b.status === 'processing' || b.status === 'validating');
      } else {
        filtered = filtered.filter(b => b.status === statusFilter);
      }
    }
    if (!showOnlyLatest) return filtered;
    const seen = new Map();
    for (const b of filtered) {
      const key = `${b.import_type}_${b.file_name}`;
      if (!seen.has(key) || new Date(b.created_date) > new Date(seen.get(key).created_date)) {
        seen.set(key, b);
      }
    }
    return Array.from(seen.values());
  };
  const displayBatches = getDisplayBatches();

  const getImportTypeLabel = (type) => {
    const labels = {
      'nppes_monthly': 'NPPES Monthly',
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
    };
    return labels[type] || type;
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Import Monitoring</h1>
          <p className="text-gray-600 mt-1">Real-time overview of all import jobs</p>
        </div>
        <Button 
          onClick={async () => {
            setIsRefreshing(true);
            await queryClient.invalidateQueries({ queryKey: ['importMonitoringBatches'] });
            setIsRefreshing(false);
          }} 
          variant="outline"
          disabled={isRefreshing}
        >
          {isRefreshing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Activity className="w-4 h-4 mr-2" />}
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Active Jobs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-3xl font-bold">{runningBatches.length}</div>
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-3xl font-bold text-green-600">{completedBatches.length}</div>
              <CheckCircle2 className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Failed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-3xl font-bold text-red-600">{failedBatches.length}</div>
              <XCircle className="w-8 h-8 text-red-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Total Jobs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-3xl font-bold">{batches.length}</div>
              <TrendingUp className="w-8 h-8 text-teal-500" />
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
              These jobs haven't updated in over 15 minutes and are likely stalled. You can mark them as failed to clean up.
            </p>
            <div className="space-y-2">
              {staleBatches.map(batch => (
                <div key={batch.id} className="flex items-center justify-between bg-white border border-amber-200 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-500" />
                    <span className="text-sm font-medium">{getImportTypeLabel(batch.import_type)}</span>
                    <span className="text-xs text-gray-500">{batch.file_name}</span>
                    <Badge className="bg-amber-100 text-amber-800">{batch.status}</Badge>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 border-red-300 hover:bg-red-50"
                    onClick={async () => {
                      await base44.entities.ImportBatch.update(batch.id, {
                        status: 'failed',
                        error_samples: [{ row: 0, message: 'Manually marked as failed — job was stalled' }]
                      });
                      queryClient.invalidateQueries({ queryKey: ['importMonitoringBatches'] });
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

      {/* Import Jobs List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle>Recent Import Jobs</CardTitle>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <select 
                  className="text-xs border rounded-md px-2 py-1.5 bg-white"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="failed">Failed</option>
                </select>
              </div>
              <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={showOnlyLatest} 
                  onChange={(e) => setShowOnlyLatest(e.target.checked)}
                  className="rounded"
                />
                Latest per source only
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
              <p className="font-medium">No import jobs yet</p>
              <p className="text-sm mt-1">Import jobs will appear here when you start an import</p>
            </div>
          ) : (
            <div className="space-y-4">
              {displayBatches.map((batch) => (
                <div
                  key={batch.id}
                  className="p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(batch.status)}
                      <div>
                        <h3 className="font-semibold text-gray-900">
                          {getImportTypeLabel(batch.import_type)}
                        </h3>
                        <p className="text-sm text-gray-500">{batch.file_name}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(batch.status)}
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedBatch(batch)}
                          >
                            View Details
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>Import Job Details</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 mt-4">
                            <div>
                              <h4 className="font-semibold mb-2">General Information</h4>
                              <div className="grid grid-cols-2 gap-3 text-sm">
                                <div>
                                  <span className="text-gray-600">Import Type:</span>
                                  <p className="font-medium">{getImportTypeLabel(batch.import_type)}</p>
                                </div>
                                <div>
                                  <span className="text-gray-600">Status:</span>
                                  <p className="font-medium">{batch.status}</p>
                                </div>
                                <div>
                                  <span className="text-gray-600">Created:</span>
                                  <p className="font-medium">{formatTimestamp(batch.created_date)}</p>
                                </div>
                                <div>
                                  <span className="text-gray-600">Completed:</span>
                                  <p className="font-medium">{formatTimestamp(batch.completed_at)}</p>
                                </div>
                              </div>
                            </div>

                            <div>
                              <h4 className="font-semibold mb-2">Statistics</h4>
                              <div className="grid grid-cols-2 gap-3 text-sm">
                                <div>
                                  <span className="text-gray-600">Total Rows:</span>
                                  <p className="font-medium">{batch.total_rows?.toLocaleString() || 0}</p>
                                </div>
                                <div>
                                  <span className="text-gray-600">Valid Rows:</span>
                                  <p className="font-medium text-green-600">{batch.valid_rows?.toLocaleString() || 0}</p>
                                </div>
                                <div>
                                  <span className="text-gray-600">Invalid Rows:</span>
                                  <p className="font-medium text-red-600">{batch.invalid_rows?.toLocaleString() || 0}</p>
                                </div>
                                <div>
                                  <span className="text-gray-600">Duplicate Rows:</span>
                                  <p className="font-medium text-yellow-600">{batch.duplicate_rows?.toLocaleString() || 0}</p>
                                </div>
                                <div>
                                  <span className="text-gray-600">Imported:</span>
                                  <p className="font-medium text-blue-600">{batch.imported_rows?.toLocaleString() || 0}</p>
                                </div>
                                <div>
                                  <span className="text-gray-600">Updated:</span>
                                  <p className="font-medium text-purple-600">{batch.updated_rows?.toLocaleString() || 0}</p>
                                </div>
                              </div>
                            </div>

                            {batch.error_samples && batch.error_samples.length > 0 && (
                              <div>
                                <h4 className="font-semibold mb-2 flex items-center gap-2">
                                  <AlertCircle className="w-4 h-4 text-red-500" />
                                  Error Samples
                                </h4>
                                <div className="bg-red-50 rounded-lg p-3 space-y-2">
                                  {batch.error_samples.slice(0, 10).map((error, idx) => (
                                    <div key={idx} className="text-sm">
                                      <span className="font-medium text-red-700">Row {error.row}:</span>{' '}
                                      <span className="text-red-600">{error.message}</span>
                                      {error.npi && <span className="text-gray-600"> (NPI: {error.npi})</span>}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {batch.column_mapping && Object.keys(batch.column_mapping).length > 0 && (
                              <div>
                                <h4 className="font-semibold mb-2">Column Mapping</h4>
                                <div className="bg-gray-50 rounded-lg p-3">
                                  <div className="grid grid-cols-2 gap-2 text-sm">
                                    {Object.entries(batch.column_mapping).map(([key, value]) => (
                                      <div key={key}>
                                        <span className="text-gray-600">{key}:</span>{' '}
                                        <span className="font-medium">{value}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  {(batch.status === 'processing' || batch.status === 'validating') && (
                    <div className="mb-3">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-600">Progress</span>
                        <span className="font-medium">{getProgress(batch)}%</span>
                      </div>
                      <Progress value={getProgress(batch)} className="h-2" />
                    </div>
                  )}

                  {/* Stats */}
                  <div className="flex gap-6 text-sm flex-wrap">
                    {batch.status === 'failed' && (!batch.total_rows || batch.total_rows === 0) ? (
                      <div className="text-red-600 text-xs">
                        {batch.error_samples?.[0]?.message || 'Import failed before data could be processed'}
                      </div>
                    ) : (
                      <>
                        {(batch.total_rows != null && batch.total_rows > 0) && (
                          <div>
                            <span className="text-gray-600">Total: </span>
                            <span className="font-semibold">{batch.total_rows.toLocaleString()}</span>
                          </div>
                        )}
                        {(batch.valid_rows != null && batch.valid_rows > 0) && (
                          <div>
                            <span className="text-gray-600">Validated: </span>
                            <span className="font-semibold text-green-600">{batch.valid_rows.toLocaleString()}</span>
                          </div>
                        )}
                        {batch.imported_rows > 0 && (
                          <div>
                            <span className="text-gray-600">Imported: </span>
                            <span className="font-semibold text-blue-600">{batch.imported_rows.toLocaleString()}</span>
                          </div>
                        )}
                        {batch.updated_rows > 0 && (
                          <div>
                            <span className="text-gray-600">Updated: </span>
                            <span className="font-semibold text-purple-600">{batch.updated_rows.toLocaleString()}</span>
                          </div>
                        )}
                        {batch.skipped_rows > 0 && (
                          <div>
                            <span className="text-gray-600">Skipped: </span>
                            <span className="font-semibold text-gray-500">{batch.skipped_rows.toLocaleString()}</span>
                          </div>
                        )}
                        {batch.invalid_rows > 0 && (
                          <div>
                            <span className="text-gray-600">Invalid: </span>
                            <span className="font-semibold text-red-600">{batch.invalid_rows.toLocaleString()}</span>
                          </div>
                        )}
                        {batch.status === 'failed' && batch.valid_rows > 0 && !batch.imported_rows && (
                          <div className="text-xs text-amber-600 italic">
                            Validated but failed during import
                          </div>
                        )}
                      </>
                    )}
                    <div className="ml-auto text-gray-500">
                      {formatTimestamp(batch.created_date)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
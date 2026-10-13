import React, { useState, useMemo, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Activity, CheckCircle2, XCircle, Clock, AlertCircle, AlertTriangle,
  FileText, TrendingUp, Loader2, Search, Pause, RefreshCw, Trash2,
  Plus, History, ShieldCheck, Bell, Download, Sparkles, Upload, Bot, HeartPulse, CalendarClock, StopCircle
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import BatchTagManager from '../components/imports/BatchTagManager';
import BatchCategorySelector from '../components/imports/BatchCategorySelector';
import BatchActionButtons from '../components/imports/BatchActionButtons';
import RetryBatchDialog from '../components/imports/RetryBatchDialog';
import ImportSpeedView from '../components/imports/ImportSpeedView';
import ErrorLogDialog from '../components/imports/ErrorLogDialog';
import ValidationErrorBreakdown from '../components/imports/ValidationErrorBreakdown';
import DateRangeFilter from '../components/imports/DateRangeFilter';
import BatchDetailPanel from '../components/imports/BatchDetailPanel';
import NewImportDialog from '../components/imports/NewImportDialog';
import ValidationRulesManager from '../components/imports/ValidationRulesManager';
import LiveProgressCard from '../components/imports/LiveProgressCard';
import SystemStatusPanel from '../components/imports/SystemStatusPanel';
import MaintenanceHealthPanel from '../components/imports/MaintenanceHealthPanel';
import ImportHealthView from '../components/imports/ImportHealthView';
import AlertNotificationSettings, { checkAndNotify } from '../components/imports/AlertNotificationSettings';
import ExportImportData from '../components/imports/ExportImportData';
import ImportTrendCharts from '../components/imports/ImportTrendCharts';
import ResumeImportButton from '../components/imports/ResumeImportButton';
import AIImportQualityAnalysis from '../components/imports/AIImportQualityAnalysis';
import BatchFilterSort from '../components/imports/BatchFilterSort';
import ImportOverviewKPIs from '../components/imports/ImportOverviewKPIs';
import CriticalFailureAlerts from '../components/imports/CriticalFailureAlerts';
import SuccessVsFailureChart from '../components/imports/SuccessVsFailureChart';
import EnhancedErrorReport from '../components/imports/EnhancedErrorReport';
import AIFailureAnalysis from '../components/imports/AIFailureAnalysis';
import CrossBatchErrorResolver from '../components/imports/CrossBatchErrorResolver';
import PageHeader from '../components/shared/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUrlState } from '@/hooks/useUrlState';
import ImportAgentChat from '../components/imports/ImportAgentChat';
import ImportScheduleManager from '../components/imports/ImportScheduleManager';
import { buildImportTypeLabels } from '@/lib/cmsImportTypes';
import PageTabs from '@/components/layout/PageTabs';

const CATEGORY_LABELS = {
  nppes: 'NPPES',
  cms_claims: 'CMS Claims',
  cms_enrollment: 'CMS Enrollment',
  cms_statistics: 'CMS Statistics',
  provider_data: 'Provider Data',
  other: 'Other',
};

const IMPORT_TYPE_LABELS = buildImportTypeLabels({
  provider_service_utilization: 'Provider Service Utilization',
});

const IMPORT_TABS = [
  { value: 'monitoring', label: 'Monitor', icon: Activity },
  { value: 'history', label: 'History', icon: History },
  { value: 'rules', label: 'Rules', icon: ShieldCheck },
  { value: 'alerts', label: 'Alerts', icon: Bell },
  { value: 'ai_quality', label: 'AI', icon: Sparkles },
  { value: 'agent', label: 'AI Manager', icon: Bot },
  { value: 'performance', label: 'Performance', icon: TrendingUp },
  { value: 'health', label: 'Health', icon: HeartPulse },
  { value: 'automation', label: 'Automation', icon: CalendarClock },
];
// The open tab lives in ?importsTab= so links (e.g. from notifications) and Back land on it.
const IMPORTS_URL_DEFAULTS = { importsTab: 'monitoring' };

export default function ImportMonitoring() {
  const [showOnlyLatest, setShowOnlyLatest] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [retryBatch, setRetryBatch] = useState(null);
  const [retryPresets, setRetryPresets] = useState(null);
  const [errorLogBatch, setErrorLogBatch] = useState(null);
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [deletingBatchId, setDeletingBatchId] = useState(null);
  const [confirmDeleteBatch, setConfirmDeleteBatch] = useState(null);
  const [showNewImport, setShowNewImport] = useState(false);
  const [importsUrl, setImportsUrl] = useUrlState(IMPORTS_URL_DEFAULTS);
  const activeTab = IMPORT_TABS.some((t) => t.value === importsUrl.importsTab) ? importsUrl.importsTab : 'monitoring';
  const [selectedForRerun, setSelectedForRerun] = useState(new Set());
  const [bulkRetryMode, setBulkRetryMode] = useState(false);
  const [isBulkRetrying, setIsBulkRetrying] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [lastNFilter, setLastNFilter] = useState(0); // 0 = off
  const [sortBy, setSortBy] = useState('created_date_desc');
  const [importTypeFilter, setImportTypeFilter] = useState('');
  const [errorReportBatch, setErrorReportBatch] = useState(null);
  const queryClient = useQueryClient();

  const { data: batches = [], isLoading } = useQuery({
    queryKey: ['importMonitoringBatches'],
    queryFn: () => base44.entities.ImportBatch.list('-created_date', 100),
    refetchInterval: 10000, // Poll every 10s for real-time feel
  });

  const refreshBatches = () => queryClient.refetchQueries({ queryKey: ['importMonitoringBatches'] });

  // Real-time subscription for live updates
  const prevStatusMap = useRef({});
  useEffect(() => {
    const unsubscribe = base44.entities.ImportBatch.subscribe((event) => {
      queryClient.invalidateQueries({ queryKey: ['importMonitoringBatches'] });
      // Trigger alert notifications on status change
      if (event.type === 'update' && event.data) {
        const prev = prevStatusMap.current[event.id];
        if (prev && prev !== event.data.status) {
          checkAndNotify(event.data, prev);
        }
        prevStatusMap.current[event.id] = event.data.status;
      }
    });
    return unsubscribe;
  }, [queryClient]);

  // Keep prev status map in sync
  useEffect(() => {
    for (const b of batches) {
      if (!prevStatusMap.current[b.id]) {
        prevStatusMap.current[b.id] = b.status;
      }
    }
  }, [batches]);

  // Collect all unique tags, years, and import types
  const allTags = useMemo(() => {
    const tags = new Set();
    batches.forEach(b => (b.tags || []).forEach(t => tags.add(t)));
    return Array.from(tags).sort();
  }, [batches]);

  const allYears = useMemo(() => {
    const years = new Set();
    batches.forEach(b => {
      if (b.data_year) years.add(String(b.data_year));
      else {
        const match = (b.file_name || '').match(/20\d{2}/);
        if (match) years.add(match[0]);
      }
    });
    return Array.from(years).sort().reverse();
  }, [batches]);

  const allImportTypes = useMemo(() => {
    const types = new Set();
    batches.forEach(b => {
      if (b.import_type) types.add(b.import_type);
    });
    return Array.from(types).sort((a, b) => {
      const labelA = IMPORT_TYPE_LABELS[a] || a;
      const labelB = IMPORT_TYPE_LABELS[b] || b;
      return labelA.localeCompare(labelB);
    });
  }, [batches]);

  const STALE_THRESHOLD_MS = 15 * 60 * 1000;
  const CRAWLER_STALE_THRESHOLD_MS = 60 * 60 * 1000;
  const isStale = (batch) => {
    if (batch.status !== 'processing' && batch.status !== 'validating') return false;
    const updated = new Date(batch.updated_date || batch.created_date);
    const threshold = batch.import_type === 'nppes_registry' ? CRAWLER_STALE_THRESHOLD_MS : STALE_THRESHOLD_MS;
    return (Date.now() - updated.getTime()) > threshold;
  };

  const runningBatches = batches.filter(b => (b.status === 'processing' || b.status === 'validating') && !isStale(b));
  const staleBatches = batches.filter(b => isStale(b));
  const failedBatches = batches.filter(b => b.status === 'failed');

  const toggleSelectForRerun = (id) => {
    setSelectedForRerun(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const MAX_RETRIES = 5;

  const handleBulkRetry = async () => {
    if (selectedForRerun.size === 0) return;
    setIsBulkRetrying(true);
    try {
      const toRetry = batches.filter(b => selectedForRerun.has(b.id) && (b.retry_count || 0) < MAX_RETRIES);
      let successCount = 0;
      let skipCount = 0;
      for (const batch of toRetry) {
        try {
          await base44.functions.invoke('triggerImport', {
            import_type: batch.import_type,
            file_url: batch.file_url || undefined,
            dry_run: false,
            year: batch.data_year || undefined,
            retry_of: batch.id,
            retry_count: (batch.retry_count || 0) + 1,
            retry_tags: [...new Set([...(batch.tags || []).filter(t => t !== 'retry' && t !== 'bulk-retry'), 'retry', 'bulk-retry'])],
            category: batch.category || undefined,
          });
          successCount++;
        } catch (e) {
          console.warn('Bulk retry failed for', batch.import_type, ':', e.message);
          skipCount++;
        }
      }
      if (successCount > 0) toast.success(`Retried ${successCount} batch${successCount > 1 ? 'es' : ''} successfully`);
      if (skipCount > 0) toast.error(`${skipCount} batch${skipCount > 1 ? 'es' : ''} failed to retry`);
      setSelectedForRerun(new Set());
      setBulkRetryMode(false);
      refreshBatches();
    } catch (err) {
      console.error('[ImportMonitoring] Bulk retry error:', err);
      toast.error('Bulk retry failed: ' + err.message);
    } finally {
      setIsBulkRetrying(false);
    }
  };
  const pausedBatches = batches.filter(b => b.status === 'paused');
  const isCrawlerBatch = (b) => b.import_type === 'nppes_registry' && b.file_name?.startsWith('crawler_');

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

    // Year filter
    if (yearFilter !== 'all') {
      filtered = filtered.filter(b => {
        // Try to find year in data_year field, or parse from file_name/file_url
        if (b.data_year) return String(b.data_year) === yearFilter;
        // Check file name for year pattern (4 digits)
        const match = (b.file_name || '').match(/20\d{2}/);
        return match && match[0] === yearFilter;
      });
    }

    // Tag filter
    if (tagFilter) {
      filtered = filtered.filter(b => (b.tags || []).includes(tagFilter));
    }

    // Import type filter
    if (importTypeFilter) {
      filtered = filtered.filter(b => b.import_type === importTypeFilter);
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

    // Date range
    if (dateStart) {
      const start = new Date(dateStart);
      filtered = filtered.filter(b => new Date(b.created_date) >= start);
    }
    if (dateEnd) {
      const end = new Date(dateEnd);
      end.setHours(23, 59, 59, 999);
      filtered = filtered.filter(b => new Date(b.created_date) <= end);
    }

    // Last N filter
    if (lastNFilter > 0) {
      filtered = filtered.slice(0, lastNFilter);
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
      filtered = Array.from(seen.values());
    }

    // With no status filter, list finished jobs only (active ones are in Live
    // Progress). An explicit filter (e.g. "active" from a KPI card) is honoured.
    if (statusFilter === 'all') {
      filtered = filtered.filter(b => b.status === 'completed' || b.status === 'failed' || b.status === 'cancelled');
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'created_date_desc':
          return new Date(b.created_date) - new Date(a.created_date);
        case 'created_date_asc':
          return new Date(a.created_date) - new Date(b.created_date);
        case 'completed_date_desc':
          return (new Date(b.completed_at || b.updated_date || 0) - new Date(a.completed_at || a.updated_date || 0));
        case 'completed_date_asc':
          return (new Date(a.completed_at || a.updated_date || 0) - new Date(b.completed_at || b.updated_date || 0));
        case 'total_rows_desc':
          return (b.total_rows || 0) - (a.total_rows || 0);
        case 'total_rows_asc':
          return (a.total_rows || 0) - (b.total_rows || 0);
        default:
          return 0;
      }
    });

    return filtered;
  }, [batches, statusFilter, categoryFilter, tagFilter, searchQuery, showOnlyLatest, dateStart, dateEnd, lastNFilter, sortBy, importTypeFilter, yearFilter]);

  const displayedFailedBatches = displayBatches?.filter(b => b.status === 'failed') || [];

  const getStatusIcon = (status) => {
    switch (status) {
      case 'processing':
      case 'validating':
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'completed':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'completed_with_errors':
        return <AlertTriangle className="w-5 h-5 text-amber-500" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'paused':
        return <Pause className="w-5 h-5 text-amber-500" />;
      case 'pausing':
        return <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />;
      case 'cancelling':
        return <Loader2 className="w-5 h-5 text-orange-400 animate-spin" />;
      case 'cancelled':
        return <XCircle className="w-5 h-5 text-slate-400" />;
      default:
        return <Clock className="w-5 h-5 text-slate-400" />;
    }
  };

  const statusColors = {
    processing: 'bg-blue-900/15 text-blue-400 border border-blue-500/20',
    validating: 'bg-yellow-900/15 text-yellow-400 border border-yellow-500/20',
    completed: 'bg-emerald-900/15 text-emerald-400 border border-emerald-500/20',
    completed_with_errors: 'bg-amber-900/15 text-amber-400 border border-amber-500/20',
    failed: 'bg-red-900/15 text-red-400 border border-red-500/20',
    paused: 'bg-amber-900/15 text-amber-400 border border-amber-500/20',
    pausing: 'bg-amber-900/15 text-amber-300 border border-amber-500/20',
    cancelling: 'bg-orange-900/15 text-orange-400 border border-orange-500/20',
    cancelled: 'bg-slate-500/15 text-slate-400 border border-slate-500/20',
  };

  // Returns a 0-100 percentage, or null when progress is genuinely unknown
  // (total_rows not set yet). Never fabricate a percentage.
  const getProgress = (batch) => {
    if (batch.status === 'completed' || batch.status === 'completed_with_errors') return 100;
    if (batch.status === 'failed' || batch.status === 'cancelled') return 0;
    const total = batch.total_rows || 0;
    if (total === 0) return null;
    if (batch.status === 'validating') {
      const validated = (batch.valid_rows || 0) + (batch.invalid_rows || 0);
      return Math.min(Math.round((validated / total) * 50), 49);
    }
    // processing, pausing or paused
    const processed = (batch.imported_rows || 0) + (batch.updated_rows || 0) + (batch.skipped_rows || 0) + (batch.invalid_rows || 0) + (batch.excluded_rows || 0);
    return Math.min(50 + Math.round((processed / total) * 50), 99);
  };

  const formatTimestamp = (ts) => {
    if (!ts) return 'N/A';
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    });
    return formatter.format(new Date(ts)) + ' ET';
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      <PageTabs current="ImportMonitoring" />
      <PageHeader
        title="Import Monitoring"
        subtitle="Real-time monitoring, validation rules, and alert notifications"
        icon={Activity}
        breadcrumbs={[{ label: 'Admin', page: 'DataCenter' }, { label: 'Import Monitor' }]}
      />
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div />
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            onClick={() => setShowExport(true)}
            variant="outline"
            className="bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-cyan-400"
          >
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          <Button
            asChild
            variant="outline"
            className="bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-cyan-400"
          >
            <Link to={createPageUrl('DataCenter')}>
              <Upload className="w-4 h-4 mr-2" />
              Manual Upload
            </Link>
          </Button>
          <Button
            onClick={() => setShowNewImport(true)}
            className="bg-cyan-700 hover:bg-cyan-800 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Auto-Import
          </Button>
          <Button
            onClick={async () => { setIsRefreshing(true); try { await refreshBatches(); } finally { setIsRefreshing(false); } }}
            variant="outline"
            disabled={isRefreshing}
            className="bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-cyan-400"
          >
            {isRefreshing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Activity className="w-4 h-4 mr-2" />}
            Refresh
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setImportsUrl({ importsTab: value })} className="space-y-6">
      <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto bg-slate-800/50 p-1">
        {IMPORT_TABS.map(({ value, label, icon: Icon }) => (
          <TabsTrigger key={value} value={value} className="gap-1 whitespace-nowrap px-3 sm:px-4 text-xs sm:text-sm data-[state=active]:bg-slate-700">
            <Icon className="w-3.5 h-3.5" aria-hidden="true" /> {label}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="history" className="mt-0">
        <ImportHistoryView batches={batches} formatTimestamp={formatTimestamp} />
      </TabsContent>

      <TabsContent value="rules" className="mt-0">
        <Card className="bg-[#141d30] border-slate-700/50">
          <CardContent className="pt-6" style={{ minHeight: '500px' }}>
            <ValidationRulesManager />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="alerts" className="mt-0">
        <div className="max-w-2xl">
          <AlertNotificationSettings />
        </div>
      </TabsContent>

      <TabsContent value="ai_quality" className="mt-0">
        <AIImportQualityAnalysis />
      </TabsContent>

      <TabsContent value="agent" className="mt-0">
        <div className="h-[600px] border border-slate-700/50 rounded-xl overflow-hidden bg-[#141d30]">
          <ImportAgentChat />
        </div>
      </TabsContent>

      <TabsContent value="performance" className="mt-0">
        <ImportSpeedView batches={batches} onRefresh={refreshBatches} />
      </TabsContent>

      <TabsContent value="health" className="mt-0">
        <ImportHealthView />
      </TabsContent>

      <TabsContent value="automation" className="mt-0">
        <ImportScheduleManager />
      </TabsContent>

      <TabsContent value="monitoring" className="mt-0 space-y-6">
      {/* Overview KPIs */}
      <ImportOverviewKPIs batches={batches} onFilterChange={setStatusFilter} />

      {/* Critical Failure Alerts */}
      <CriticalFailureAlerts batches={batches} onViewErrors={(b) => setErrorReportBatch(b)} />

      {/* System Status */}
      <SystemStatusPanel batches={batches} />

      {/* Maintenance heartbeat — surfaces whether the schedule loop's fanout
          to autoResume / autoRetry / cancelStalled / manageCrawlerRetries is
          actually running. If this goes stale, paused/failed batches stop
          getting picked back up. */}
      <MaintenanceHealthPanel />

      {/* Live Progress for Active Jobs */}
      <LiveProgressCard activeBatches={[...runningBatches, ...pausedBatches]} onAction={refreshBatches} />

      {/* Success vs Failure Charts */}
      <SuccessVsFailureChart batches={batches} />

      {/* Import Trend Charts */}
      <ImportTrendCharts batches={batches} />

      {/* Cross-Batch Error Resolver */}
      {failedBatches.length > 1 && (
        <CrossBatchErrorResolver batches={batches} onActionComplete={refreshBatches} />
      )}

      {/* Enhanced Error Report Dialog */}
      <EnhancedErrorReport
        batch={errorReportBatch}
        open={!!errorReportBatch}
        onOpenChange={(open) => { if (!open) setErrorReportBatch(null); }}
        onRefresh={refreshBatches}
      />

      {/* Stale Jobs Warning */}
      {staleBatches.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-900/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-amber-400">
              <AlertCircle className="w-5 h-5" />
              {staleBatches.length} Stalled Job{staleBatches.length !== 1 ? 's' : ''} Detected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-amber-400 mb-3">
              No progress for over 15 minutes (60 minutes for NPPES registry imports). This is an early warning: maintenance ticks mark jobs failed after 2 hours without progress; crawlers use their own watchdog. Cancel stops a job for good. Mark Failed moves it to failed imports; automatic retry applies only to eligible transient errors.
            </p>
            <div className="space-y-2">
              {staleBatches.map(batch => (
                <div key={batch.id} className="flex items-center justify-between bg-slate-800/50 border border-amber-500/20 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-400" />
                    <span className="text-sm font-medium text-slate-200">{IMPORT_TYPE_LABELS[batch.import_type] || batch.import_type}</span>
                    <span className="text-xs text-slate-400">{batch.file_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm" variant="outline"
                      className="text-slate-300 border-slate-600 hover:bg-slate-800"
                      title="Stop this job; it can be re-run later"
                      onClick={async () => {
                        try {
                          await base44.entities.ImportBatch.update(batch.id, {
                            status: 'cancelled',
                            cancelled_at: new Date().toISOString(),
                            cancel_reason: 'Cancelled from Import Monitoring — job was stalled',
                          });
                          refreshBatches();
                        } catch (err) {
                          toast.error(`Could not cancel the job: ${err.message}`);
                        }
                      }}
                    >
                      <StopCircle className="w-3 h-3 mr-1" /> Cancel
                    </Button>
                    <Button
                      size="sm" variant="outline"
                      className="text-red-400 border-red-500/30 hover:bg-red-900/10"
                      title="Record this job as failed so auto-retry can pick it up"
                      onClick={async () => {
                        try {
                          await base44.entities.ImportBatch.update(batch.id, {
                            status: 'failed',
                            error_samples: [{ row: 0, message: 'Manually marked as failed — job was stalled' }]
                          });
                          refreshBatches();
                        } catch (err) {
                          toast.error(`Could not mark the job as failed: ${err.message}`);
                        }
                      }}
                    >
                      <XCircle className="w-3 h-3 mr-1" /> Mark Failed
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bulk Retry Bar */}
      {failedBatches.length > 0 && (
        <div className="flex items-center gap-3">
          {!bulkRetryMode ? (
            <Button
              variant="outline"
              size="sm"
              className="bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-cyan-400"
              onClick={() => setBulkRetryMode(true)}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Bulk Re-run Failed ({failedBatches.filter(b => (b.retry_count || 0) < MAX_RETRIES).length})
            </Button>
          ) : (
            <>
              <span className="text-xs text-slate-400">
                Select failed batches to re-run ({selectedForRerun.size} selected)
              </span>
              <Button
                size="sm"
                disabled={selectedForRerun.size === 0 || isBulkRetrying}
                className="bg-cyan-700 hover:bg-cyan-800 text-white"
                onClick={handleBulkRetry}
              >
                {isBulkRetrying ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
                Re-run {selectedForRerun.size} batch{selectedForRerun.size !== 1 ? 'es' : ''}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="bg-transparent border-slate-700 text-slate-400 hover:bg-slate-800"
                onClick={() => { setBulkRetryMode(false); setSelectedForRerun(new Set()); }}
              >
                Cancel
              </Button>
              {displayedFailedBatches.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-slate-400 hover:text-slate-300"
                  onClick={() => {
                    const retryable = displayedFailedBatches.filter(b => (b.retry_count || 0) < MAX_RETRIES);
                    if (selectedForRerun.size === retryable.length) {
                      setSelectedForRerun(new Set());
                    } else {
                      setSelectedForRerun(new Set(retryable.map(b => b.id)));
                    }
                  }}
                >
                  {selectedForRerun.size === displayedFailedBatches.length ? 'Deselect All' : 'Select All Failed'}
                </Button>
              )}
            </>
          )}
        </div>
      )}

      {/* Filters & Sort */}
      <Card className="bg-[#141d30] border-slate-700/50">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-slate-200">Completed Jobs</CardTitle>
            <BatchFilterSort
              sortBy={sortBy}
              onSortChange={setSortBy}
              importTypes={allImportTypes}
              currentImportTypeFilter={importTypeFilter}
              onFilterTypeChange={setImportTypeFilter}
            />
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search..."
                  aria-label="Search completed jobs"
                  className="h-8 w-40 pl-7 text-xs bg-slate-800/50 border-slate-700 text-slate-300 placeholder:text-slate-400"
                />
              </div>
              <select
                className="text-xs border border-slate-700 rounded-md px-2 py-1.5 bg-slate-800/50 text-slate-300 h-8"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="Status"
              >
                <option value="all">All Statuses</option>
                <option value="completed">Completed</option>
                <option value="completed_with_errors">Completed with Errors</option>
                <option value="failed">Failed</option>
                <option value="pausing">Pausing</option>
                <option value="cancelling">Cancelling</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <select
                className="text-xs border border-slate-700 rounded-md px-2 py-1.5 bg-slate-800/50 text-slate-300 h-8"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                aria-label="Category"
              >
                <option value="all">All Categories</option>
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <select
                className="text-xs border border-slate-700 rounded-md px-2 py-1.5 bg-slate-800/50 text-slate-300 h-8"
                value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value)}
                aria-label="Data year"
              >
                <option value="all">All Years</option>
                {allYears.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              {allTags.length > 0 && (
                <select
                  className="text-xs border border-slate-700 rounded-md px-2 py-1.5 bg-slate-800/50 text-slate-300 h-8"
                  value={tagFilter}
                  onChange={(e) => setTagFilter(e.target.value)}
                  aria-label="Tag"
                >
                  <option value="">All Tags</option>
                  {allTags.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              )}
              <select
                className="text-xs border border-slate-700 rounded-md px-2 py-1.5 bg-slate-800/50 text-slate-300 h-8"
                value={lastNFilter}
                onChange={(e) => setLastNFilter(Number(e.target.value))}
                aria-label="Number of imports"
              >
                <option value={0}>All Imports</option>
                <option value={5}>Last 5</option>
                <option value={10}>Last 10</option>
                <option value={25}>Last 25</option>
                <option value={50}>Last 50</option>
              </select>
              <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showOnlyLatest}
                  onChange={(e) => setShowOnlyLatest(e.target.checked)}
                  aria-label="Latest only"
                  className="rounded bg-slate-800 border-slate-600"
                />
                Latest only
              </label>
            </div>
            <DateRangeFilter
              startDate={dateStart}
              endDate={dateEnd}
              onStartChange={setDateStart}
              onEndChange={setDateEnd}
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-12 text-slate-400">
              <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin" />
              <p>Loading import jobs...</p>
            </div>
          ) : displayBatches.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="font-medium">No completed jobs match filters</p>
              <p className="text-sm mt-1">Try adjusting your filters or start a new import</p>
            </div>
          ) : (
            <div className="space-y-4">
              {displayBatches.map((batch) => {
                const progress = getProgress(batch);
                return (
                <div key={batch.id} className={`p-4 border rounded-lg hover:bg-slate-800/30 transition-colors ${
                  bulkRetryMode && batch.status === 'failed' && (batch.retry_count || 0) < MAX_RETRIES
                    ? selectedForRerun.has(batch.id)
                      ? 'border-cyan-500/40 bg-cyan-900/5'
                      : 'border-slate-700/50 cursor-pointer'
                    : 'border-slate-700/50'
                }`}
                  // In bulk-retry mode a click anywhere on the card is a pointer shortcut for the
                  // row's checkbox below, which is the keyboard/screen-reader control. A button role
                  // here would hide the card's own action buttons from assistive technology.
                  role="presentation"
                  onClick={bulkRetryMode && batch.status === 'failed' && (batch.retry_count || 0) < MAX_RETRIES ? () => toggleSelectForRerun(batch.id) : undefined}
                >
                  {/* Row 1: Title, status, actions */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-3">
                      {bulkRetryMode && batch.status === 'failed' && (batch.retry_count || 0) < MAX_RETRIES ? (
                        <input
                          type="checkbox"
                          checked={selectedForRerun.has(batch.id)}
                          onChange={() => toggleSelectForRerun(batch.id)}
                          aria-label={`Select ${IMPORT_TYPE_LABELS[batch.import_type] || batch.import_type} ${batch.file_name || ''} for re-run`.trim()}
                          className="w-4 h-4 rounded bg-slate-800 border-slate-600 text-cyan-500 focus:ring-cyan-500/30"
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        getStatusIcon(batch.status)
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="font-semibold text-slate-200">
                            {IMPORT_TYPE_LABELS[batch.import_type] || batch.import_type}
                          </h2>
                          {batch.retry_of && (
                            <Badge className="text-xs gap-1 bg-amber-900/15 text-amber-400 border border-amber-500/20">
                              <RefreshCw className="w-3 h-3" /> Retry #{batch.retry_count || 1}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-slate-400">{batch.file_name}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={statusColors[batch.status] || ''}>{batch.status}</Badge>
                      <ResumeImportButton batch={batch} onResumed={refreshBatches} />
                      <BatchActionButtons
                        batch={batch}
                        onAction={refreshBatches}
                        onRetryClick={() => setRetryBatch(batch)}
                      />
                      {batch.status === 'failed' && batch.error_samples?.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs text-red-400 border-red-500/30 hover:bg-red-900/10"
                          onClick={() => setErrorReportBatch(batch)}
                        >
                          Error Report
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs text-red-400 border-red-500/30 hover:bg-red-900/10"
                        disabled={deletingBatchId === batch.id}
                        onClick={() => setConfirmDeleteBatch(batch)}
                        aria-label={`Delete import job ${batch.file_name || IMPORT_TYPE_LABELS[batch.import_type] || batch.import_type}`}
                      >
                        {deletingBatchId === batch.id ? <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> : <Trash2 className="w-3 h-3" aria-hidden="true" />}
                      </Button>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" className="h-7 text-xs bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-cyan-400">Details</Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto bg-[#141d30] border-slate-700">
                          <DialogHeader>
                            <DialogTitle className="text-slate-200">Import Job Details</DialogTitle>
                          </DialogHeader>
                          <BatchDetailPanel batch={batch} onUpdated={refreshBatches} />
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
                  {(batch.status === 'processing' || batch.status === 'validating' || batch.status === 'paused' || batch.status === 'pausing') && (
                    <div className="mb-2">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-300">
                          {batch.status === 'validating' ? 'Validating rows...' : batch.status === 'processing' ? 'Importing data...' : batch.status === 'pausing' ? 'Pausing…' : 'Paused'}
                        </span>
                        <span className="font-medium text-slate-200">{progress === null ? '—' : `${progress}%`}</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-700/80 overflow-hidden">
                        {progress === null ? (
                          <div className="h-full w-full rounded-full bg-cyan-500/40 animate-pulse" />
                        ) : (
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              batch.status === 'paused' || batch.status === 'pausing' ? 'bg-amber-500' : batch.status === 'validating' ? 'bg-yellow-500' : 'bg-cyan-500'
                            }`}
                            style={{ width: `${progress}%` }}
                          />
                        )}
                      </div>
                      {batch.total_rows > 0 && (
                        <div className="flex gap-4 mt-1 text-[10px] text-slate-400">
                          {batch.status === 'validating' && (
                            <span>Validated: {((batch.valid_rows || 0) + (batch.invalid_rows || 0)).toLocaleString()} / {batch.total_rows.toLocaleString()}</span>
                          )}
                          {batch.status === 'processing' && (
                            <span>New: {((batch.imported_rows || 0) + (batch.updated_rows || 0)).toLocaleString()}{(batch.skipped_rows || 0) > 0 ? ` · ${batch.skipped_rows.toLocaleString()} dupes` : ''} / {batch.total_rows.toLocaleString()} fetched</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* AI Failure Analysis for failed batches */}
                  {batch.status === 'failed' && (
                    <div className="mb-2">
                      <AIFailureAnalysis
                        batch={batch}
                        compact={true}
                        onRetryWithSettings={(settings) => {
                          setRetryPresets(settings);
                          setRetryBatch(batch);
                        }}
                      />
                    </div>
                  )}

                  {/* Validation error breakdown for failed batches */}
                  {batch.status === 'failed' && batch.error_samples?.length > 0 && (
                    <div className="mb-2">
                      <ValidationErrorBreakdown
                        errors={batch.error_samples}
                        batchName={batch.file_name}
                        compact={true}
                      />
                    </div>
                  )}

                  {/* Row 3: Stats */}
                  <div className="flex gap-6 text-sm flex-wrap">
                    {batch.status === 'failed' && (!batch.total_rows || batch.total_rows === 0) && !batch.error_samples?.length ? (
                      <div className="text-red-400/80 text-xs">
                        Import failed before data could be processed
                      </div>
                    ) : (
                      <>
                        {batch.total_rows > 0 && <div><span className="text-slate-400">Fetched: </span><span className="font-semibold text-slate-200">{batch.total_rows.toLocaleString()}</span></div>}
                        {batch.valid_rows > 0 && <div><span className="text-slate-400">Validated: </span><span className="font-semibold text-emerald-400">{batch.valid_rows.toLocaleString()}</span></div>}
                        {batch.imported_rows > 0 && <div><span className="text-slate-400">New: </span><span className="font-semibold text-blue-400">{batch.imported_rows.toLocaleString()}</span></div>}
                        {batch.updated_rows > 0 && <div><span className="text-slate-400">Updated: </span><span className="font-semibold text-violet-400">{batch.updated_rows.toLocaleString()}</span></div>}
                        {batch.excluded_rows > 0 && <div title="Providers excluded by credential filter"><span className="text-slate-400">Excluded: </span><span className="font-semibold text-orange-400">{batch.excluded_rows.toLocaleString()}</span></div>}
                        {batch.skipped_rows > 0 && <div title="Duplicates or rows missing required fields"><span className="text-slate-400">Duplicates: </span><span className="font-semibold text-amber-400">{batch.skipped_rows.toLocaleString()}</span></div>}
                        {batch.invalid_rows > 0 && <div><span className="text-slate-400">Invalid: </span><span className="font-semibold text-red-400">{batch.invalid_rows.toLocaleString()}</span></div>}
                        {batch.status === 'failed' && batch.valid_rows > 0 && !batch.imported_rows && (
                          <div className="text-xs text-amber-400 italic">Validated but failed during import</div>
                        )}
                      </>
                    )}
                    <div className="ml-auto text-slate-400 text-xs">{formatTimestamp(batch.created_date)}</div>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!confirmDeleteBatch} onOpenChange={(open) => { if (!open) setConfirmDeleteBatch(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Import Batch</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this import record? This only removes the batch log entry — it does not delete any imported data.
            </DialogDescription>
          </DialogHeader>
          {confirmDeleteBatch && (
            <div className="text-sm bg-slate-800/50 border border-slate-700/50 rounded-lg p-3 space-y-1">
              <p><span className="text-slate-400">Type:</span> <span className="font-medium text-slate-200">{IMPORT_TYPE_LABELS[confirmDeleteBatch.import_type] || confirmDeleteBatch.import_type}</span></p>
              <p><span className="text-slate-400">File:</span> <span className="font-medium text-slate-200">{confirmDeleteBatch.file_name}</span></p>
              <p><span className="text-slate-400">Status:</span> <Badge className={statusColors[confirmDeleteBatch.status] || ''}>{confirmDeleteBatch.status}</Badge></p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteBatch(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deletingBatchId === confirmDeleteBatch?.id}
              onClick={async () => {
                const id = confirmDeleteBatch.id;
                setDeletingBatchId(id);
                try {
                  await base44.entities.ImportBatch.delete(id);
                  setConfirmDeleteBatch(null);
                  refreshBatches();
                } catch (err) {
                  console.error('Failed to delete batch:', err);
                } finally {
                  setDeletingBatchId(null);
                }
              }}
            >
              {deletingBatchId === confirmDeleteBatch?.id ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Error Log Dialog */}
      <ErrorLogDialog
        batch={errorLogBatch}
        open={!!errorLogBatch}
        onOpenChange={(open) => { if (!open) setErrorLogBatch(null); }}
      />

      {/* Retry Dialog */}
      <RetryBatchDialog
        batch={retryBatch}
        open={!!retryBatch}
        onOpenChange={(open) => { if (!open) { setRetryBatch(null); setRetryPresets(null); } }}
        onRetryStarted={refreshBatches}
        presets={retryPresets}
      />
      </TabsContent>
      </Tabs>

      {/* New Import Dialog */}
      <NewImportDialog
        open={showNewImport}
        onOpenChange={setShowNewImport}
        onImportStarted={refreshBatches}
      />

      {/* Export Dialog */}
      <ExportImportData
        open={showExport}
        onOpenChange={setShowExport}
      />
    </div>
  );
}

function ImportHistoryView({ batches, formatTimestamp }) {
  const [historySearch, setHistorySearch] = useState('');
  const [historyType, setHistoryType] = useState('all');

  const IMPORT_TYPE_LABELS = buildImportTypeLabels({
    home_health_enrollments: 'HH Enrollments',
    home_health_cost_reports: 'HH Cost Reports',
    provider_service_utilization: 'Provider Service Util',
    home_health_pdgm: 'HH PDGM',
  });

  const statusColors = {
    processing: 'bg-blue-900/15 text-blue-400',
    validating: 'bg-yellow-900/15 text-yellow-400',
    completed: 'bg-emerald-900/15 text-emerald-400',
    completed_with_errors: 'bg-amber-900/15 text-amber-400',
    failed: 'bg-red-900/15 text-red-400',
    paused: 'bg-amber-900/15 text-amber-400',
    pausing: 'bg-amber-900/15 text-amber-300',
    cancelling: 'bg-orange-900/15 text-orange-400',
    cancelled: 'bg-slate-500/15 text-slate-400',
  };

  const uniqueTypes = useMemo(() => {
    const types = new Set(batches.map(b => b.import_type));
    return Array.from(types).sort();
  }, [batches]);

  const filtered = useMemo(() => {
    let result = [...batches].sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
    if (historyType !== 'all') result = result.filter(b => b.import_type === historyType);
    if (historySearch) {
      const q = historySearch.toLowerCase();
      result = result.filter(b =>
        (b.file_name || '').toLowerCase().includes(q) ||
        (b.import_type || '').toLowerCase().includes(q) ||
        (IMPORT_TYPE_LABELS[b.import_type] || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [batches, historyType, historySearch]);

  // Group by date
  const grouped = useMemo(() => {
    const groups = {};
    for (const b of filtered) {
      const d = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(b.created_date));
      if (!groups[d]) groups[d] = [];
      groups[d].push(b);
    }
    return groups;
  }, [filtered]);

  // Summary stats
  const stats = useMemo(() => {
    const total = batches.length;
    const completed = batches.filter(b => b.status === 'completed').length;
    const totalImported = batches.reduce((sum, b) => sum + (b.imported_rows || 0) + (b.updated_rows || 0), 0);
    const totalRecords = batches.reduce((sum, b) => {
      const rows = b.total_rows || ((b.imported_rows || 0) + (b.updated_rows || 0) + (b.skipped_rows || 0) + (b.invalid_rows || 0));
      return sum + rows;
    }, 0);
    return { total, completed, totalImported, totalRecords };
  }, [batches]);

  return (
    <>
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-[#141d30] border-slate-700/50">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-slate-400">Total Imports</p>
            <p className="text-2xl font-bold text-white">{stats.total}</p>
          </CardContent>
        </Card>
        <Card className="bg-[#141d30] border-slate-700/50">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-slate-400">Successful</p>
            <p className="text-2xl font-bold text-emerald-400">{stats.completed}</p>
          </CardContent>
        </Card>
        <Card className="bg-[#141d30] border-slate-700/50">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-slate-400">Records Imported</p>
            <p className="text-2xl font-bold text-blue-400">{stats.totalImported.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="bg-[#141d30] border-slate-700/50">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-slate-400">Records Processed</p>
            <p className="text-2xl font-bold text-slate-300">{stats.totalRecords.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>
      <p className="text-[11px] text-slate-500">Totals cover the 100 most recent imports only — they are partial, not lifetime figures.</p>

      {/* Filters */}
      <Card className="bg-[#141d30] border-slate-700/50">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-slate-200">Import History</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <Input
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="Search..."
                  aria-label="Search import history"
                  className="h-8 w-40 pl-7 text-xs bg-slate-800/50 border-slate-700 text-slate-300 placeholder:text-slate-400"
                />
              </div>
              <select
                className="text-xs border border-slate-700 rounded-md px-2 py-1.5 bg-slate-800/50 text-slate-300 h-8"
                value={historyType}
                onChange={(e) => setHistoryType(e.target.value)}
                aria-label="Import type"
              >
                <option value="all">All Types</option>
                {uniqueTypes.map(t => (
                  <option key={t} value={t}>{IMPORT_TYPE_LABELS[t] || t}</option>
                ))}
              </select>
              <Badge className="bg-slate-800 text-slate-400 text-xs">{filtered.length} imports</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <History className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="font-medium">No import history</p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(grouped).map(([date, items]) => (
                <div key={date}>
                  <p className="text-xs font-semibold text-slate-400 mb-2 sticky top-0 bg-[#141d30] py-1">{date}</p>
                  <div className="space-y-2">
                    {items.map(b => (
                      <div key={b.id} className="flex items-center gap-3 p-3 border border-slate-700/50 rounded-lg hover:bg-slate-800/30 transition-colors">
                        <Badge className={`${statusColors[b.status] || ''} text-[10px] w-20 justify-center`}>{b.status}</Badge>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-200 truncate">{IMPORT_TYPE_LABELS[b.import_type] || b.import_type}</p>
                          <p className="text-xs text-slate-400 truncate">{b.file_name}</p>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-slate-400 flex-shrink-0">
                          {b.imported_rows > 0 && <span className="text-blue-400">{b.imported_rows.toLocaleString()} new</span>}
                          {b.skipped_rows > 0 && <span className="text-amber-400">{b.skipped_rows.toLocaleString()} dupes</span>}
                          {b.total_rows > 0 && <span>{b.total_rows.toLocaleString()} fetched</span>}
                          <span className="w-24 text-right">{formatTimestamp(b.created_date).replace(/, \d{4}/, '')}</span>
                        </div>
                        {(b.tags || []).length > 0 && (
                          <div className="flex gap-1 flex-shrink-0">
                            {b.tags.slice(0, 2).map(t => (
                              <Badge key={t} className="bg-slate-700/50 text-slate-400 text-[9px]">{t}</Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

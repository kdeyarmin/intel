import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Play, Pause, XCircle, Globe, Bot, Map, LayoutGrid, Clock, AlertTriangle } from 'lucide-react';
import StateCrawlerGrid from '../components/nppes/StateCrawlerGrid';
import StateMap from '../components/nppes/StateMap';
import CurrentStateProgress from '../components/nppes/CurrentStateProgress';
import DataSourcesFooter from '../components/compliance/DataSourcesFooter';
import StateDetailSheet from '../components/nppes/StateDetailSheet';
import PageHeader from '../components/shared/PageHeader';
import { toast } from 'sonner';

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS',
  'KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY',
  'NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'
];

export default function NPPESCrawler() {
  const [dryRun, setDryRun] = useState(false);
  const [skipCompleted, setSkipCompleted] = useState(true);
  const [taxonomyFilter, setTaxonomyFilter] = useState('');
  const [entityType, setEntityType] = useState('');
  const [concurrency, setConcurrency] = useState('3');
  
  const [selectedState, setSelectedState] = useState(null);
  const [viewMode, setViewMode] = useState('map');
  const [isProcessingAction, setIsProcessingAction] = useState(false);
  const queryClient = useQueryClient();

  const { data: status, refetch: refetchStatus } = useQuery({
    queryKey: ['crawlerQueueStatus'],
    queryFn: async () => {
      const res = await base44.functions.invoke('nppesCrawler', { action: 'status' });
      return res.data;
    },
    refetchInterval: 10000,
  });

  const crawlerState = status?.crawler_status || 'idle';
  const isRunning = crawlerState === 'running';
  const isPaused = crawlerState === 'paused';
  const isIdle = crawlerState === 'idle';

  const handleAction = async (actionName, successMsg) => {
    setIsProcessingAction(true);
    try {
      const payload = { action: actionName };
      if (actionName === 'batch_start') {
        payload.concurrency = Number(concurrency);
        payload.dry_run = dryRun;
        payload.skip_completed = skipCompleted;
        if (taxonomyFilter) payload.taxonomy_description = taxonomyFilter;
        if (entityType && entityType !== 'all') payload.entity_type = entityType;
      }
      
      const res = await base44.functions.invoke('nppesCrawler', payload);
      if (res.data?.success) {
        toast.success(successMsg);
      } else {
        toast.error(res.data?.error || 'Action failed');
      }
    } catch (e) {
      toast.error(e.message);
    } finally {
      setIsProcessingAction(false);
      refetchStatus();
      queryClient.invalidateQueries(['nppesImportBatchesDash']);
    }
  };

  const startCrawler = () => {
    handleAction('batch_start', 'Crawler started successfully');
  };

  const pauseCrawler = () => {
    handleAction('batch_pause', 'Crawler paused');
  };

  const resumeCrawler = () => {
    handleAction('batch_resume', 'Crawler resumed');
  };

  const stopCrawler = () => {
    handleAction('batch_stop', 'Crawler stopped');
  };

  const completedCount = status?.completed || 0;
  const failedCount = status?.failed || 0;
  const processingCount = status?.processing || 0;
  const totalStates = US_STATES.length;
  const progress = ((completedCount + failedCount) / totalStates) * 100;
  
  // Estimate time (rough estimate: 2 mins per state / concurrency)
  const remainingStates = totalStates - (completedCount + failedCount);
  const estimatedMins = remainingStates > 0 ? Math.ceil((remainingStates * 2) / Number(concurrency)) : 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      <PageHeader
        title="NPPES Crawler Control Panel"
        subtitle="Manage the robust, queue-based crawler system"
        icon={Bot}
        breadcrumbs={[{ label: 'Admin' }, { label: 'NPPES Crawler' }]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="bg-white border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-slate-900 flex items-center justify-between">
                Crawler Configuration & Controls
                <Badge className={
                  isRunning ? "bg-green-100 text-green-700 hover:bg-green-100" : 
                  isPaused ? "bg-amber-100 text-amber-700 hover:bg-amber-100" : 
                  "bg-slate-100 text-slate-700 hover:bg-slate-100"
                }>
                  {isRunning ? 'Running' : isPaused ? 'Paused' : 'Idle'}
                </Badge>
              </CardTitle>
              <CardDescription className="text-slate-500">Queue-based architecture guarantees no timeouts and full state completion.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-slate-700">Concurrency (Workers)</Label>
                  <Select value={concurrency} onValueChange={setConcurrency} disabled={isRunning || isPaused}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {['1','2','3','4','5'].map(n => (
                        <SelectItem key={n} value={n}>{n} concurrent states</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label className="text-slate-700">Provider Type (Optional)</Label>
                  <Select value={entityType} onValueChange={setEntityType} disabled={isRunning || isPaused}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="NPI-1">Individual (NPI-1)</SelectItem>
                      <SelectItem value="NPI-2">Organization (NPI-2)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-6">
                <div className="flex items-center gap-3">
                  <Switch checked={dryRun} onCheckedChange={setDryRun} disabled={isRunning || isPaused} />
                  <span className="text-sm text-slate-700">{dryRun ? 'Dry Run (Testing)' : 'Live Import'}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={skipCompleted} onCheckedChange={setSkipCompleted} disabled={isRunning || isPaused} />
                  <span className="text-sm text-slate-700">Skip completed states</span>
                </div>
              </div>

              <div className="pt-4 flex flex-wrap gap-3 border-t">
                {(isIdle || isPaused) && (
                  <Button 
                    onClick={isPaused ? resumeCrawler : startCrawler} 
                    disabled={isProcessingAction}
                    className="bg-teal-600 hover:bg-teal-700 gap-2 min-w-[140px]"
                  >
                    {isProcessingAction ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    {isPaused ? 'Resume Crawler' : 'Start Crawler'}
                  </Button>
                )}

                {isRunning && (
                  <Button 
                    onClick={pauseCrawler} 
                    disabled={isProcessingAction}
                    variant="outline"
                    className="border-amber-500 text-amber-600 hover:bg-amber-50 gap-2 min-w-[140px]"
                  >
                    {isProcessingAction ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pause className="w-4 h-4" />}
                    Pause Crawler
                  </Button>
                )}

                {(isRunning || isPaused) && (
                  <Button 
                    onClick={stopCrawler} 
                    disabled={isProcessingAction}
                    variant="destructive"
                    className="gap-2 min-w-[140px]"
                  >
                    {isProcessingAction ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                    Stop & Cancel
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-slate-900 text-lg">
                <span className="flex items-center gap-2">
                  <Globe className="w-5 h-5 text-indigo-500" />
                  State Progress
                </span>
                <div className="flex items-center gap-3">
                  <div className="flex gap-2">
                    <Badge className="bg-emerald-100 text-emerald-700">{completedCount} completed</Badge>
                    {failedCount > 0 && <Badge className="bg-red-100 text-red-700">{failedCount} failed</Badge>}
                    <Badge className="bg-slate-100 text-slate-600">{status?.pending || 0} pending</Badge>
                  </div>
                  <div className="flex border rounded-md overflow-hidden bg-white">
                    <Button
                      variant={viewMode === 'map' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setViewMode('map')}
                      className="rounded-none h-7 px-2"
                    >
                      <Map className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant={viewMode === 'grid' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setViewMode('grid')}
                      className="rounded-none h-7 px-2"
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm font-medium text-slate-600">
                  <span>{completedCount + failedCount} / {totalStates} states</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} className="h-3 bg-slate-100" />
              </div>

              {viewMode === 'map' ? (
                <div className="pt-4 border-t">
                  <StateMap 
                    status={status} 
                    currentState={status?.processing_states?.[0]} 
                    running={isRunning} 
                    autoMode={true}
                    onStateClick={setSelectedState}
                  />
                </div>
              ) : (
                <div className="pt-4 border-t">
                  <StateCrawlerGrid 
                    status={status} 
                    currentState={status?.processing_states?.[0]} 
                    running={isRunning} 
                    autoMode={true}
                    onStateClick={setSelectedState}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="bg-white border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-slate-900 text-lg">Current Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-slate-50 rounded-lg border flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500 mb-1">States Processing</p>
                  <p className="text-2xl font-bold text-slate-900">{processingCount}</p>
                </div>
                <Bot className={`w-8 h-8 ${isRunning ? 'text-indigo-500 animate-pulse' : 'text-slate-300'}`} />
              </div>
              
              <div className="p-4 bg-slate-50 rounded-lg border flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500 mb-1">Est. Completion</p>
                  <p className="text-2xl font-bold text-slate-900">
                    {isRunning ? (estimatedMins > 60 ? `~${Math.round(estimatedMins/60)} hrs` : `~${estimatedMins} mins`) : '-'}
                  </p>
                </div>
                <Clock className="w-8 h-8 text-slate-400" />
              </div>

              {failedCount > 0 && (
                <div className="p-4 bg-red-50 rounded-lg border border-red-100 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-800">Errors Detected</p>
                    <p className="text-xs text-red-600 mt-1">{failedCount} states failed. Check Error Reports in Data Quality.</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <DataSourcesFooter />
      
      <StateDetailSheet 
        stateCode={selectedState} 
        isOpen={!!selectedState} 
        onClose={() => setSelectedState(null)} 
      />
    </div>
  );
}
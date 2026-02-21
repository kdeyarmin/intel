import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Play, Pause, RotateCcw, XCircle, Globe, Bot, Zap, Monitor, Layers } from 'lucide-react';
import StateCrawlerGrid from '../components/nppes/StateCrawlerGrid';
import CrawlerLog from '../components/nppes/CrawlerLog';
import BatchProcessPanel from '../components/nppes/BatchProcessPanel';
import DataSourcesFooter from '../components/compliance/DataSourcesFooter';
import StateDetailSheet from '../components/nppes/StateDetailSheet';

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS',
  'KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY',
  'NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'
];

export default function NPPESCrawler() {
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [dryRun, setDryRun] = useState(false);
  const [ignoreHistory, setIgnoreHistory] = useState(false);
  const [taxonomyFilter, setTaxonomyFilter] = useState('');
  const [entityType, setEntityType] = useState('');
  const [currentState, setCurrentState] = useState(null);
  const [logs, setLogs] = useState([]);
  const [status, setStatus] = useState(null);
  const [autoMode, setAutoMode] = useState(false); // server-side auto-chain mode
  const [autoStarting, setAutoStarting] = useState(false);
  const [autoStopping, setAutoStopping] = useState(false);
  const [selectedState, setSelectedState] = useState(null);
  const pausedRef = useRef(false);
  const runningRef = useRef(false);
  const queryClient = useQueryClient();

  // Fetch current status (poll during both manual and auto modes)
  const { data: crawlStatus, refetch: refetchStatus } = useQuery({
    queryKey: ['crawlerStatus'],
    queryFn: async () => {
      const res = await base44.functions.invoke('nppesAutoChainCrawler', { action: 'status' });
      return res.data;
    },
    refetchInterval: (running || autoMode) ? 10000 : 30000,
  });

  useEffect(() => {
    if (crawlStatus) {
      setStatus(crawlStatus);
      // Detect if auto-chain is active on page load
      if (crawlStatus.auto_chain_active && !autoMode && !running) {
        setAutoMode(true);
      } else if (!crawlStatus.auto_chain_active && autoMode && crawlStatus.pending === 0) {
        setAutoMode(false);
      }
    }
  }, [crawlStatus]);

  const addLog = (message, type = 'info') => {
    setLogs(prev => [...prev, { message, type, time: new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }) }].slice(-100));
  };

  const processNextState = async () => {
    if (pausedRef.current || !runningRef.current) return false;

    try {
      const res = await base44.functions.invoke('nppesStateCrawler', {
        action: 'start',
        taxonomy_description: taxonomyFilter,
        entity_type: entityType,
        dry_run: dryRun,
        ignore_history: ignoreHistory,
      });

      const data = res.data;

      if (data.done && data.success !== false && !data.state) {
        addLog('All states have been processed!', 'success');
        return false;
      }

      setCurrentState(data.state);

      if (data.success) {
        addLog(
          `✓ ${data.state}: ${data.valid_rows} valid, ${data.imported_providers || 0} imported${dryRun ? ' (dry run)' : ''}`,
          'success'
        );
      } else {
        addLog(`✗ ${data.state}: ${data.error}`, 'error');
      }

      refetchStatus();
      queryClient.invalidateQueries(['nppesImportBatches']);

      if (data.done) {
        addLog('All states have been processed!', 'success');
        return false;
      }

      return true;
    } catch (err) {
      const msg = err.message || '';
      const isTimeout = /timeout|502|504|500|network|aborted|ECONNRESET|failed to fetch/i.test(msg);
      if (isTimeout) {
        addLog(`⏱ State crawler timed out — this is normal for large states. Continuing...`, 'info');
        refetchStatus();
        return true; // Keep the loop going — the state saved progress and next call resumes or moves on
      }
      addLog(`Error: ${msg} — retrying next state...`, 'error');
      refetchStatus();
      return true; // Don't stop the loop on errors — try the next state
    }
  };

  const startCrawl = async () => {
    setRunning(true);
    setPaused(false);
    runningRef.current = true;
    pausedRef.current = false;
    addLog(`Starting NPPES state crawler${dryRun ? ' (DRY RUN)' : ''}...`, 'info');
    addLog(`Filters: ${taxonomyFilter || 'All specialties'}, ${entityType || 'All types'}`, 'info');

    let hasMore = true;
    while (hasMore && runningRef.current && !pausedRef.current) {
      hasMore = await processNextState();
      // Small delay between states to avoid hammering the API
      if (hasMore) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    if (!pausedRef.current) {
      setRunning(false);
      runningRef.current = false;
      addLog('Crawler finished.', 'info');
    }
  };

  const pauseCrawl = () => {
    setPaused(true);
    pausedRef.current = true;
    addLog('Crawler paused.', 'info');
  };

  const resumeCrawl = async () => {
    setPaused(false);
    pausedRef.current = false;
    addLog('Crawler resumed.', 'info');

    let hasMore = true;
    while (hasMore && runningRef.current && !pausedRef.current) {
      hasMore = await processNextState();
      if (hasMore) await new Promise(r => setTimeout(r, 2000));
    }

    if (!pausedRef.current) {
      setRunning(false);
      runningRef.current = false;
      addLog('Crawler finished.', 'info');
    }
  };

  const stopCrawl = () => {
    setRunning(false);
    setPaused(false);
    runningRef.current = false;
    pausedRef.current = false;
    setCurrentState(null);
    addLog('Crawler stopped.', 'info');
  };

  const resetCrawler = async () => {
    if (!confirm('Are you sure you want to reset the crawler history? This will clear all progress indicators (but NOT the imported providers).')) return;
    
    addLog('Resetting crawler history...', 'info');
    try {
      const res = await base44.functions.invoke('nppesStateCrawler', { action: 'reset' });
      addLog(res.data?.message || 'Reset complete', 'success');
      refetchStatus();
      queryClient.invalidateQueries(['crawlerStatus']);
    } catch (err) {
      addLog(`Reset failed: ${err.message}`, 'error');
    }
  };

  // --- Auto-chain (server-side) controls ---
  const startAutoChain = async () => {
    setAutoStarting(true);
    addLog('Starting server-side auto-crawler...', 'info');
    addLog(`Filters: ${taxonomyFilter || 'All specialties'}, ${entityType || 'All types'}`, 'info');
    try {
      const res = await base44.functions.invoke('nppesAutoChainCrawler', {
        action: 'start',
        taxonomy_description: taxonomyFilter,
        entity_type: entityType,
        dry_run: dryRun,
      });
      const data = res.data;
      setAutoMode(true);
      addLog(`Auto-crawler started. Processing ${data.state_just_processed || 'next state'}...`, 'success');
      refetchStatus();
    } catch (err) {
      addLog(`Failed to start auto-crawler: ${err.message}`, 'error');
    } finally {
      setAutoStarting(false);
    }
  };

  const stopAutoChain = async () => {
    setAutoStopping(true);
    addLog('Sending stop signal to auto-crawler...', 'info');
    try {
      const res = await base44.functions.invoke('nppesAutoChainCrawler', { action: 'stop' });
      addLog(res.data?.message || 'Stop signal sent', 'info');
      setAutoMode(false);
      refetchStatus();
    } catch (err) {
      addLog(`Failed to stop auto-crawler: ${err.message}`, 'error');
    } finally {
      setAutoStopping(false);
    }
  };

  const completedCount = status?.completed || 0;
  const failedCount = status?.failed || 0;
  const totalStates = US_STATES.length;
  const progress = ((completedCount + failedCount) / totalStates) * 100;

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
          <Bot className="w-8 h-8 text-teal-600" />
          NPPES State Crawler
        </h1>
        <p className="text-gray-600 mt-1">
          Automatically pull all providers from the NPPES registry, one state at a time
        </p>
      </div>

      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Crawler Controls</CardTitle>
          <CardDescription>Configure filters and start the crawl. The bot processes one state at a time sequentially.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Specialty Filter (optional)</Label>
              <Input
                placeholder="e.g., Internal Medicine"
                value={taxonomyFilter}
                onChange={(e) => setTaxonomyFilter(e.target.value)}
                disabled={running}
              />
            </div>
            <div className="space-y-2">
              <Label>Provider Type</Label>
              <Select value={entityType} onValueChange={setEntityType} disabled={running}>
                <SelectTrigger>
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>All Types</SelectItem>
                  <SelectItem value="NPI-1">Individual (NPI-1)</SelectItem>
                  <SelectItem value="NPI-2">Organization (NPI-2)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Mode</Label>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3 h-9">
                  <Switch checked={dryRun} onCheckedChange={setDryRun} disabled={running} />
                  <span className="text-sm text-gray-600">{dryRun ? 'Dry Run' : 'Live Import'}</span>
                </div>
                <div className="flex items-center gap-3 h-9">
                  <Switch checked={ignoreHistory} onCheckedChange={setIgnoreHistory} disabled={running} />
                  <span className="text-sm text-gray-600">Force Re-crawl (Ignore completed)</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            {/* Manual (browser-based) controls */}
            <div className="flex gap-2 items-center">
              <Monitor className="w-4 h-4 text-gray-400" />
              <span className="text-xs text-gray-500 mr-1">Manual:</span>
              {!running ? (
                <Button onClick={startCrawl} className="bg-teal-600 hover:bg-teal-700 gap-2" disabled={autoMode}>
                  <Play className="w-4 h-4" />
                  Start Crawl
                </Button>
              ) : (
                <>
                  {paused ? (
                    <Button onClick={resumeCrawl} className="bg-teal-600 hover:bg-teal-700 gap-2">
                      <Play className="w-4 h-4" />
                      Resume
                    </Button>
                  ) : (
                    <Button onClick={pauseCrawl} variant="outline" className="gap-2">
                      <Pause className="w-4 h-4" />
                      Pause
                    </Button>
                  )}
                  <Button onClick={stopCrawl} variant="destructive" className="gap-2">
                    <XCircle className="w-4 h-4" />
                    Stop
                  </Button>
                </>
              )}
            </div>

            <div className="w-px bg-gray-200 mx-1 self-stretch" />

            {/* Automated (server-side) controls */}
            <div className="flex gap-2 items-center">
              <Zap className="w-4 h-4 text-amber-500" />
              <span className="text-xs text-gray-500 mr-1">Auto:</span>
              {!autoMode ? (
                <Button
                  onClick={startAutoChain}
                  disabled={running || autoStarting}
                  className="bg-amber-600 hover:bg-amber-700 gap-2"
                >
                  {autoStarting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  Start Auto-Crawler
                </Button>
              ) : (
                <Button
                  onClick={stopAutoChain}
                  disabled={autoStopping}
                  variant="destructive"
                  className="gap-2"
                >
                  {autoStopping ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                  Stop Auto-Crawler
                </Button>
              )}
            </div>

            <Button onClick={refetchStatus} variant="outline" className="gap-2">
              <RotateCcw className="w-4 h-4" />
              Refresh Status
            </Button>

            <Button onClick={resetCrawler} variant="outline" className="gap-2 border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800">
              <RotateCcw className="w-4 h-4" />
              Reset History
            </Button>
          </div>

          {autoMode && (
            <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 p-3 rounded-lg mt-2">
              <Zap className="w-4 h-4" />
              <span><strong>Auto-crawler is running server-side.</strong></span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Batch Process */}
      <BatchProcessPanel
        taxonomyFilter={taxonomyFilter}
        entityType={entityType}
        dryRun={dryRun}
        onLog={addLog}
        onRefresh={refetchStatus}
      />

      {/* Progress */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-teal-600" />
              Progress
            </span>
            <div className="flex gap-2">
              <Badge className="bg-green-100 text-green-800">{completedCount} completed</Badge>
              {failedCount > 0 && <Badge className="bg-red-100 text-red-800">{failedCount} failed</Badge>}
              <Badge variant="outline">{status?.pending || 0} pending</Badge>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>{completedCount + failedCount} / {totalStates} states</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-3" />
          </div>

          {currentState && running && (
            <div className="flex items-center gap-2 text-sm text-teal-700 bg-teal-50 p-3 rounded-lg">
              <Loader2 className="w-4 h-4 animate-spin" />
              Currently processing: <strong>{currentState}</strong>
            </div>
          )}

          <StateCrawlerGrid 
            status={status} 
            currentState={currentState} 
            running={running} 
            onStateClick={setSelectedState}
          />
        </CardContent>
      </Card>

      {/* Log */}
      <CrawlerLog logs={logs} />

      <DataSourcesFooter />
      
      <StateDetailSheet 
        stateCode={selectedState} 
        isOpen={!!selectedState} 
        onClose={() => setSelectedState(null)} 
      />
    </div>
  );
}
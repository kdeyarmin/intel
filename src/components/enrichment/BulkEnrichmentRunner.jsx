import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Sparkles, Loader2, CheckCircle2, XCircle, AlertTriangle, Database, StopCircle } from 'lucide-react';

export default function BulkEnrichmentRunner({ totalProviders = 0 }) {
  const [autoApply, setAutoApply] = useState(false);
  const [batchSize, setBatchSize] = useState(10);

  const [candidateStats, setCandidateStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [job, setJob] = useState(null);
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    loadStats();
    pollJobStatus();
  }, []);

  useEffect(() => {
    if (!polling) return;
    const interval = setInterval(pollJobStatus, 3000);
    return () => clearInterval(interval);
  }, [polling]);

  const loadStats = async () => {
    try {
      const res = await base44.functions.invoke('getEnrichmentCandidateCount');
      setCandidateStats(res.data);
    } catch (e) {
      console.warn('Could not fetch candidate count:', e.message);
    }
    setLoadingStats(false);
  };

  const pollJobStatus = async () => {
    try {
      const res = await base44.functions.invoke('enrichmentJobStatus');
      const j = res.data?.job;
      setJob(j);
      if (j?.status === 'running' || j?.status === 'stopping') {
        setPolling(true);
      } else {
        setPolling(false);
        if (j?.status === 'completed' || j?.status === 'idle') {
          loadStats();
        }
      }
    } catch (e) {
      console.warn('Could not fetch job status:', e.message);
    }
  };

  const handleStart = async () => {
    try {
      const res = await base44.functions.invoke('enrichmentJobStart', {
        batch_size: batchSize,
        auto_apply_high_confidence: autoApply,
      });
      setJob(res.data?.job);
      setPolling(true);
    } catch (err) {
      console.error('Failed to start enrichment:', err);
    }
  };

  const handleStop = async () => {
    try {
      const res = await base44.functions.invoke('enrichmentJobStop');
      setJob(res.data?.job);
    } catch (err) {
      console.error('Failed to stop enrichment:', err);
    }
  };

  const isRunning = job?.status === 'running' || job?.status === 'stopping';
  const isCompleted = job?.status === 'completed';
  const unenrichedCount = candidateStats?.unenrichedCount || 0;
  const enrichedCount = candidateStats?.enrichedCount || 0;
  const displayTotal = candidateStats?.totalProviders || totalProviders;

  return (
    <Card className="bg-[#141d30] border-slate-700/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          <Database className="w-4 h-4 text-cyan-400" />
          Third-Party Data Enrichment
          {isRunning && (
            <span className="flex items-center gap-1 ml-auto">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] text-emerald-400 font-normal">Running in background</span>
            </span>
          )}
          {isCompleted && (
            <span className="flex items-center gap-1 ml-auto">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              <span className="text-[10px] text-emerald-400 font-normal">Completed</span>
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-slate-400">
          Runs as a background server job — continues even when you navigate away.
        </p>

        <div className="bg-slate-800/40 rounded-lg p-3 space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">Unenriched providers</span>
            <span className="font-semibold text-cyan-400">
              {loadingStats ? '...' : unenrichedCount.toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">Already enriched</span>
            <span className="font-semibold text-emerald-400">
              {loadingStats ? '...' : enrichedCount.toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">Total providers</span>
            <span className="font-semibold text-slate-300">
              {loadingStats ? '...' : displayTotal.toLocaleString()}
            </span>
          </div>
          {!loadingStats && displayTotal > 0 && (
            <div className="mt-1">
              <Progress value={(enrichedCount / displayTotal) * 100} className="h-1.5" />
              <p className="text-[10px] text-slate-500 mt-1 text-right">
                {((enrichedCount / displayTotal) * 100).toFixed(2)}% enriched
              </p>
            </div>
          )}
        </div>

        {!isRunning && (
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-slate-400">Batch size (providers per round)</Label>
              <select
                className="w-full mt-1 text-xs bg-slate-800/50 border border-slate-700 rounded-md px-2 py-1.5 text-slate-300"
                value={batchSize}
                onChange={e => setBatchSize(Number(e.target.value))}
              >
                <option value={5}>5 providers</option>
                <option value={10}>10 providers</option>
                <option value={25}>25 providers</option>
                <option value={50}>50 providers</option>
              </select>
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-xs text-slate-400">Auto-apply high confidence results</Label>
              <Switch checked={autoApply} onCheckedChange={setAutoApply} />
            </div>
          </div>
        )}

        {job && (job.enriched > 0 || job.total > 0) && (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-emerald-900/10 rounded-lg p-2 text-center">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
                <p className="text-lg font-bold text-emerald-400">{job.enriched}</p>
                <p className="text-[9px] text-slate-500">Enriched</p>
              </div>
              <div className="bg-slate-500/10 rounded-lg p-2 text-center">
                <AlertTriangle className="w-4 h-4 text-slate-400 mx-auto mb-1" />
                <p className="text-lg font-bold text-slate-400">{job.noData}</p>
                <p className="text-[9px] text-slate-500">No Data</p>
              </div>
              <div className="bg-red-900/10 rounded-lg p-2 text-center">
                <XCircle className="w-4 h-4 text-red-400 mx-auto mb-1" />
                <p className="text-lg font-bold text-red-400">{job.errors}</p>
                <p className="text-[9px] text-slate-500">Errors</p>
              </div>
            </div>
            {job.message && (
              <p className="text-xs text-slate-400 text-center">{job.message}</p>
            )}
            {job.startedAt && (
              <p className="text-[10px] text-slate-600 text-center">
                Started: {new Date(job.startedAt).toLocaleTimeString()}
                {job.lastBatchAt && ` | Last batch: ${new Date(job.lastBatchAt).toLocaleTimeString()}`}
              </p>
            )}
          </div>
        )}

        {isRunning && (
          <div className="flex items-center gap-2 justify-center">
            <Loader2 className="w-3 h-3 animate-spin text-violet-400" />
            <p className="text-[10px] text-slate-500">
              {job?.status === 'stopping' ? 'Stopping after current batch...' : `Processing... ${job?.total || 0} providers done`}
            </p>
          </div>
        )}

        <div className="flex gap-2">
          {!isRunning ? (
            <Button
              onClick={handleStart}
              disabled={loadingStats || unenrichedCount === 0}
              className="flex-1 bg-violet-600 hover:bg-violet-700 gap-2"
            >
              <Sparkles className="w-4 h-4" />
              {loadingStats ? 'Loading...' : 'Start Background Enrichment'}
            </Button>
          ) : (
            <Button
              onClick={handleStop}
              disabled={job?.status === 'stopping'}
              variant="destructive"
              className="flex-1 gap-1"
            >
              <StopCircle className="w-4 h-4" />
              {job?.status === 'stopping' ? 'Stopping...' : 'Stop Enrichment'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

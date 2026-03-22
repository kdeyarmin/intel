import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Sparkles, Loader2, CheckCircle2, XCircle, AlertTriangle, Database, StopCircle } from 'lucide-react';

export default function BulkEnrichmentRunner({ totalProviders = 0 }) {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [progress, setProgress] = useState({ enriched: 0, noData: 0, errors: 0, total: 0 });
  const [autoApply, setAutoApply] = useState(false);
  const [batchSize, setBatchSize] = useState(10);
  const [enrichAll, setEnrichAll] = useState(false);
  const [maxBatches, setMaxBatches] = useState(5);
  const stopRef = useRef(false);

  const [candidateStats, setCandidateStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await base44.functions.invoke('getEnrichmentCandidateCount');
        setCandidateStats(res.data);
      } catch (e) {
        console.warn('Could not fetch candidate count:', e.message);
      }
      setLoadingStats(false);
    })();
  }, [running]);

  const unenrichedCount = candidateStats?.unenrichedCount || 0;
  const enrichedCount = candidateStats?.enrichedCount || 0;
  const displayTotal = candidateStats?.totalProviders || totalProviders;

  const handleRun = async () => {
    stopRef.current = false;
    setRunning(true);
    setResults(null);
    const agg = { enriched: 0, no_data: 0, errors: 0, total: 0 };
    setProgress({ enriched: 0, noData: 0, errors: 0, total: 0 });

    const batchLimit = enrichAll ? 999999 : maxBatches;
    let batchesDone = 0;

    try {
      while (batchesDone < batchLimit && !stopRef.current) {
        const res = await base44.functions.invoke('enrichBulkServerSide', {
          batch_size: batchSize,
          auto_apply_high_confidence: autoApply,
        });

        const d = res.data || {};
        agg.enriched += d.enriched || 0;
        agg.no_data += d.no_data || 0;
        agg.errors += d.errors || 0;
        agg.total += d.total || 0;
        batchesDone++;

        setProgress({
          enriched: agg.enriched,
          noData: agg.no_data,
          errors: agg.errors,
          total: agg.total,
        });

        if (!d.hasMore || d.total === 0) break;
      }

      setResults({
        ...agg,
        message: stopRef.current
          ? `Stopped after enriching ${agg.enriched} providers`
          : `Enriched ${agg.enriched} of ${agg.total} providers`,
      });
    } catch (err) {
      setResults({
        ...agg,
        message: `Error after ${agg.enriched} enrichments: ${err.message}`,
      });
    } finally {
      setRunning(false);
    }
  };

  const handleStop = () => {
    stopRef.current = true;
  };

  return (
    <Card className="bg-[#141d30] border-slate-700/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          <Database className="w-4 h-4 text-cyan-400" />
          Third-Party Data Enrichment
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-slate-400">
          Enrich provider records with affiliations, group memberships, review scores, and more using AI-powered analysis across the full provider database.
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
            <span className="text-slate-400">Total providers in database</span>
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

        <div className="space-y-3">
          <div>
            <Label className="text-xs text-slate-400">Batch size (providers per API call)</Label>
            <select
              className="w-full mt-1 text-xs bg-slate-800/50 border border-slate-700 rounded-md px-2 py-1.5 text-slate-300"
              value={batchSize}
              onChange={e => setBatchSize(Number(e.target.value))}
              disabled={running}
            >
              <option value={5}>5 providers</option>
              <option value={10}>10 providers</option>
              <option value={25}>25 providers</option>
              <option value={50}>50 providers</option>
            </select>
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-xs text-slate-400">Run continuously</Label>
            <Switch checked={enrichAll} onCheckedChange={setEnrichAll} disabled={running} />
          </div>

          {!enrichAll && (
            <div>
              <Label className="text-xs text-slate-400">Number of batches</Label>
              <select
                className="w-full mt-1 text-xs bg-slate-800/50 border border-slate-700 rounded-md px-2 py-1.5 text-slate-300"
                value={maxBatches}
                onChange={e => setMaxBatches(Number(e.target.value))}
                disabled={running}
              >
                <option value={1}>1 batch ({batchSize} providers)</option>
                <option value={5}>5 batches ({5 * batchSize} providers)</option>
                <option value={10}>10 batches ({10 * batchSize} providers)</option>
                <option value={25}>25 batches ({25 * batchSize} providers)</option>
                <option value={50}>50 batches ({50 * batchSize} providers)</option>
              </select>
            </div>
          )}

          <div className="flex items-center justify-between">
            <Label className="text-xs text-slate-400">Auto-apply high confidence results</Label>
            <Switch checked={autoApply} onCheckedChange={setAutoApply} disabled={running} />
          </div>
        </div>

        {results && (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-emerald-900/10 rounded-lg p-2 text-center">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
                <p className="text-lg font-bold text-emerald-400">{results.enriched}</p>
                <p className="text-[9px] text-slate-500">Enriched</p>
              </div>
              <div className="bg-slate-500/10 rounded-lg p-2 text-center">
                <AlertTriangle className="w-4 h-4 text-slate-400 mx-auto mb-1" />
                <p className="text-lg font-bold text-slate-400">{results.no_data}</p>
                <p className="text-[9px] text-slate-500">No Data</p>
              </div>
              <div className="bg-red-900/10 rounded-lg p-2 text-center">
                <XCircle className="w-4 h-4 text-red-400 mx-auto mb-1" />
                <p className="text-lg font-bold text-red-400">{results.errors}</p>
                <p className="text-[9px] text-slate-500">Errors</p>
              </div>
            </div>
            <p className="text-xs text-slate-400 text-center">{results.message}</p>
          </div>
        )}

        {running && (
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-slate-400">
              <span>Enriched: {progress.enriched}</span>
              <span>No data: {progress.noData}</span>
              <span>Errors: {progress.errors}</span>
            </div>
            <div className="flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin text-violet-400" />
              <p className="text-[10px] text-slate-500">
                Processing batch... ({progress.total} providers processed so far)
              </p>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Button
            onClick={handleRun}
            disabled={running || loadingStats || unenrichedCount === 0}
            className="flex-1 bg-violet-600 hover:bg-violet-700 gap-2"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {loadingStats ? 'Loading...' : running ? 'Enriching...' : enrichAll ? 'Run Continuous Enrichment' : `Enrich ${Math.min(maxBatches * batchSize, unenrichedCount).toLocaleString()} Providers`}
          </Button>
          {running && (
            <Button
              onClick={handleStop}
              variant="destructive"
              className="gap-1"
            >
              <StopCircle className="w-4 h-4" />
              Stop
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

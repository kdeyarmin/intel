import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Sparkles, Loader2, CheckCircle2, XCircle, AlertTriangle, Database } from 'lucide-react';

export default function BulkEnrichmentRunner({ providers = [], totalProviders = 0 }) {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [autoApply, setAutoApply] = useState(false);
  const [batchSize, setBatchSize] = useState(10);
  const [skipAlreadyChecked, setSkipAlreadyChecked] = useState(true);
  const [enrichAll, setEnrichAll] = useState(false);

  const [alreadyEnrichedNPIs, setAlreadyEnrichedNPIs] = useState(new Set());
  const [loadedExisting, setLoadedExisting] = useState(false);

  // Load already-enriched NPIs on mount so we can skip them
  React.useEffect(() => {
    (async () => {
      try {
        const existing = await base44.entities.EnrichmentRecord.filter({ field_name: 'enrichment_details' });
        setAlreadyEnrichedNPIs(new Set(existing.map(r => r.npi)));
      } catch (e) { console.warn('Could not fetch existing enrichments:', e.message); }
      setLoadedExisting(true);
    })();
  }, []);

  const unenrichedProviders = skipAlreadyChecked
    ? providers.filter(p => (!p.email || p.needs_nppes_enrichment) && !alreadyEnrichedNPIs.has(p.npi))
    : providers.filter(p => !p.email || p.needs_nppes_enrichment);

  const handleRun = async () => {
    const npis = enrichAll
      ? unenrichedProviders.map(p => p.npi)
      : unenrichedProviders.map(p => p.npi).slice(0, batchSize);

    if (npis.length === 0) {
      setResults({ enriched: 0, no_data: 0, errors: 0, total: 0, message: 'All providers in this sample have already been enriched' });
      return;
    }

    setRunning(true);
    setProgress({ current: 0, total: npis.length });
    setResults(null);

    // Process in chunks to avoid timeouts on large "enrich all" runs
    const CHUNK_SIZE = 25;
    let aggregated = { enriched: 0, no_data: 0, errors: 0, total: 0 };

    for (let i = 0; i < npis.length; i += CHUNK_SIZE) {
      const chunk = npis.slice(i, i + CHUNK_SIZE);
      setProgress({ current: i, total: npis.length });

      const res = await base44.functions.invoke('enrichProviderThirdParty', {
        npis: chunk,
        batch_size: chunk.length,
        auto_apply_high_confidence: autoApply,
      });

      const d = res.data || {};
      aggregated.enriched += d.enriched || 0;
      aggregated.no_data += d.no_data || 0;
      aggregated.errors += d.errors || 0;
      aggregated.total += d.total || 0;
    }

    // Update local set so the next run skips these too
    setAlreadyEnrichedNPIs(prev => {
      const next = new Set(prev);
      npis.forEach(n => next.add(n));
      return next;
    });

    setResults(aggregated);
    setRunning(false);
  };

  const needEnrichment = unenrichedProviders.length;
  const displayTotal = totalProviders || providers.length;

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
          Enrich provider records with affiliations, group memberships, review scores, and more from NPPES and public directories.
        </p>

        <div className="bg-slate-800/40 rounded-lg p-3 space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">Candidates in sample</span>
            <span className="font-semibold text-cyan-400">{needEnrichment.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">Already checked</span>
            <span className="font-semibold text-slate-400">{alreadyEnrichedNPIs.size.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">Total providers in database</span>
            <span className="font-semibold text-slate-300">{displayTotal.toLocaleString()}</span>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-slate-400">Skip already checked</Label>
            <Switch checked={skipAlreadyChecked} onCheckedChange={setSkipAlreadyChecked} />
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-xs text-slate-400">Enrich all candidates</Label>
            <Switch checked={enrichAll} onCheckedChange={setEnrichAll} />
          </div>

          {!enrichAll && (
            <div>
              <Label className="text-xs text-slate-400">Batch size</Label>
              <select
                className="w-full mt-1 text-xs bg-slate-800/50 border border-slate-700 rounded-md px-2 py-1.5 text-slate-300"
                value={batchSize}
                onChange={e => setBatchSize(Number(e.target.value))}
              >
                <option value={5}>5 providers</option>
                <option value={10}>10 providers</option>
                <option value={25}>25 providers</option>
                <option value={50}>50 providers</option>
                <option value={100}>100 providers</option>
              </select>
            </div>
          )}

          <div className="flex items-center justify-between">
            <Label className="text-xs text-slate-400">Auto-apply high confidence results</Label>
            <Switch checked={autoApply} onCheckedChange={setAutoApply} />
          </div>
        </div>

        {results && (
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-emerald-500/10 rounded-lg p-2 text-center">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
              <p className="text-lg font-bold text-emerald-400">{results.enriched}</p>
              <p className="text-[9px] text-slate-500">Enriched</p>
            </div>
            <div className="bg-slate-500/10 rounded-lg p-2 text-center">
              <AlertTriangle className="w-4 h-4 text-slate-400 mx-auto mb-1" />
              <p className="text-lg font-bold text-slate-400">{results.no_data}</p>
              <p className="text-[9px] text-slate-500">No Data</p>
            </div>
            <div className="bg-red-500/10 rounded-lg p-2 text-center">
              <XCircle className="w-4 h-4 text-red-400 mx-auto mb-1" />
              <p className="text-lg font-bold text-red-400">{results.errors}</p>
              <p className="text-[9px] text-slate-500">Errors</p>
            </div>
          </div>
        )}

        {running && (
          <div className="space-y-2">
            <Progress value={progress.total > 0 ? (progress.current / progress.total) * 100 : 0} className="h-2" />
            <p className="text-[10px] text-slate-500 text-center">
              Processing {progress.current}/{progress.total} providers...
            </p>
          </div>
        )}

        <Button
          onClick={handleRun}
          disabled={running || !loadedExisting || needEnrichment === 0}
          className="w-full bg-violet-600 hover:bg-violet-700 gap-2"
        >
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {!loadedExisting ? 'Loading...' : running ? 'Enriching...' : enrichAll ? `Enrich All ${needEnrichment.toLocaleString()} Candidates` : `Enrich ${Math.min(batchSize, needEnrichment)} Providers`}
        </Button>
      </CardContent>
    </Card>
  );
}
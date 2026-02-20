import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Sparkles, Loader2, CheckCircle2, XCircle, AlertTriangle, Database } from 'lucide-react';

export default function BulkEnrichmentRunner({ providers = [] }) {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [autoApply, setAutoApply] = useState(false);
  const [batchSize, setBatchSize] = useState(10);

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

  const unenrichedProviders = providers.filter(
    p => (!p.email || p.needs_nppes_enrichment) && !alreadyEnrichedNPIs.has(p.npi)
  );

  const handleRun = async () => {
    const npis = unenrichedProviders.map(p => p.npi).slice(0, batchSize);
    if (npis.length === 0) {
      setResults({ enriched: 0, no_data: 0, errors: 0, total: 0, message: 'All providers have already been enriched' });
      return;
    }

    setRunning(true);
    setProgress({ current: 0, total: npis.length });
    setResults(null);

    const res = await base44.functions.invoke('enrichProviderThirdParty', {
      npis,
      batch_size: batchSize,
      auto_apply_high_confidence: autoApply,
    });

    // Update local set so the next run skips these too
    setAlreadyEnrichedNPIs(prev => {
      const next = new Set(prev);
      npis.forEach(n => next.add(n));
      return next;
    });

    setResults(res.data);
    setRunning(false);
  };

  const needEnrichment = unenrichedProviders.length;

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
            <span className="text-slate-400">Providers needing enrichment</span>
            <span className="font-semibold text-cyan-400">{needEnrichment.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">Total providers</span>
            <span className="font-semibold text-slate-300">{providers.length.toLocaleString()}</span>
          </div>
        </div>

        <div className="space-y-3">
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
            </select>
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-xs text-slate-400">Auto-apply high confidence results</Label>
            <Switch checked={autoApply} onCheckedChange={setAutoApply} />
          </div>
        </div>

        {running && (
          <div className="space-y-2">
            <Progress value={50} className="h-2" />
            <p className="text-[10px] text-slate-500 text-center">Enriching providers... This may take a moment.</p>
          </div>
        )}

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

        <Button
          onClick={handleRun}
          disabled={running || needEnrichment === 0}
          className="w-full bg-violet-600 hover:bg-violet-700 gap-2"
        >
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {!loadedExisting ? 'Loading...' : running ? 'Enriching...' : `Enrich ${Math.min(batchSize, needEnrichment)} Providers`}
        </Button>
      </CardContent>
    </Card>
  );
}
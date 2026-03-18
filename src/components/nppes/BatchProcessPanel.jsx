import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Layers, XCircle, Play, CheckCircle2, AlertCircle } from 'lucide-react';

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS',
  'KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY',
  'NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'
];

const REGION_LABELS = {
  northeast: 'Northeast (12 states)',
  southeast: 'Southeast (12 states)',
  midwest: 'Midwest (12 states)',
  west: 'West (13 states)',
  south_central: 'South Central (4 states)',
};

export default function BatchProcessPanel({ taxonomyFilter, entityType, dryRun, onLog, onRefresh }) {
  const [selectionMode, setSelectionMode] = useState('region');
  const [selectedRegion, setSelectedRegion] = useState('');
  const [selectedStates, setSelectedStates] = useState([]);
  const [concurrency, setConcurrency] = useState('3');
  const [skipCompleted, setSkipCompleted] = useState(true);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchStopping, setBatchStopping] = useState(false);
  const [batchResults, setBatchResults] = useState(null);
  const [regionStates, setRegionStates] = useState({});

  useEffect(() => {
    const loadRegions = async () => {
      try {
        const res = await base44.functions.invoke('nppesCrawler', { action: 'batch_status' });
        if (res.data?.regions) setRegionStates(res.data.regions);
      } catch (_e) { /* ignore */ }
    };
    loadRegions();
  }, []);

  const toggleState = (st) => {
    setSelectedStates(prev =>
      prev.includes(st) ? prev.filter(s => s !== st) : [...prev, st]
    );
  };

  const selectAll = () => setSelectedStates([...US_STATES]);
  const clearAll = () => setSelectedStates([]);

  const getStatesForBatch = () => {
    if (selectionMode === 'region' && selectedRegion) {
      return regionStates[selectedRegion] || [];
    }
    if (selectionMode === 'custom') return selectedStates;
    return [];
  };

  const startBatch = async () => {
    const targetStates = getStatesForBatch();
    if (targetStates.length === 0 && selectionMode !== 'all') {
      onLog?.('Please select states or a region first.', 'error');
      return;
    }

    setBatchRunning(true);
    setBatchResults(null);
    const label = selectionMode === 'region' ? selectedRegion : `${targetStates.length} states`;
    onLog?.(`Starting batch process: ${selectionMode === 'all' ? 'all states' : label}, concurrency=${concurrency}`, 'info');

    try {
      const params = {
        action: 'batch_start',
        concurrency: Number(concurrency),
        taxonomy_description: taxonomyFilter || '',
        entity_type: entityType || '',
        dry_run: dryRun,
        skip_completed: skipCompleted,
      };
      if (selectionMode === 'region' && selectedRegion) {
        params.region = selectedRegion;
      } else if (selectionMode === 'custom' && targetStates.length > 0) {
        params.states = targetStates;
      }
      // selectionMode === 'all' → no states/region passed, defaults to all

      const res = await base44.functions.invoke('nppesCrawler', params);
      const data = res.data;
      setBatchResults(data);

      if (data.success) {
        onLog?.(`Batch complete: ${data.states_completed} succeeded, ${data.states_failed} failed, ${data.total_imported} providers imported`, 'success');
      } else {
        onLog?.(`Batch failed: ${data.error || 'Unknown error'}`, 'error');
      }
      onRefresh?.();
    } catch (err) {
      onLog?.(`Batch error: ${err.message}`, 'error');
    } finally {
      setBatchRunning(false);
    }
  };

  const stopBatch = async () => {
    setBatchStopping(true);
    try {
      const res = await base44.functions.invoke('nppesCrawler', { action: 'batch_stop' });
      onLog?.(res.data?.message || 'Batch stop signal sent', 'info');
    } catch (err) {
      onLog?.(`Stop failed: ${err.message}`, 'error');
    } finally {
      setBatchStopping(false);
    }
  };

  return (
    <Card className="border-indigo-200 bg-white">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Layers className="w-5 h-5 text-indigo-600" />
          Batch Process
        </CardTitle>
        <CardDescription>Process multiple states concurrently for faster data ingestion.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Selection mode */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label className="text-xs font-medium text-slate-600">Selection Mode</Label>
            <Select value={selectionMode} onValueChange={setSelectionMode} disabled={batchRunning}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="region">By Region</SelectItem>
                <SelectItem value="custom">Custom States</SelectItem>
                <SelectItem value="all">All States</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {selectionMode === 'region' && (
            <div className="space-y-2">
              <Label className="text-xs font-medium text-slate-600">Region</Label>
              <Select value={selectedRegion} onValueChange={setSelectedRegion} disabled={batchRunning}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose region" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(REGION_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs font-medium text-slate-600">Concurrency (1–5)</Label>
            <Select value={concurrency} onValueChange={setConcurrency} disabled={batchRunning}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['1','2','3','4','5'].map(n => (
                  <SelectItem key={n} value={n}>{n} state{n !== '1' ? 's' : ''} at a time</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Custom state picker */}
        {selectionMode === 'custom' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-slate-600">
                Select States ({selectedStates.length} selected)
              </Label>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={selectAll} className="text-xs h-7" disabled={batchRunning}>
                  Select All
                </Button>
                <Button variant="ghost" size="sm" onClick={clearAll} className="text-xs h-7" disabled={batchRunning}>
                  Clear
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2 border rounded-lg bg-slate-50">
              {US_STATES.map(st => (
                <button
                  key={st}
                  onClick={() => !batchRunning && toggleState(st)}
                  disabled={batchRunning}
                  className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                    selectedStates.includes(st)
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-slate-600 border border-slate-200 hover:border-indigo-300'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Options row */}
        <div className="flex items-center gap-4 text-sm">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={skipCompleted}
              onChange={(e) => setSkipCompleted(e.target.checked)}
              disabled={batchRunning}
              className="rounded"
            />
            <span className="text-slate-600">Skip already completed states</span>
          </label>
        </div>

        {/* Summary of what will run */}
        {!batchRunning && (
          <div className="text-xs text-slate-500 bg-slate-50 border rounded-lg p-3">
            <strong>Preview:</strong>{' '}
            {selectionMode === 'all'
              ? `All 51 states`
              : selectionMode === 'region' && selectedRegion
                ? `${REGION_LABELS[selectedRegion]} — ${(regionStates[selectedRegion] || []).join(', ')}`
                : selectionMode === 'custom' && selectedStates.length > 0
                  ? `${selectedStates.length} states: ${selectedStates.join(', ')}`
                  : 'No states selected'
            }
            {' '}• Concurrency: {concurrency} • {skipCompleted ? 'Skipping completed' : 'Reprocessing all'}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          {!batchRunning ? (
            <Button onClick={startBatch} className="bg-indigo-600 hover:bg-indigo-700 gap-2">
              <Play className="w-4 h-4" />
              Start Batch
            </Button>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm text-indigo-700">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Batch processing in progress...</span>
              </div>
              <Button
                onClick={stopBatch}
                disabled={batchStopping}
                variant="destructive"
                size="sm"
                className="gap-2"
              >
                {batchStopping ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                Stop Batch
              </Button>
            </>
          )}
        </div>

        {/* Results */}
        {batchResults && (
          <div className="border rounded-lg p-4 bg-slate-50 space-y-3">
            <div className="flex items-center gap-2">
              {batchResults.states_failed === 0 ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              ) : (
                <AlertCircle className="w-5 h-5 text-amber-500" />
              )}
              <span className="font-medium text-slate-800">
                Batch {batchResults.stopped ? 'Stopped' : 'Complete'}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="text-center p-2 bg-white rounded-lg border">
                <p className="text-lg font-bold text-slate-900">{batchResults.states_queued}</p>
                <p className="text-[10px] text-slate-500">Queued</p>
              </div>
              <div className="text-center p-2 bg-white rounded-lg border">
                <p className="text-lg font-bold text-emerald-600">{batchResults.states_completed}</p>
                <p className="text-[10px] text-slate-500">Completed</p>
              </div>
              <div className="text-center p-2 bg-white rounded-lg border">
                <p className="text-lg font-bold text-red-600">{batchResults.states_failed}</p>
                <p className="text-[10px] text-slate-500">Failed</p>
              </div>
              <div className="text-center p-2 bg-white rounded-lg border">
                <p className="text-lg font-bold text-blue-600">{batchResults.total_imported?.toLocaleString()}</p>
                <p className="text-[10px] text-slate-500">Imported</p>
              </div>
            </div>

            {/* Per-state results */}
            {batchResults.results && batchResults.results.length > 0 && (
              <div className="max-h-48 overflow-y-auto space-y-1">
                {batchResults.results.map((r, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs px-2 py-1.5 bg-white rounded border">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-700 w-6">{r.state}</span>
                      {r.success ? (
                        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">Success</Badge>
                      ) : (
                        <Badge className="bg-red-50 text-red-700 border-red-200 text-[10px]">Failed</Badge>
                      )}
                    </div>
                    <span className="text-slate-500">
                      {r.success
                        ? `${r.valid_rows || 0} valid, ${r.imported_providers || 0} imported`
                        : r.error?.substring(0, 60) || 'Error'
                      }
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
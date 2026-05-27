import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle2, AlertTriangle, Search,
  Phone, Wifi, DollarSign, ShieldCheck, Activity, XCircle
} from 'lucide-react';

const DATA_POINTS = [
  { key: 'patient_volume', label: 'Patient Volume', icon: Activity, description: 'Estimated patient panel size' },
  { key: 'insurance', label: 'Insurance Accepted', icon: ShieldCheck, description: 'Which insurance plans accepted' },
  { key: 'telehealth', label: 'Telehealth Availability', icon: Wifi, description: 'Whether provider offers telehealth' },
  { key: 'office_hours', label: 'Office Hours', icon: Phone, description: 'Practice hours and availability' },
  { key: 'pricing', label: 'Cash Pay / Pricing', icon: DollarSign, description: 'Self-pay pricing if available' },
];

export default function ProactiveEnrichmentScanner({ totalProviders = 0 }) {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [progress, setProgress] = useState({ current: 0, total: 0, currentName: '' });
  const [enabledPoints, setEnabledPoints] = useState(new Set(['patient_volume', 'insurance', 'telehealth']));
  const [batchSize, setBatchSize] = useState(5);
  const stopRef = React.useRef(false);

  const togglePoint = (key) => {
    setEnabledPoints(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleScan = async () => {
    if (enabledPoints.size === 0) return;
    stopRef.current = false;
    setRunning(true);
    setResults(null);
    setProgress({ current: 0, total: batchSize, currentName: '' });

    try {
      const res = await base44.functions.invoke('proactiveScanServerSide', {
        batch_size: batchSize,
        data_points: [...enabledPoints],
      });

      const d = res.data || {};
      setResults({
        enriched: d.enriched || 0,
        no_data: d.no_data || 0,
        errors: d.errors || 0,
        details: d.details || [],
        message: d.message || `Scanned ${d.total || 0} providers`,
      });
    } catch (err) {
      setResults({ enriched: 0, no_data: 0, errors: 0, details: [], message: `Scan failed: ${err.message}` });
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card className="bg-[#141d30] border-slate-700/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          <Search className="w-4 h-4 text-violet-400" />
          Proactive Data Discovery
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-slate-400">
          AI scans public sources for missing data points like patient volumes, insurance, and telehealth availability.
        </p>

        <div className="space-y-2">
          <Label className="text-[10px] text-slate-500 uppercase tracking-wide">Data Points to Discover</Label>
          {DATA_POINTS.map(dp => (
            <div key={dp.key} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <dp.icon className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-xs text-slate-300">{dp.label}</span>
              </div>
              <Switch checked={enabledPoints.has(dp.key)} onCheckedChange={() => togglePoint(dp.key)} disabled={running} />
            </div>
          ))}
        </div>

        <div>
          <Label className="text-xs text-slate-400">Scan size</Label>
          <select
            className="w-full mt-1 text-xs bg-slate-800/50 border border-slate-700 rounded-md px-2 py-1.5 text-slate-300"
            value={batchSize} onChange={e => setBatchSize(Number(e.target.value))}
            disabled={running}
          >
            <option value={3}>3 providers</option>
            <option value={5}>5 providers</option>
            <option value={10}>10 providers</option>
            <option value={25}>25 providers</option>
          </select>
        </div>

        {running && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin text-violet-400" />
              <p className="text-[10px] text-slate-500">
                Scanning providers with AI... this may take a moment
              </p>
            </div>
          </div>
        )}

        {results && (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-emerald-900/10 rounded-lg p-2 text-center">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
                <p className="text-lg font-bold text-emerald-400">{results.enriched}</p>
                <p className="text-[9px] text-slate-500">Found Data</p>
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
            {results.message && (
              <p className="text-xs text-slate-400 text-center">{results.message}</p>
            )}
          </div>
        )}

        <Button onClick={handleScan} disabled={running || enabledPoints.size === 0}
          className="w-full bg-violet-600 hover:bg-violet-700 gap-2">
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          {running ? 'Scanning...' : `Scan ${batchSize} Providers`}
        </Button>
      </CardContent>
    </Card>
  );
}

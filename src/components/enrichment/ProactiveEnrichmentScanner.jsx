import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Sparkles, Loader2, CheckCircle2, AlertTriangle, Search,
  Phone, Wifi, DollarSign, ShieldCheck, Activity, XCircle
} from 'lucide-react';

const DATA_POINTS = [
  { key: 'patient_volume', label: 'Patient Volume', icon: Activity, description: 'Estimated patient panel size' },
  { key: 'insurance', label: 'Insurance Accepted', icon: ShieldCheck, description: 'Which insurance plans accepted' },
  { key: 'telehealth', label: 'Telehealth Availability', icon: Wifi, description: 'Whether provider offers telehealth' },
  { key: 'office_hours', label: 'Office Hours', icon: Phone, description: 'Practice hours and availability' },
  { key: 'pricing', label: 'Cash Pay / Pricing', icon: DollarSign, description: 'Self-pay pricing if available' },
];

export default function ProactiveEnrichmentScanner({ providers = [] }) {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [progress, setProgress] = useState({ current: 0, total: 0, currentName: '' });
  const [enabledPoints, setEnabledPoints] = useState(new Set(['patient_volume', 'insurance', 'telehealth']));
  const [batchSize, setBatchSize] = useState(5);

  const togglePoint = (key) => {
    setEnabledPoints(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleScan = async () => {
    if (enabledPoints.size === 0) return;
    setRunning(true);
    setResults(null);

    // Get NPIs already scanned via proactive discovery so we skip them
    let alreadyScannedNPIs = new Set();
    try {
      const existing = await base44.entities.EnrichmentRecord.filter({ field_name: 'proactive_scan' });
      alreadyScannedNPIs = new Set(existing.map(r => r.npi));
    } catch (e) { console.warn('Could not fetch existing scans:', e.message); }

    // Filter out already-scanned providers, then take batchSize
    const candidates = providers.filter(p => !alreadyScannedNPIs.has(p.npi));
    const toScan = candidates.slice(0, batchSize);
    
    if (toScan.length === 0) {
      setResults({ enriched: 0, no_data: 0, errors: 0, details: [], message: 'All providers have already been scanned.' });
      setRunning(false);
      return;
    }
    setProgress({ current: 0, total: toScan.length, currentName: '' });

    const scanResults = { enriched: 0, no_data: 0, errors: 0, details: [] };
    const enabledList = [...enabledPoints];

    for (let i = 0; i < toScan.length; i++) {
      const p = toScan[i];
      const name = p.entity_type === 'Individual'
        ? `${p.first_name || ''} ${p.last_name || ''}`.trim()
        : p.organization_name || p.npi;
      setProgress({ current: i + 1, total: toScan.length, currentName: name });

      const res = await base44.integrations.Core.InvokeLLM({
        prompt: `Find the following specific data about this healthcare provider:

Provider: ${name}
NPI: ${p.npi}
Credential: ${p.credential || 'Unknown'}

Data points to find:
${enabledList.map(k => `- ${DATA_POINTS.find(d => d.key === k)?.description || k}`).join('\n')}

Only return data you can verify. Provide specific numbers and names.`,
        add_context_from_internet: true,
        response_json_schema: {
          type: "object",
          properties: {
            estimated_patient_volume: { type: ["string", "null"] },
            insurance_accepted: { type: "array", items: { type: "string" } },
            telehealth_available: { type: ["boolean", "null"] },
            office_hours: { type: ["string", "null"] },
            cash_pay_info: { type: ["string", "null"] },
            data_found: { type: "boolean" },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
            ai_explanation: { type: "string", description: "Explain where and how you found this data" }
          }
        }
      });

      if (!res.data_found) {
        scanResults.no_data++;
        scanResults.details.push({ npi: p.npi, name, status: 'no_data' });
        continue;
      }

      const details = {};
      const summaryParts = [];
      if (res.estimated_patient_volume) {
        details.estimated_patient_volume = res.estimated_patient_volume;
        summaryParts.push(`Patient Vol: ${res.estimated_patient_volume}`);
      }
      if (res.insurance_accepted?.length > 0) {
        details.insurance_accepted = res.insurance_accepted;
        summaryParts.push(`Insurance: ${res.insurance_accepted.slice(0, 3).join(', ')}`);
      }
      if (res.telehealth_available !== null && res.telehealth_available !== undefined) {
        details.telehealth_available = res.telehealth_available;
        summaryParts.push(`Telehealth: ${res.telehealth_available ? 'Yes' : 'No'}`);
      }
      if (res.office_hours) {
        details.office_hours = res.office_hours;
        summaryParts.push(`Hours: ${res.office_hours}`);
      }
      if (res.cash_pay_info) details.cash_pay_info = res.cash_pay_info;
      if (res.ai_explanation) details.ai_explanation = res.ai_explanation;

      if (summaryParts.length > 0) {
        await base44.entities.EnrichmentRecord.create({
          npi: p.npi,
          provider_name: name,
          source: 'ai_web_search',
          enrichment_type: 'multi_field',
          field_name: 'proactive_scan',
          new_value: summaryParts.join(' | '),
          confidence: res.confidence || 'medium',
          status: 'pending_review',
          enrichment_details: details,
          batch_id: `proactive_${Date.now()}`,
        });
        scanResults.enriched++;
        scanResults.details.push({ npi: p.npi, name, status: 'enriched', fields: summaryParts.length });
      } else {
        scanResults.no_data++;
        scanResults.details.push({ npi: p.npi, name, status: 'no_data' });
      }
    }

    setResults(scanResults);
    setRunning(false);
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

        {/* Data point toggles */}
        <div className="space-y-2">
          <Label className="text-[10px] text-slate-500 uppercase tracking-wide">Data Points to Discover</Label>
          {DATA_POINTS.map(dp => (
            <div key={dp.key} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <dp.icon className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-xs text-slate-300">{dp.label}</span>
              </div>
              <Switch checked={enabledPoints.has(dp.key)} onCheckedChange={() => togglePoint(dp.key)} />
            </div>
          ))}
        </div>

        <div>
          <Label className="text-xs text-slate-400">Scan size</Label>
          <select
            className="w-full mt-1 text-xs bg-slate-800/50 border border-slate-700 rounded-md px-2 py-1.5 text-slate-300"
            value={batchSize} onChange={e => setBatchSize(Number(e.target.value))}
          >
            <option value={3}>3 providers</option>
            <option value={5}>5 providers</option>
            <option value={10}>10 providers</option>
          </select>
        </div>

        {running && (
          <div className="space-y-2">
            <Progress value={(progress.current / progress.total) * 100} className="h-2" />
            <p className="text-[10px] text-slate-500 text-center">
              Scanning {progress.current}/{progress.total} — {progress.currentName}
            </p>
          </div>
        )}

        {results && (
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-emerald-500/10 rounded-lg p-2 text-center">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
              <p className="text-lg font-bold text-emerald-400">{results.enriched}</p>
              <p className="text-[9px] text-slate-500">Found Data</p>
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

        <Button onClick={handleScan} disabled={running || enabledPoints.size === 0}
          className="w-full bg-violet-600 hover:bg-violet-700 gap-2">
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          {running ? 'Scanning...' : `Scan ${batchSize} Providers`}
        </Button>
      </CardContent>
    </Card>
  );
}
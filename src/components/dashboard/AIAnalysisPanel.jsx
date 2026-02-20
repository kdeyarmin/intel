import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const VALID_STATES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC','PR','VI','GU','AS','MP',
]);

const typeStyles = {
  critical: 'bg-red-500/10 border-red-500/20 text-red-400',
  warning: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
  info: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400',
  success: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
};

const iconStyles = {
  critical: 'text-red-400',
  warning: 'text-amber-400',
  info: 'text-cyan-400',
  success: 'text-emerald-400',
};

export default function AIAnalysisPanel() {
  const { data: providers = [], isLoading: lp } = useQuery({
    queryKey: ['providers'],
    queryFn: () => base44.entities.Provider.list('-created_date', 10000),
    staleTime: 60000,
  });
  const { data: locations = [], isLoading: ll } = useQuery({
    queryKey: ['locations'],
    queryFn: () => base44.entities.ProviderLocation.list('-created_date', 10000),
    staleTime: 60000,
  });
  const { data: taxonomies = [], isLoading: lt } = useQuery({
    queryKey: ['taxonomies'],
    queryFn: () => base44.entities.ProviderTaxonomy.list('-created_date', 10000),
    staleTime: 60000,
  });
  const { data: batches = [] } = useQuery({
    queryKey: ['importBatches'],
    queryFn: () => base44.entities.ImportBatch.list('-created_date', 100),
    staleTime: 60000,
  });

  const isLoading = lp || ll || lt;

  const analysis = useMemo(() => {
    if (isLoading || providers.length === 0) return null;

    const total = providers.length;
    const findings = [];

    // Completeness checks
    const missingGender = providers.filter(p => !p.gender || p.gender === '').length;
    const missingGenderPct = Math.round((missingGender / total) * 100);

    const locNPIs = new Set(locations.map(l => l.npi));
    const noLocation = providers.filter(p => !locNPIs.has(p.npi)).length;
    const noLocationPct = Math.round((noLocation / total) * 100);

    const taxNPIs = new Set(taxonomies.map(t => t.npi));
    const noTaxonomy = providers.filter(p => !taxNPIs.has(p.npi)).length;
    const noTaxonomyPct = Math.round((noTaxonomy / total) * 100);

    // Accuracy checks
    const invalidZips = locations.length > 0
      ? locations.filter(l => l.zip && !/^\d{5}(-\d{4})?$/.test(l.zip.trim())).length
      : 0;
    const invalidZipPct = locations.length > 0 ? Math.round((invalidZips / locations.length) * 100) : 0;

    const invalidStates = locations.length > 0
      ? locations.filter(l => l.state && !VALID_STATES.has(l.state.toUpperCase())).length
      : 0;

    // Timeliness
    const completedBatches = batches.filter(b => b.status === 'completed' && b.completed_at);
    const daysSinceLatest = completedBatches.length > 0
      ? Math.min(...completedBatches.map(b => Math.floor((Date.now() - new Date(b.completed_at).getTime()) / 86400000)))
      : 999;

    // Build findings with severity
    if (missingGenderPct >= 30) {
      findings.push({
        type: missingGenderPct >= 50 ? 'critical' : 'warning',
        label: 'Missing Gender Info',
        detail: `${missingGenderPct}% of provider records have no gender information`,
        icon: AlertTriangle,
      });
    }
    if (noLocationPct >= 20) {
      findings.push({
        type: noLocationPct >= 50 ? 'critical' : 'warning',
        label: 'No Location Linked',
        detail: `${noLocationPct}% of providers lack an associated location record`,
        icon: AlertTriangle,
      });
    }
    if (noTaxonomyPct >= 20) {
      findings.push({
        type: noTaxonomyPct >= 50 ? 'critical' : 'warning',
        label: 'No Taxonomy Linked',
        detail: `${noTaxonomyPct}% of providers have no taxonomy/specialty classification`,
        icon: AlertTriangle,
      });
    }
    if (invalidZipPct >= 5) {
      findings.push({
        type: 'info',
        label: 'Invalid ZIP Formats',
        detail: `${invalidZipPct}% of location records contain non-standard ZIP code formats`,
        icon: Info,
      });
    }
    if (invalidStates > 0) {
      findings.push({
        type: 'info',
        label: 'Invalid State Codes',
        detail: `${invalidStates} location records have unrecognized state codes`,
        icon: Info,
      });
    }

    if (daysSinceLatest <= 7) {
      findings.push({
        type: 'success',
        label: 'Timeliness',
        detail: `Data is current — last import was ${daysSinceLatest <= 1 ? 'today' : `${daysSinceLatest} days ago`}`,
        icon: CheckCircle2,
      });
    } else if (daysSinceLatest <= 30) {
      findings.push({
        type: 'info',
        label: 'Timeliness',
        detail: `Last import was ${daysSinceLatest} days ago — consider refreshing`,
        icon: Info,
      });
    } else if (daysSinceLatest < 999) {
      findings.push({
        type: 'warning',
        label: 'Stale Data',
        detail: `Last import was ${daysSinceLatest} days ago — data may be outdated`,
        icon: AlertTriangle,
      });
    }

    // Compute scores
    const hasNPI = providers.filter(p => p.npi && p.npi.trim() !== '').length;
    const hasName = providers.filter(p => (p.first_name && p.last_name) || p.organization_name).length;
    const provWithLoc = providers.filter(p => locNPIs.has(p.npi)).length;
    const provWithTax = providers.filter(p => taxNPIs.has(p.npi)).length;
    const completeness = Math.round(((hasNPI + hasName + provWithLoc + provWithTax) / (total * 4)) * 100);

    const validNPIs = providers.filter(p => p.npi && String(p.npi).replace(/\D/g, '').length === 10).length;
    const validStates = locations.length > 0 ? locations.filter(l => l.state && VALID_STATES.has(l.state.toUpperCase())).length : 0;
    const validZips = locations.length > 0 ? locations.filter(l => l.zip && /^\d{5}(-\d{4})?$/.test(l.zip.trim())).length : 0;
    const accDenom = providers.length + locations.length + locations.length;
    const accuracy = accDenom > 0 ? Math.round(((validNPIs + validStates + validZips) / accDenom) * 100) : 0;

    const timeliness = daysSinceLatest <= 1 ? 100 : daysSinceLatest <= 7 ? 85 : daysSinceLatest <= 14 ? 65 : daysSinceLatest <= 30 ? 40 : 10;

    const overall = Math.round((completeness + accuracy + timeliness) / 3);

    return {
      findings,
      scores: { completeness, accuracy, timeliness, overall },
    };
  }, [providers, locations, taxonomies, batches, isLoading]);

  if (isLoading) {
    return (
      <Card className="bg-[#141d30] border-slate-700/50 shadow-lg shadow-black/10">
        <CardHeader><CardTitle className="text-slate-300 text-sm">AI Analysis</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-32 w-full bg-slate-700/50" /></CardContent>
      </Card>
    );
  }

  if (!analysis) return null;

  const { findings, scores } = analysis;
  const overallColor = scores.overall >= 80 ? 'text-emerald-400' : scores.overall >= 50 ? 'text-amber-400' : 'text-red-400';
  const scoreColor = (v) => v >= 80 ? 'text-emerald-400' : v >= 50 ? 'text-amber-400' : 'text-red-400';

  return (
    <Card className="bg-[#141d30] border-slate-700/50 shadow-lg shadow-black/10">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2 text-slate-300 font-semibold">
            <Sparkles className="w-4 h-4 text-violet-400" />
            AI Analysis
          </CardTitle>
          <Badge className="bg-violet-500/15 text-violet-400 border border-violet-500/20 text-[10px]">Live data</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Score summary */}
        <div className="flex items-center gap-4 p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/50">
          <div className="text-center">
            <p className={`text-2xl font-bold ${overallColor}`}>{scores.overall}%</p>
            <p className="text-[10px] text-slate-500 font-medium">Overall Score</p>
          </div>
          <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div className="text-center">
              <p className={`text-sm font-semibold ${scoreColor(scores.completeness)}`}>{scores.completeness}%</p>
              <p className="text-[10px] text-slate-500">Completeness</p>
            </div>
            <div className="text-center">
              <p className={`text-sm font-semibold ${scoreColor(scores.accuracy)}`}>{scores.accuracy}%</p>
              <p className="text-[10px] text-slate-500">Accuracy</p>
            </div>
            <div className="text-center">
              <p className={`text-sm font-semibold ${scoreColor(scores.timeliness)}`}>{scores.timeliness}%</p>
              <p className="text-[10px] text-slate-500">Timeliness</p>
            </div>
          </div>
        </div>

        {findings.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Key Findings</p>
            {findings.map((f, i) => {
              const Icon = f.icon;
              return (
                <div key={i} className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-xs ${typeStyles[f.type]}`}>
                  <Icon className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${iconStyles[f.type]}`} />
                  <div>
                    <span className="font-semibold">{f.label}:</span>{' '}
                    <span className="opacity-80">{f.detail}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {findings.length === 0 && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
            <span>All data quality checks passed — no issues detected.</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
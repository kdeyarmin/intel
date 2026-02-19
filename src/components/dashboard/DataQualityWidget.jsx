import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Database } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import QualityRadialChart from './QualityRadialChart';
import CompletenessPanel from './CompletenessPanel';
import AccuracyPanel from './AccuracyPanel';
import TimelinessPanel from './TimelinessPanel';

function validateNPI(npi) {
  if (!npi) return false;
  return String(npi).replace(/\D/g, '').length === 10;
}

const VALID_STATES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC','PR','VI','GU','AS','MP',
]);

export default function DataQualityWidget() {
  const { data: providers = [], isLoading: lp } = useQuery({
    queryKey: ['providers'],
    queryFn: () => base44.entities.Provider.list(),
    staleTime: 60000,
  });
  const { data: utilization = [], isLoading: lu } = useQuery({
    queryKey: ['utilization'],
    queryFn: () => base44.entities.CMSUtilization.list(),
    staleTime: 60000,
  });
  const { data: referrals = [], isLoading: lr } = useQuery({
    queryKey: ['referrals'],
    queryFn: () => base44.entities.CMSReferral.list(),
    staleTime: 60000,
  });
  const { data: locations = [], isLoading: ll } = useQuery({
    queryKey: ['locations'],
    queryFn: () => base44.entities.ProviderLocation.list(),
    staleTime: 60000,
  });
  const { data: taxonomies = [], isLoading: lt } = useQuery({
    queryKey: ['taxonomies'],
    queryFn: () => base44.entities.ProviderTaxonomy.list(),
    staleTime: 60000,
  });
  const { data: batches = [] } = useQuery({
    queryKey: ['importBatches'],
    queryFn: () => base44.entities.ImportBatch.list('-created_date', 100),
    staleTime: 60000,
  });

  const isLoading = lp || lu || lr || ll || lt;

  const scores = useMemo(() => {
    if (isLoading) return { completeness: 0, accuracy: 0, timeliness: 0, overall: 0 };

    const total = providers.length || 1;

    // Completeness: % of key fields populated
    const hasNPI = providers.filter(p => p.npi && p.npi.trim() !== '').length;
    const hasName = providers.filter(p => (p.first_name && p.last_name) || p.organization_name).length;
    const locNPIs = new Set(locations.map(l => l.npi));
    const provWithLoc = providers.filter(p => locNPIs.has(p.npi)).length;
    const taxNPIs = new Set(taxonomies.map(t => t.npi));
    const provWithTax = providers.filter(p => taxNPIs.has(p.npi)).length;
    const completeness = Math.round(((hasNPI + hasName + provWithLoc + provWithTax) / (total * 4)) * 100);

    // Accuracy: % passing validation
    const validNPIs = providers.filter(p => validateNPI(p.npi)).length;
    const validStates = locations.length > 0
      ? locations.filter(l => l.state && VALID_STATES.has(l.state.toUpperCase())).length
      : 0;
    const validZips = locations.length > 0
      ? locations.filter(l => l.zip && /^\d{5}(-\d{4})?$/.test(l.zip.trim())).length
      : 0;
    const accDenom = providers.length + locations.length + locations.length;
    const accuracy = accDenom > 0 ? Math.round(((validNPIs + validStates + validZips) / accDenom) * 100) : 0;

    // Timeliness: based on most recent batch per type
    const completedBatches = batches.filter(b => b.status === 'completed' && b.completed_at);
    const daysSinceLatest = completedBatches.length > 0
      ? Math.min(...completedBatches.map(b => Math.floor((Date.now() - new Date(b.completed_at).getTime()) / 86400000)))
      : 999;
    const timeliness = daysSinceLatest <= 1 ? 100 : daysSinceLatest <= 7 ? 85 : daysSinceLatest <= 14 ? 65 : daysSinceLatest <= 30 ? 40 : 10;

    const overall = Math.round((completeness + accuracy + timeliness) / 3);
    return { completeness, accuracy, timeliness, overall };
  }, [providers, locations, taxonomies, batches, isLoading]);

  const datasets = useMemo(() => {
    const types = [
      { key: 'cms_order_referring', label: 'Referrals' },
      { key: 'cms_utilization', label: 'Utilization' },
      { key: 'provider_service_utilization', label: 'Service Util.' },
      { key: 'hospice_enrollments', label: 'Hospice' },
      { key: 'home_health_enrollments', label: 'Home Health' },
      { key: 'opt_out_physicians', label: 'Opt-Out' },
    ];
    return types.map(t => {
      const typeBatches = batches.filter(b => b.import_type === t.key && b.status === 'completed' && b.completed_at);
      const latest = typeBatches.length > 0
        ? typeBatches.reduce((a, b) => new Date(a.completed_at) > new Date(b.completed_at) ? a : b)
        : null;
      const entityCounts = { cms_order_referring: referrals.length, cms_utilization: utilization.length };
      return {
        label: t.label,
        lastUpdated: latest?.completed_at || null,
        count: entityCounts[t.key] ?? '—',
      };
    });
  }, [batches, referrals, utilization]);

  if (isLoading) {
    return (
      <Card className="col-span-1 lg:col-span-3">
        <CardHeader><CardTitle>Data Quality</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  const overallColor = scores.overall >= 80 ? 'bg-green-100 text-green-700' : scores.overall >= 50 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700';

  return (
    <Card className="bg-white border-slate-200/80 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Database className="w-4 h-4 text-teal-500" />
            Data Quality Overview
          </CardTitle>
          <Badge className={overallColor}>
            Overall: {scores.overall}%
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Radial Score Summary */}
        <div className="flex justify-around py-2">
          <QualityRadialChart score={scores.completeness} label="Completeness" />
          <QualityRadialChart score={scores.accuracy} label="Accuracy" />
          <QualityRadialChart score={scores.timeliness} label="Timeliness" />
          <QualityRadialChart score={scores.overall} label="Overall" />
        </div>

        {/* Detailed Panels */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border rounded-lg p-3">
            <CompletenessPanel providers={providers} locations={locations} taxonomies={taxonomies} />
          </div>
          <div className="border rounded-lg p-3">
            <AccuracyPanel providers={providers} locations={locations} />
          </div>
          <div className="border rounded-lg p-3">
            <TimelinessPanel datasets={datasets} />
          </div>
        </div>

        {/* Summary Stats Footer */}
        <div className="grid grid-cols-4 gap-3 pt-2 border-t">
          <div className="text-center">
            <p className="text-lg font-bold text-gray-900">{providers.length}</p>
            <p className="text-[10px] text-gray-500">Providers</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-gray-900">{locations.length}</p>
            <p className="text-[10px] text-gray-500">Locations</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-orange-600">{providers.filter(p => p.needs_nppes_enrichment).length}</p>
            <p className="text-[10px] text-gray-500">Need Enrichment</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-gray-900">{taxonomies.length}</p>
            <p className="text-[10px] text-gray-500">Taxonomies</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
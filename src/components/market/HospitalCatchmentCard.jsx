import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { invokeOrThrow } from '@/api/functionResult';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPin } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { fmtCount, fmtShare } from '@/lib/marketFormat';
import DischargeMixCard from './DischargeMixCard';
import MarketFreshness from './MarketFreshness';
import ComplianceDisclaimer from '../compliance/ComplianceDisclaimer';

/** Where a hospital's Medicare inpatients live (Hospital Service Area), by county and ZIP area, plus its discharge mix. */
export default function HospitalCatchmentCard({ ccn }) {
  const { data, isLoading } = useQuery({
    queryKey: ['hospitalCatchment', ccn],
    queryFn: () => invokeOrThrow('getHospitalCatchment', { ccn }),
    enabled: !!ccn,
    staleTime: 10 * 60 * 1000,
  });
  if (!ccn) return null;
  if (isLoading) return <p className="text-sm text-slate-400">Loading patient origins…</p>;
  if (!data || (!data.counties?.length && !data.discharge_mix)) return null;
  const counties = data.counties || [];
  const max = Math.max(1, ...counties.map((c) => c.share ?? 0));
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card className="bg-slate-800/50 border-slate-700/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-slate-200 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-blue-400" aria-hidden="true" /> Where this hospital's patients live
          </CardTitle>
          <p className="text-[11px] text-slate-400">
            Medicare inpatient cases by the patient's county of residence (Hospital Service Area {data.data_year}; {fmtCount(data.total_cases)} cases across {counties.length} counties).
          </p>
        </CardHeader>
        <CardContent>
          {counties.length === 0 ? <p className="text-sm text-slate-400">No service-area rows for this hospital.</p> : (
            <ul className="space-y-1.5">
              {counties.slice(0, 15).map((c) => (
                <li key={c.county_fips} className="flex items-center gap-2 text-xs">
                  <Link to={createPageUrl(`CountyIntelligence?state=${c.state || ''}&county=${c.county_fips}&tab=hospitals`)} className="w-44 truncate text-cyan-400 hover:underline">{c.name || c.county_fips}{c.state ? `, ${c.state}` : ''}</Link>
                  <span className="flex-1 h-2 rounded bg-slate-900"><span className="block h-2 rounded bg-blue-500" style={{ width: `${((c.share ?? 0) / max) * 100}%` }} /></span>
                  <span className="w-24 text-right text-slate-200">{fmtCount(c.cases)} ({fmtShare(c.share)})</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 space-y-2">
            <MarketFreshness rollups={data.rollups} jobs={['hospital_catchment']} />
            <ComplianceDisclaimer variant="market" />
          </div>
        </CardContent>
      </Card>
      <DischargeMixCard mix={data.discharge_mix} />
    </div>
  );
}

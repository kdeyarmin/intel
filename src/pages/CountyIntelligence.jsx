import React, { useMemo, useState } from 'react';
import PageTabs from '@/components/layout/PageTabs';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { invokeOrThrow } from '@/api/functionResult';
import { useUrlState } from '@/hooks/useUrlState';
import { createPageUrl } from '@/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MapPin, Users, Building2, DollarSign, Activity, ArrowRight, BarChart3, Network, Stethoscope, Info, AlertTriangle, Hospital, Target, LayoutDashboard } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { US_STATES } from '@/lib/usStates';
import ComplianceDisclaimer from '../components/compliance/ComplianceDisclaimer';
import CountyMarketProfile from '../components/market/CountyMarketProfile';
import { CountyReferenceCard } from '../components/market/MarketReferenceCards';
import HospitalSourcesTable from '../components/market/HospitalSourcesTable';
import { useBusinessLine } from '@/lib/BusinessLineContext';
import PacCompetitorsTable from '../components/market/PacCompetitorsTable';
import ReferralSourcesTable from '../components/market/ReferralSourcesTable';
import { fmtCount } from '@/lib/marketFormat';
import { finiteNumber, isRecord, recordRows, scalarRecord } from '../components/market/marketData';

function formatCurrency(val) {
  const num = finiteNumber(val);
  if (num == null) return 'Not available';
  if (num >= 1e9) return `$${(num / 1e9).toFixed(1)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(0)}K`;
  return `$${num.toLocaleString()}`;
}

const FACILITY_LABELS = {
  hospital: 'Hospitals',
  home_health: 'Home health',
  hospice: 'Hospice',
  snf: 'Nursing facilities',
  irf: 'Inpatient rehab',
  ltch: 'Long-term care hospitals',
  dme: 'DME suppliers',
  community_health: 'Community health centers',
  other: 'Other',
};

// The tab is in the URL too, so a market view can be linked to directly.
const URL_DEFAULTS = { state: '', county: '', tab: 'overview' };
// The tabs that read the county market payload (the referral tab asks for its own list).
const MARKET_TABS = ['market', 'hospitals', 'competitors'];
const TABS = [
  { value: 'overview', label: 'Overview', icon: LayoutDashboard },
  { value: 'market', label: 'Market', icon: BarChart3 },
  { value: 'hospitals', label: 'Hospital sources', icon: Hospital },
  { value: 'competitors', label: 'Competitors', icon: Building2 },
  { value: 'referrals', label: 'Referral sources', icon: Target },
];
const ROW_KEYS = { topSpecialties: 'name', topServices: 'code', referrals: 'fromNpi', facilitySummary: 'type', facilities: 'id', providers: 'npi' };

function Kpi({ icon: Icon, label, value, sub, color }) {
  return (
    <Card className="bg-slate-800/50 border-slate-700/50">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <Icon className={`w-4 h-4 ${color}`} aria-hidden="true" />
          <span className="text-xs text-slate-400">{label}</span>
        </div>
        <p className="text-2xl font-bold text-slate-100">{value}</p>
        {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default function CountyIntelligence() {
  const [url, setUrl] = useUrlState(URL_DEFAULTS);
  const [showAll, setShowAll] = useState({});
  const [everyLine, setEveryLine] = useState(false);
  const { profile } = useBusinessLine();
  const toggle = (k) => setShowAll((s) => ({ ...s, [k]: !s[k] }));
  const tabs = TABS.filter((t) => t.value === 'overview' || everyLine || !profile || profile.countyTabs.includes(t.value));
  const tab = tabs.some((t) => t.value === url.tab) ? url.tab : 'overview';

  const { data: counties, isLoading: loadingCounties, isError: countiesError, refetch: refetchCounties } = useQuery({
    queryKey: ['geoCounties', url.state],
    queryFn: () => invokeOrThrow('getGeoCounties', { state: url.state }),
    enabled: !!url.state,
    staleTime: 60 * 60 * 1000,
  });

  const { data: rawData, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['countyIntelligence', url.state, url.county],
    queryFn: () => invokeOrThrow('getCountyIntelligence', { state: url.state, county_fips: url.county }),
    enabled: !!url.state && !!url.county,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  // The market views come from the daily rollups (server/functions/market.ts). The referral tab makes its own
  // request, so it doesn't pay for the county payload it never shows.
  const { data: market, isLoading: loadingMarket, isError: marketError, error: marketErr, refetch: refetchMarket } = useQuery({
    queryKey: ['countyMarket', url.state, url.county],
    queryFn: () => invokeOrThrow('getCountyMarket', { state: url.state, county_fips: url.county }),
    enabled: !!url.state && !!url.county && MARKET_TABS.includes(url.tab),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const countyList = recordRows(counties?.counties).filter((c) => typeof c.fips === 'string' && c.fips && typeof c.name === 'string');
  const data = useMemo(() => {
    if (!isRecord(rawData)) return null;
    return {
      ...scalarRecord(rawData),
      county: scalarRecord(rawData.county),
      sample: scalarRecord(rawData.sample),
      summary: scalarRecord(rawData.summary),
      ...Object.fromEntries(['topSpecialties', 'topServices', 'referrals', 'facilitySummary', 'facilities', 'providers']
        .map((key) => [key, recordRows(rawData[key]).map(scalarRecord)
          .filter((row) => (typeof row[ROW_KEYS[key]] === 'string' || typeof row[ROW_KEYS[key]] === 'number') &&
            (key !== 'referrals' || typeof row.toNpi === 'string'))
          .map((row) => key === 'providers' ? { ...row, score: finiteNumber(row.score) } : row)])),
    };
  }, [rawData]);
  const summary = data?.summary || {};
  const facilities = data?.facilities || [];
  const count = (value) => finiteNumber(value) == null ? 'Not available' : fmtCount(value);
  const partial = isRecord(rawData) && (!isRecord(rawData.summary) || !isRecord(rawData.sample) ||
    ['topSpecialties', 'topServices', 'referrals', 'facilitySummary', 'facilities', 'providers']
      .some((key) => !Array.isArray(rawData[key]) || data[key].length !== rawData[key].length));
  const emptyMessage = (key, message) => Array.isArray(rawData?.[key])
    ? message : 'This section is unavailable. Retry the county data or contact your administrator.';
  const list = (key, items, n) => (showAll[key] ? items : items.slice(0, n));

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <PageTabs current="CountyIntelligence" />
      <div>
        <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
          <MapPin className="w-6 h-6 text-cyan-400" aria-hidden="true" />
          County Intelligence
        </h1>
        <p className="text-sm text-slate-400 mt-1">Providers, specialties, referrals, Medicare services and facilities for one county</p>
        <div className="flex flex-wrap items-center gap-3 mt-2 text-xs">
          <span className="text-slate-400">Related:</span>
          <Link to={createPageUrl(`TerritoryIntelligence${url.state ? `?state=${url.state}&tab=density` : ''}`)} className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300">
            <MapPin className="w-3 h-3" aria-hidden="true" /> Territory map and county density
          </Link>
          <Link to={createPageUrl(`ReferralNetworkIntelligence${url.state ? `?state=${url.state}` : ''}`)} className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300">
            <Network className="w-3 h-3" aria-hidden="true" /> Referral Network
          </Link>
        </div>
      </div>

      <Card className="bg-slate-800/50 border-slate-700/50">
        <CardContent className="py-4 flex flex-col sm:flex-row gap-4">
          <div className="space-y-1">
            <Label htmlFor="county-state" className="text-xs text-slate-400">State</Label>
            <Select value={url.state || undefined} onValueChange={(state) => setUrl({ state, county: '' })}>
              <SelectTrigger id="county-state" aria-label="State" className="w-40 bg-slate-900 border-slate-700"><SelectValue placeholder="Pick a state" /></SelectTrigger>
              <SelectContent>{US_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="county-county" className="text-xs text-slate-400">County</Label>
            <Select value={url.county || undefined} onValueChange={(county) => setUrl({ county })} disabled={!url.state || loadingCounties}>
              <SelectTrigger id="county-county" aria-label="County" className="w-72 bg-slate-900 border-slate-700">
                <SelectValue placeholder={!url.state ? 'Pick a state first' : loadingCounties ? 'Loading counties…' : 'Pick a county'} />
              </SelectTrigger>
              <SelectContent>{countyList.map((c) => <SelectItem key={c.fips} value={c.fips}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {counties?.notLoaded && <p className="text-sm text-amber-400 self-end">{typeof counties.message === 'string' ? counties.message : 'County geography is unavailable. Ask your administrator to check the geography import.'}</p>}
          {url.state && !loadingCounties && (countiesError || !Array.isArray(counties?.counties)) && (
            <div role="alert" className="text-sm text-amber-400">County list unavailable. Retry or select another state.
              <Button variant="outline" size="sm" onClick={() => refetchCounties()}>Retry county list</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {!url.state || !url.county ? (
        <Card className="bg-slate-800/30 border-slate-700/50">
          <CardContent className="py-12 text-center text-slate-400">
            <MapPin className="w-10 h-10 mx-auto mb-3 text-slate-400" aria-hidden="true" />
            Pick a state and a county to see its providers, facilities and referral patterns.
          </CardContent>
        </Card>
      ) : isError ? (
        <div className="bg-red-900/30 border border-red-500/30 rounded-lg p-6 text-center space-y-3" role="alert">
          <AlertTriangle className="w-8 h-8 text-red-400 mx-auto" aria-hidden="true" />
          <p className="text-red-400 text-sm">Couldn't load this county: {error?.message}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="border-red-500/30 text-red-400">Try again</Button>
        </div>
      ) : isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4" aria-label="Loading county">{Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : data?.needsCounty || data?.notLoaded ? (
        <p className="text-sm text-slate-400">{data.message || 'That county wasn’t found. Pick one from the list.'}</p>
      ) : !data || typeof data.county.name !== 'string' || !data.county.name || typeof data.county.fips !== 'string' || !data.county.fips ? (
        <div role="alert" className="rounded-lg border border-amber-500/30 bg-amber-900/20 p-6 space-y-3">
         <p className="text-sm text-amber-400">County intelligence is unavailable. Retry or select another county. If this continues, ask your administrator to check the county data.</p>
         <Button variant="outline" size="sm" onClick={() => refetch()}>Retry county data</Button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <h2 className="text-lg font-semibold text-slate-100">{data.county.name}, {typeof data.state === 'string' ? data.state : url.state}</h2>
            <Badge variant="outline" className="text-slate-400">FIPS {data.county.fips}</Badge>
            {finiteNumber(data.zip_areas) != null && <Badge variant="outline" className="text-slate-400">{count(data.zip_areas)} ZIP areas</Badge>}
            {isFetching && <span className="text-xs text-slate-400">Refreshing…</span>}
          </div>
          {partial && <div role="status" className="rounded-lg border border-amber-500/30 p-3 text-sm text-amber-400">
            Some county data is unavailable. Missing measurements are not zero. Retry to refresh the available sections.
            <Button variant="outline" size="sm" onClick={() => refetch()} className="ml-2">Retry county data</Button>
          </div>}
          {(data.sample?.sampled === true || data.sample?.details_cover_all === false || data.sample?.facilities_capped === true || data.sample?.providers_capped === true) && (
            <p className="flex items-start gap-1.5 text-xs text-slate-400">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
              {data.sample.sampled === true
                ? `This county has more practice locations than we read at once; specialties and provider types describe ${finiteNumber(summary.sampledProviders) != null ? `${count(summary.sampledProviders)} of them` : 'a limited sample'}.`
                : ''}
              {data.sample.details_cover_all === false && (finiteNumber(data.sample.detail_limit) != null
                ? ` Referrals and services are from the first ${count(data.sample.detail_limit)} providers.`
                : ' Referrals and services cover a limited provider sample.')}
              {data.sample.facilities_capped === true && (finiteNumber(data.sample.facility_limit) != null
                ? ` Facility totals cover the newest ${count(data.sample.facility_limit)} facility records.`
                : ' Facility totals cover a limited set of the newest facility records.')}
              {data.sample.providers_capped === true && (finiteNumber(data.sample.provider_limit) != null && finiteNumber(data.sample.providers_found) != null
                ? ` The provider list shows the ${count(data.sample.provider_limit)} highest-scored of ${count(data.sample.providers_found)} providers.`
                : ' The provider list is limited to the highest-scored providers; it is not a complete county count.')}
            </p>
          )}

          <Tabs value={tab} onValueChange={(next) => setUrl({ tab: next })}>
            <TabsList className="bg-slate-800/50 mb-4 h-auto flex flex-wrap">
              {tabs.map((t) => (
                <TabsTrigger key={t.value} value={t.value} className="gap-1.5 text-xs"><t.icon className="w-3.5 h-3.5" aria-hidden="true" /> {t.label}</TabsTrigger>
              ))}
            </TabsList>
            {profile && (
              <button type="button" className="mb-3 text-xs text-cyan-400 hover:underline" onClick={() => setEveryLine((v) => !v)}>
                {everyLine ? `Show only ${profile.label}` : 'Show every part of the county'}
              </button>
            )}

            <TabsContent value="overview" className="mt-0 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {summary.providersExact === true ? (
              <Kpi icon={Users} color="text-cyan-400" label="Providers practicing here"
                value={count(summary.totalProviders)}
                sub={`${count(summary.individualProviders)} individuals · ${count(summary.orgProviders)} organizations`} />
            ) : (
              <Kpi icon={Users} color="text-cyan-400" label="Practice locations here"
                value={finiteNumber(summary.practiceLocations) != null
                  ? `≈${count(summary.practiceLocations)}`
                  : finiteNumber(summary.locationSample) != null ? `More than ${count(summary.locationSample)}` : 'Not available'}
                sub="A provider with several locations counts more than once." />
            )}
            <Kpi icon={Building2} color="text-violet-400" label="Medicare facilities" value={count(summary.totalFacilities)} />
            <Kpi icon={DollarSign} color="text-emerald-400" label="Facility Medicare payments" value={formatCurrency(summary.totalPayments)}
              sub={finiteNumber(summary.totalPayments) ? null : 'Not reported in the imported facility data'} />
            <Kpi icon={Activity} color="text-amber-400" label="Facility discharges" value={count(summary.totalDischarges)} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="bg-slate-800/50 border-slate-700/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-200 flex items-center gap-2">
                  <Stethoscope className="w-4 h-4 text-cyan-400" aria-hidden="true" /> Top specialties
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.topSpecialties.length === 0 ? <p className="text-sm text-slate-400">{emptyMessage('topSpecialties', 'No specialties on file for this county.')}</p> : (
                  <ul className="space-y-1.5">
                    {list('spec', data.topSpecialties, 10).map((s) => {
                      const max = Math.max(1, ...data.topSpecialties.map((row) => finiteNumber(row.count) ?? 0));
                      return (
                        <li key={s.name} className="flex items-center gap-2 text-xs">
                          <span className="w-44 truncate text-slate-300">{s.name}</span>
                          <span className="flex-1 h-2 rounded bg-slate-900">{finiteNumber(s.count) != null && <span className="block h-2 rounded bg-cyan-500" style={{ width: `${(Number(s.count) / max) * 100}%` }} />}</span>
                          <span className="w-10 text-right text-slate-400">{count(s.count)}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {data.topSpecialties.length > 10 && (
                  <Button variant="ghost" size="sm" className="mt-2 text-xs text-cyan-400" onClick={() => toggle('spec')}>{showAll.spec ? 'Show fewer' : `Show all ${data.topSpecialties.length}`}</Button>
                )}
              </CardContent>
            </Card>

            <Card className="bg-slate-800/50 border-slate-700/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-200 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-emerald-400" aria-hidden="true" /> Top Medicare services
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.topServices.length === 0 ? <p className="text-sm text-slate-400">{emptyMessage('topServices', 'No Medicare utilization imported for these providers.')}</p> : (
                  <ul className="space-y-1.5 text-xs">
                    {data.topServices.map((s) => (
                      <li key={s.code} className="flex items-center justify-between gap-2">
                        <span className="truncate text-slate-300"><span className="font-mono text-slate-400 mr-1">{s.code}</span>{s.name}</span>
                        <span className="shrink-0 text-emerald-400">{formatCurrency(s.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="bg-slate-800/50 border-slate-700/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-200 flex items-center gap-2">
                  <Network className="w-4 h-4 text-amber-400" aria-hidden="true" /> Strongest referral relationships
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.referrals.length === 0 ? <p className="text-sm text-slate-400">{emptyMessage('referrals', 'No referral data for providers here.')}</p> : (
                  <ul className="space-y-1.5">
                    {list('ref', data.referrals, 10).map((r) => (
                      <li key={`${r.fromNpi}>${r.toNpi}`} className="flex items-center gap-2 text-xs">
                        <Link to={createPageUrl(`ProviderDetail?npi=${r.fromNpi}`)} className="truncate text-cyan-400 hover:underline">{r.fromName || r.fromNpi}</Link>
                        <ArrowRight className="w-3 h-3 shrink-0 text-slate-400" aria-label="sends to" />
                        <Link to={createPageUrl(`ProviderDetail?npi=${r.toNpi}`)} className="truncate text-cyan-400 hover:underline">{r.toName || r.toNpi}</Link>
                        <span className="ml-auto shrink-0 text-slate-300">{count(r.totalReferrals)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {data.referrals.length > 10 && (
                  <Button variant="ghost" size="sm" className="mt-2 text-xs text-cyan-400" onClick={() => toggle('ref')}>{showAll.ref ? 'Show fewer' : `Show all ${data.referrals.length}`}</Button>
                )}
              </CardContent>
            </Card>

            <Card className="bg-slate-800/50 border-slate-700/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-200 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-violet-400" aria-hidden="true" /> Facilities
                </CardTitle>
                {data.facilitySummary.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {data.facilitySummary.map((f) => (
                      <Badge key={f.type} variant="outline" className="text-[10px] text-slate-300">
                        {FACILITY_LABELS[f.type] || f.type}: {f.count}{f.avgRating ? ` · ★${f.avgRating}` : ''}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardHeader>
              <CardContent>
                {facilities.length === 0 ? <p className="text-sm text-slate-400">{emptyMessage('facilities', 'No Medicare facilities found in this county.')}</p> : (
                  <ul className="space-y-1.5">
                    {list('fac', facilities, 10).map((f) => {
                      const body = (
                        <>
                          <span className="truncate text-slate-200">{f.name || f.providerId}</span>
                          <span className="shrink-0 text-slate-400">{FACILITY_LABELS[f.group] || f.group} · {f.city}</span>
                        </>
                      );
                      // Facility Detail looks facilities up by CMS provider number;
                      // a record without one has no page to open.
                      return (
                        <li key={f.id}>
                          {f.providerId ? (
                            <Link to={createPageUrl(`FacilityDetail?id=${encodeURIComponent(f.providerId)}&group=${f.group}`)} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-900/30 hover:bg-slate-900/60 text-xs">
                              {body}
                            </Link>
                          ) : (
                            <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-900/30 text-xs">{body}</div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {facilities.length > 10 && (
                  <Button variant="ghost" size="sm" className="mt-2 text-xs text-cyan-400" onClick={() => toggle('fac')}>{showAll.fac ? 'Show fewer' : `Show all ${facilities.length}`}</Button>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="bg-slate-800/50 border-slate-700/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-200 flex items-center gap-2">
                <Users className="w-4 h-4 text-cyan-400" aria-hidden="true" /> Providers (highest scored first)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.providers.length === 0 ? <p className="text-sm text-slate-400">{emptyMessage('providers', 'No providers found.')}</p> : (
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {list('prov', data.providers, 20).map((p) => (
                    <li key={p.npi}>
                      <Link to={createPageUrl(`ProviderDetail?npi=${p.npi}`)} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-900/30 hover:bg-slate-900/60 text-xs">
                        <span className="min-w-0">
                          <span className="block truncate text-slate-200">{p.name}</span>
                          <span className="block truncate text-slate-400">{p.specialty || (p.entityType === 'Organization' ? 'Organization' : 'Specialty unknown')}</span>
                        </span>
                        <Badge className={`shrink-0 text-[10px] ${p.score == null ? 'bg-slate-700 text-slate-300' : 'bg-teal-900/30 text-teal-400'}`}>
                          {p.score == null ? 'Unscored' : p.score}
                        </Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {data.providers.length > 20 && (
                <Button variant="ghost" size="sm" className="mt-2 text-xs text-cyan-400" onClick={() => toggle('prov')}>{showAll.prov ? 'Show fewer' : data.sample?.providers_capped ? `Show the top ${data.providers.length}` : `Show all ${data.providers.length}`}</Button>
              )}
            </CardContent>
          </Card>
            </TabsContent>

            {['market', 'hospitals', 'competitors', 'referrals'].map((tab) => (
              <TabsContent key={tab} value={tab} className="mt-0 space-y-4">
                <ComplianceDisclaimer variant="market" />
                {tab === 'referrals' ? (
                  <ReferralSourcesTable key={`${everyLine ? 'all' : (profile?.referralSetting || 'all')}:${url.county}`} state={url.state} countyFips={data.county.fips} countyName={data.county.name} initialSetting={everyLine ? 'all' : (profile?.referralSetting || 'all')} />
                ) : marketError ? (
                  <p className="text-sm text-red-400" role="alert">Couldn't load the market data: {marketErr?.message}</p>
                ) : loadingMarket ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4" aria-label="Loading market">{Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
                ) : !isRecord(market) || market.needsCounty || market.notLoaded ? (
                  <div role="status" className="text-sm text-amber-400">Market data is unavailable. Retry or ask your administrator to check imports and market rollups.
                    <Button variant="outline" size="sm" onClick={() => refetchMarket()}>Retry market data</Button>
                  </div>
                ) : tab === 'market' ? (
                  <>
                    <CountyMarketProfile profile={market.profile} vintages={market.vintages} rollups={market.rollups} countyName={data.county.name} line={everyLine ? null : profile} />
                    <CountyReferenceCard reference={market.reference} line={everyLine ? null : profile} />
                  </>
                ) : tab === 'hospitals' ? (
                  <HospitalSourcesTable sources={market.hospital_sources} rollups={market.rollups} countyName={data.county.name} />
                ) : (
                  <PacCompetitorsTable competitors={market.competitors} trends={market.trends} coverage={market.coverage} licensed={market.licensed} labels={market.labels} rollups={market.rollups} countyName={data.county.name} />
                )}
              </TabsContent>
            ))}
          </Tabs>
        </>
      )}
    </div>
  );
}

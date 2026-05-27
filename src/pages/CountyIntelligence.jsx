import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  MapPin, Users, Building2, DollarSign, Activity,
  Search, ChevronDown, ArrowRight, BarChart3, Network, Stethoscope
} from 'lucide-react';

function formatCurrency(val) {
  if (!val) return '$0';
  const num = Number(val);
  if (num >= 1e9) return `$${(num / 1e9).toFixed(1)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(0)}K`;
  return `$${num.toLocaleString()}`;
}

const FACILITY_TYPE_LABELS = {
  hospital: 'Hospitals',
  home_health: 'Home Health',
  hospice: 'Hospice',
  snf: 'Nursing Facilities',
  irf: 'Inpatient Rehab',
  ltch: 'Long-Term Care',
  dme: 'DME Suppliers',
  community_health: 'Community Health',
};

const FACILITY_TYPE_COLORS = {
  hospital: 'text-blue-400 bg-blue-900/30 border-blue-500/30',
  home_health: 'text-green-400 bg-green-900/30 border-green-500/30',
  hospice: 'text-purple-400 bg-purple-900/30 border-purple-500/30',
  snf: 'text-amber-400 bg-amber-900/30 border-amber-500/30',
  irf: 'text-rose-400 bg-rose-900/30 border-rose-500/30',
  ltch: 'text-orange-400 bg-orange-900/30 border-orange-500/30',
  dme: 'text-cyan-400 bg-cyan-900/30 border-cyan-500/30',
  community_health: 'text-lime-400 bg-lime-900/30 border-lime-500/30',
};

export default function CountyIntelligence() {
  const [selectedState, setSelectedState] = useState('');
  const [selectedCity, setSelectedCity] = useState('');
  const [showAllSpecialties, setShowAllSpecialties] = useState(false);
  const [showAllFacilities, setShowAllFacilities] = useState(false);
  const [showAllProviders, setShowAllProviders] = useState(false);

  const { data: geo, isLoading: loadingGeo } = useQuery({
    queryKey: ['availableStatesCounties'],
    queryFn: () => base44.functions.invoke('getAvailableStatesCounties', {}),
    staleTime: 300000,
    select: (res) => res?.data || res,
  });

  const states = useMemo(() => geo?.states || [], [geo]);
  const [citySearch, setCitySearch] = useState('');

  const [debouncedCity, setDebouncedCity] = useState('');

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedCity(selectedCity);
    }, 500);
    return () => clearTimeout(timer);
  }, [selectedCity]);

  const { data: countyData, isLoading: loadingData, isFetching } = useQuery({
    queryKey: ['countyIntelligence', selectedState, debouncedCity],
    queryFn: () => base44.functions.invoke('getCountyIntelligence', {
      state: selectedState,
      county: debouncedCity || undefined,
    }),
    enabled: !!selectedState,
    staleTime: 60000,
    select: (res) => res?.data || res,
  });

  const summary = countyData?.summary || {};
  const topSpecialties = countyData?.topSpecialties || [];
  const facilitySummary = countyData?.facilitySummary || [];
  const facilities = countyData?.facilities || [];
  const providers = countyData?.providers || [];
  const referrals = countyData?.referrals || [];
  const topServices = countyData?.topServices || [];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <MapPin className="w-6 h-6 text-cyan-400" />
            County Intelligence
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Analyze provider and facility landscape by state and city
          </p>
        </div>
      </div>

      <Card className="bg-slate-800/50 border-slate-700/50">
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex items-center gap-2 flex-1">
              <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <select
                value={selectedState}
                onChange={(e) => { setSelectedState(e.target.value); setSelectedCity(''); }}
                className="flex-1 min-w-[120px] bg-slate-900/50 border border-slate-700/50 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50"
              >
                <option value="">Select State...</option>
                {states.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <input
                type="text"
                value={selectedCity}
                onChange={(e) => setSelectedCity(e.target.value)}
                placeholder="Filter by city (optional)..."
                className="flex-1 min-w-[160px] bg-slate-900/50 border border-slate-700/50 rounded-md px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/50"
                disabled={!selectedState}
              />
            </div>
            {selectedState && (
              <Badge className="bg-cyan-900/30 text-cyan-400 border-cyan-500/30">
                {selectedState}{selectedCity ? ` / ${selectedCity}` : ''}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {!selectedState && !loadingGeo && (
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardContent className="py-16 text-center">
            <MapPin className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400 text-lg">Select a state to explore provider and facility data</p>
            <p className="text-slate-500 text-sm mt-2">
              {states.length > 0 ? `${states.length} states available` : 'Loading states...'}
            </p>
          </CardContent>
        </Card>
      )}

      {loadingGeo && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-24 bg-slate-800" />)}
        </div>
      )}

      {(loadingData || isFetching) && selectedState && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-24 bg-slate-800" />)}
          </div>
          <Skeleton className="h-64 bg-slate-800" />
        </div>
      )}

      {countyData && !loadingData && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <Card className="bg-slate-800/50 border-slate-700/50">
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-1.5 text-slate-400 text-[10px] mb-1">
                  <Users className="w-3 h-3" />Total Providers
                </div>
                <div className="text-xl font-bold text-slate-100">{summary.totalProviders?.toLocaleString() || 0}</div>
              </CardContent>
            </Card>
            <Card className="bg-slate-800/50 border-slate-700/50">
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-1.5 text-slate-400 text-[10px] mb-1">
                  <Stethoscope className="w-3 h-3" />Individual
                </div>
                <div className="text-xl font-bold text-cyan-400">{summary.individualProviders?.toLocaleString() || 0}</div>
              </CardContent>
            </Card>
            <Card className="bg-slate-800/50 border-slate-700/50">
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-1.5 text-slate-400 text-[10px] mb-1">
                  <Building2 className="w-3 h-3" />Organizations
                </div>
                <div className="text-xl font-bold text-violet-400">{summary.orgProviders?.toLocaleString() || 0}</div>
              </CardContent>
            </Card>
            <Card className="bg-slate-800/50 border-slate-700/50">
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-1.5 text-slate-400 text-[10px] mb-1">
                  <Building2 className="w-3 h-3" />Facilities
                </div>
                <div className="text-xl font-bold text-emerald-400">{summary.totalFacilities?.toLocaleString() || 0}</div>
              </CardContent>
            </Card>
            <Card className="bg-slate-800/50 border-slate-700/50">
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-1.5 text-slate-400 text-[10px] mb-1">
                  <DollarSign className="w-3 h-3" />Total Payments
                </div>
                <div className="text-xl font-bold text-amber-400">{formatCurrency(summary.totalPayments)}</div>
              </CardContent>
            </Card>
            <Card className="bg-slate-800/50 border-slate-700/50">
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-1.5 text-slate-400 text-[10px] mb-1">
                  <Activity className="w-3 h-3" />Discharges
                </div>
                <div className="text-xl font-bold text-rose-400">{summary.totalDischarges?.toLocaleString() || 0}</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="bg-slate-800/50 border-slate-700/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-slate-200 flex items-center gap-2">
                  <Stethoscope className="w-4 h-4 text-cyan-400" />
                  Top Specialties
                </CardTitle>
              </CardHeader>
              <CardContent>
                {topSpecialties.length === 0 ? (
                  <p className="text-sm text-slate-500">No specialty data</p>
                ) : (
                  <div className="space-y-2">
                    {(showAllSpecialties ? topSpecialties : topSpecialties.slice(0, 10)).map((s, i) => {
                      const maxCount = topSpecialties[0]?.count || 1;
                      return (
                        <div key={i} className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="text-xs text-slate-300 truncate">{s.name}</span>
                              <span className="text-xs text-slate-400 ml-2 flex-shrink-0">{s.count}</span>
                            </div>
                            <div className="h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400 rounded-full transition-all"
                                style={{ width: `${(s.count / maxCount) * 100}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {topSpecialties.length > 10 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-cyan-400 hover:text-cyan-300 w-full mt-1"
                        onClick={() => setShowAllSpecialties(!showAllSpecialties)}
                      >
                        <ChevronDown className={`w-3.5 h-3.5 mr-1 transition-transform ${showAllSpecialties ? 'rotate-180' : ''}`} />
                        {showAllSpecialties ? 'Show less' : `Show all ${topSpecialties.length}`}
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="bg-slate-800/50 border-slate-700/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-slate-200 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-emerald-400" />
                  Facilities by Type
                </CardTitle>
              </CardHeader>
              <CardContent>
                {facilitySummary.length === 0 ? (
                  <p className="text-sm text-slate-500">No facility data</p>
                ) : (
                  <div className="space-y-3">
                    {facilitySummary.map((f, i) => (
                      <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/30 border border-slate-700/30">
                        <div className="flex items-center gap-2">
                          <Badge className={FACILITY_TYPE_COLORS[f.type] || 'bg-slate-700/50 text-slate-300 border-slate-600/50'}>
                            {FACILITY_TYPE_LABELS[f.type] || f.type}
                          </Badge>
                          <span className="text-sm font-medium text-slate-200">{f.count}</span>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-slate-400">
                          <span>{formatCurrency(f.totalPayments)}</span>
                          {f.avgRating && (
                            <span className="text-amber-400">{f.avgRating} avg</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {topServices.length > 0 && (
            <Card className="bg-slate-800/50 border-slate-700/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-slate-200 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-violet-400" />
                  Top Services by Medicare Payment
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {topServices.map((s, i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded bg-slate-900/30 border border-slate-700/30">
                      <span className="text-xs text-slate-300 truncate flex-1 mr-2">{s.name}</span>
                      <span className="text-xs font-medium text-amber-400 flex-shrink-0">{formatCurrency(s.amount)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {referrals.length > 0 && (
            <Card className="bg-slate-800/50 border-slate-700/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-slate-200 flex items-center gap-2">
                  <Network className="w-4 h-4 text-orange-400" />
                  Top Referral Flows
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-800/70">
                        <th className="text-left py-2 px-3 text-slate-400 font-medium text-xs">From NPI</th>
                        <th className="text-left py-2 px-3 text-slate-400 font-medium text-xs">To</th>
                        <th className="text-right py-2 px-3 text-slate-400 font-medium text-xs">Referrals</th>
                        <th className="text-right py-2 px-3 text-slate-400 font-medium text-xs">Beneficiaries</th>
                      </tr>
                    </thead>
                    <tbody>
                      {referrals.slice(0, 20).map((r, i) => (
                        <tr key={i} className="border-t border-slate-800/50 hover:bg-slate-800/30">
                          <td className="py-2 px-3 text-slate-300 font-mono text-xs">
                            <Link to={createPageUrl('ProviderDetail') + `?npi=${r.fromNpi}`} className="text-cyan-400 hover:underline">
                              {r.fromNpi}
                            </Link>
                          </td>
                          <td className="py-2 px-3">
                            <div className="text-slate-300 text-xs">{r.toName || r.toNpi}</div>
                            {r.toNpi && (
                              <Link to={createPageUrl('ProviderDetail') + `?npi=${r.toNpi}`} className="text-[10px] text-cyan-400 hover:underline">
                                {r.toNpi}
                              </Link>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right text-slate-200 font-medium text-xs">{r.totalReferrals?.toLocaleString()}</td>
                          <td className="py-2 px-3 text-right text-slate-400 text-xs">{r.totalBeneficiaries?.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="bg-slate-800/50 border-slate-700/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-slate-200 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-blue-400" />
                  Top Facilities
                  {facilities.length > 0 && (
                    <Badge className="bg-slate-700/50 text-slate-400 border-slate-600/50 text-[10px] ml-auto">{facilities.length}</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {facilities.length === 0 ? (
                  <p className="text-sm text-slate-500">No facilities found</p>
                ) : (
                  <div className="space-y-2">
                    {(showAllFacilities ? facilities : facilities.slice(0, 10)).map((f, i) => (
                      <Link
                        key={i}
                        to={createPageUrl('FacilityDetail') + `?id=${f.providerId}&group=${f.type}`}
                        className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/30 border border-slate-700/30 hover:border-cyan-500/30 transition-colors group"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-200 truncate group-hover:text-cyan-300">{f.name || 'Unknown'}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Badge className={`text-[9px] ${FACILITY_TYPE_COLORS[f.type] || 'bg-slate-700/50 text-slate-300 border-slate-600/50'}`}>
                              {FACILITY_TYPE_LABELS[f.type] || f.type}
                            </Badge>
                            <span className="text-[10px] text-slate-500">{f.city}</span>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0 ml-3">
                          {f.qualityRating && (
                            <span className="text-xs text-amber-400">{f.qualityRating}/5</span>
                          )}
                          <p className="text-[10px] text-slate-400">{formatCurrency(f.totalPayments)}</p>
                        </div>
                      </Link>
                    ))}
                    {facilities.length > 10 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-cyan-400 hover:text-cyan-300 w-full mt-1"
                        onClick={() => setShowAllFacilities(!showAllFacilities)}
                      >
                        {showAllFacilities ? 'Show less' : `Show all ${facilities.length}`}
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="bg-slate-800/50 border-slate-700/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-slate-200 flex items-center gap-2">
                  <Users className="w-4 h-4 text-cyan-400" />
                  Providers
                  {providers.length > 0 && (
                    <Badge className="bg-slate-700/50 text-slate-400 border-slate-600/50 text-[10px] ml-auto">{providers.length}</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {providers.length === 0 ? (
                  <p className="text-sm text-slate-500">No providers found</p>
                ) : (
                  <div className="space-y-2">
                    {(showAllProviders ? providers : providers.slice(0, 10)).map((p, i) => (
                      <Link
                        key={i}
                        to={createPageUrl('ProviderDetail') + `?npi=${p.npi}`}
                        className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/30 border border-slate-700/30 hover:border-cyan-500/30 transition-colors group"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-200 truncate group-hover:text-cyan-300">{p.name || 'Unknown'}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Badge className={`text-[9px] ${p.entityType === '2' ? 'bg-violet-900/30 text-violet-400 border-violet-500/30' : 'bg-cyan-900/30 text-cyan-400 border-cyan-500/30'}`}>
                              {p.entityType === '2' ? 'Org' : 'Individual'}
                            </Badge>
                            {p.specialty && (
                              <span className="text-[10px] text-slate-500 truncate">{p.specialty}</span>
                            )}
                          </div>
                        </div>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-cyan-400 flex-shrink-0 ml-2" />
                      </Link>
                    ))}
                    {providers.length > 10 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-cyan-400 hover:text-cyan-300 w-full mt-1"
                        onClick={() => setShowAllProviders(!showAllProviders)}
                      >
                        {showAllProviders ? 'Show less' : `Show all ${providers.length}`}
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

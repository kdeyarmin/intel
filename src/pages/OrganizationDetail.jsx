import React, { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, PieChart, Pie, Cell } from 'recharts';
import { ArrowLeft, Building2, Users, MapPin, DollarSign, Activity, Stethoscope, GitBranch } from 'lucide-react';
import AIDataEnrichmentPanel from '../components/ai/AIDataEnrichmentPanel';

const PIE_COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ec4899', '#06b6d4', '#f97316'];

export default function OrganizationDetail() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const npi = searchParams.get('npi');

  const { data: providers = [], isLoading: loadingProv } = useQuery({
    queryKey: ['orgProvider', npi],
    queryFn: () => base44.entities.Provider.filter({ npi }),
    enabled: !!npi,
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['orgLocations', npi],
    queryFn: () => base44.entities.ProviderLocation.filter({ npi }),
    enabled: !!npi,
  });

  const { data: taxonomies = [] } = useQuery({
    queryKey: ['orgTaxonomies', npi],
    queryFn: () => base44.entities.ProviderTaxonomy.filter({ npi }),
    enabled: !!npi,
  });

  const { data: utilizations = [] } = useQuery({
    queryKey: ['orgUtil', npi],
    queryFn: () => base44.entities.CMSUtilization.filter({ npi }),
    enabled: !!npi,
  });

  const { data: referrals = [] } = useQuery({
    queryKey: ['orgRef', npi],
    queryFn: () => base44.entities.CMSReferral.filter({ npi }),
    enabled: !!npi,
  });

  const { data: scores = [] } = useQuery({
    queryKey: ['orgScore', npi],
    queryFn: () => base44.entities.LeadScore.filter({ npi }),
    enabled: !!npi,
  });

  // Find affiliated individual providers at same locations
  const { data: allProviders = [] } = useQuery({
    queryKey: ['allProviders-org'],
    queryFn: () => base44.entities.Provider.list('-created_date', 500),
    staleTime: 60000,
  });

  const { data: allLocations = [] } = useQuery({
    queryKey: ['allLocations-org'],
    queryFn: () => base44.entities.ProviderLocation.list('-created_date', 500),
    staleTime: 60000,
  });

  const queryClient = useQueryClient();
  const provider = providers?.[0];
  const score = scores?.[0];

  // Affiliated providers: others at same address
  const affiliatedNPIs = useMemo(() => {
    if (!locations.length || !allLocations.length) return [];
    const orgAddresses = locations.map(l => `${l.address_1}|${l.city}|${l.state}`);
    const npis = new Set();
    allLocations.forEach(l => {
      const key = `${l.address_1}|${l.city}|${l.state}`;
      if (orgAddresses.includes(key) && l.npi !== npi) npis.add(l.npi);
    });
    return [...npis];
  }, [locations, allLocations, npi]);

  const affiliatedProviders = allProviders.filter(p => affiliatedNPIs.includes(p.npi) && p.entity_type === 'Individual');

  // Utilization chart data
  const utilChart = useMemo(() =>
    [...utilizations].sort((a, b) => (a.year || 0) - (b.year || 0)).map(u => ({
      year: u.year,
      beneficiaries: u.total_medicare_beneficiaries || 0,
      payments: Math.round((u.total_medicare_payment || 0) / 1000),
    })),
    [utilizations]
  );

  // Referral pie data
  const referralPie = useMemo(() => {
    const latest = [...referrals].sort((a, b) => (b.year || 0) - (a.year || 0))[0];
    if (!latest) return [];
    return [
      { name: 'Home Health', value: latest.home_health_referrals || 0 },
      { name: 'Hospice', value: latest.hospice_referrals || 0 },
      { name: 'SNF', value: latest.snf_referrals || 0 },
      { name: 'DME', value: latest.dme_referrals || 0 },
      { name: 'Imaging', value: latest.imaging_referrals || 0 },
    ].filter(d => d.value > 0);
  }, [referrals]);

  const latestUtil = [...utilizations].sort((a, b) => (b.year || 0) - (a.year || 0))[0];
  const latestRef = [...referrals].sort((a, b) => (b.year || 0) - (a.year || 0))[0];

  if (loadingProv) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-48" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><Skeleton className="h-64" /><Skeleton className="h-64" /></div>
      </div>
    );
  }

  if (!provider) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[400px]">
        <p className="text-gray-500 text-lg mb-4">Organization not found</p>
        <Button variant="outline" onClick={() => navigate(-1)}><ArrowLeft className="w-4 h-4 mr-2" /> Go Back</Button>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto">
      <Button variant="ghost" className="mb-4" onClick={() => navigate(-1)}>
        <ArrowLeft className="w-4 h-4 mr-2" /> Back
      </Button>

      {/* Header */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2.5 rounded-lg bg-indigo-500/15">
                  <Building2 className="w-6 h-6 text-indigo-400" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-white">{provider.organization_name || 'Unknown Organization'}</h1>
                  <p className="text-sm text-slate-400 font-mono">NPI: {provider.npi}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                <Badge variant="outline">Organization</Badge>
                <Badge className={provider.status === 'Active' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}>
                  {provider.status}
                </Badge>
                {score && <Badge className="bg-amber-500/20 text-amber-400">Score: {score.score}/100</Badge>}
                {provider.needs_nppes_enrichment && <Badge className="bg-orange-500/20 text-orange-400">Needs Enrichment</Badge>}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
                <Users className="w-4 h-4 text-blue-400 mx-auto mb-1" />
                <p className="text-lg font-bold text-white">{(latestUtil?.total_medicare_beneficiaries || 0).toLocaleString()}</p>
                <p className="text-[10px] text-blue-400">Beneficiaries</p>
              </div>
              <div className="p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                <DollarSign className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
                <p className="text-lg font-bold text-white">${((latestUtil?.total_medicare_payment || 0) / 1000).toFixed(0)}K</p>
                <p className="text-[10px] text-emerald-400">Medicare Pay</p>
              </div>
              <div className="p-3 bg-violet-500/10 rounded-lg border border-violet-500/20">
                <GitBranch className="w-4 h-4 text-violet-400 mx-auto mb-1" />
                <p className="text-lg font-bold text-white">{(latestRef?.total_referrals || 0).toLocaleString()}</p>
                <p className="text-[10px] text-violet-400">Referrals</p>
              </div>
              <div className="p-3 bg-sky-500/10 rounded-lg border border-sky-500/20">
                <MapPin className="w-4 h-4 text-sky-400 mx-auto mb-1" />
                <p className="text-lg font-bold text-white">{locations.length}</p>
                <p className="text-[10px] text-sky-400">Locations</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Utilization Trend */}
        {utilChart.length > 1 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="w-4 h-4 text-teal-600" />
                Utilization Over Time
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={utilChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="beneficiaries" fill="#3b82f6" name="Beneficiaries" />
                  <Bar dataKey="payments" fill="#10b981" name="Payments ($K)" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Referral Breakdown Pie */}
        {referralPie.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-violet-600" />
                Referral Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={referralPie} cx="50%" cy="50%" innerRadius={50} outerRadius={90} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {referralPie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Taxonomies */}
      {taxonomies.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Stethoscope className="w-4 h-4 text-teal-600" />
              Specialties
              <Badge variant="outline" className="ml-auto text-xs">{taxonomies.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {taxonomies.map((t) => (
                <Badge key={t.id || t.taxonomy_code} variant="outline" className={t.primary_flag ? 'bg-teal-500/15 border-teal-500/30 text-teal-400' : ''}>
                  {t.taxonomy_description || t.taxonomy_code}
                  {t.primary_flag && ' (Primary)'}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Locations */}
      {locations.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="w-4 h-4 text-sky-600" />
              Locations
              <Badge variant="outline" className="ml-auto text-xs">{locations.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Address</TableHead>
                    <TableHead>City</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>ZIP</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Type</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {locations.map(l => (
                    <TableRow key={l.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {l.address_1 || '-'}
                          {l.is_primary && <Badge className="bg-blue-500/20 text-blue-400 text-[10px]">Primary</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>{l.city || '-'}</TableCell>
                      <TableCell>{l.state || '-'}</TableCell>
                      <TableCell className="font-mono text-xs">{l.zip || '-'}</TableCell>
                      <TableCell>{l.phone || '-'}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{l.location_type || '-'}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Enrichment */}
      <div className="mb-6">
        <AIDataEnrichmentPanel
          provider={provider}
          location={locations[0]}
          taxonomies={taxonomies}
          entityType="organization"
          onDataUpdated={() => {
            queryClient.invalidateQueries({ queryKey: ['orgProvider', npi] });
            queryClient.invalidateQueries({ queryKey: ['orgLocations', npi] });
            queryClient.invalidateQueries({ queryKey: ['orgTaxonomies', npi] });
          }}
        />
      </div>

      {/* Affiliated Providers */}
      {affiliatedProviders.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-600" />
              Affiliated Providers
              <Badge variant="outline" className="ml-auto text-xs">{affiliatedProviders.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>NPI</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Credential</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {affiliatedProviders.slice(0, 50).map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">{p.npi}</TableCell>
                      <TableCell className="font-medium">{p.last_name}, {p.first_name}</TableCell>
                      <TableCell>{p.credential || '-'}</TableCell>
                      <TableCell><Badge className={p.status === 'Active' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'} >{p.status}</Badge></TableCell>
                      <TableCell>
                        <Link to={createPageUrl(`ProviderDetail?npi=${p.npi}`)}>
                          <Button variant="outline" size="sm" className="text-xs h-7">View</Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useNavigate, Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, MapPin, Phone, Printer, Users, Building2, ExternalLink, Shield, Activity, GitBranch } from 'lucide-react';
import LocationGeoInsights from '../components/locations/LocationGeoInsights';
import ContactEnrichmentStatus from '../components/locations/ContactEnrichmentStatus';
import AIContactEnrichment from '../components/ai/AIContactEnrichment';
import AILocationInsights from '../components/ai/AILocationInsights';

export default function LocationDetail() {
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const locationId = params.get('id');

  const { data: allLocations = [], isLoading: loadingLoc } = useQuery({
    queryKey: ['locationDetail', locationId],
    queryFn: () => base44.entities.ProviderLocation.filter({ id: locationId }),
    enabled: !!locationId,
  });

  const location = allLocations[0];

  // Fetch all providers at this address (same address + city + state)
  const { data: coLocatedLocations = [] } = useQuery({
    queryKey: ['coLocated', location?.address_1, location?.city, location?.state],
    queryFn: () => base44.entities.ProviderLocation.filter({ city: location.city, state: location.state }),
    enabled: !!location?.city && !!location?.state,
  });

  // Get the NPIs of co-located providers
  const coLocatedNPIs = [...new Set(coLocatedLocations
    .filter(l => l.address_1 === location?.address_1 && l.city === location?.city)
    .map(l => l.npi)
    .filter(Boolean))];

  // Fetch those providers
  const { data: allProviders = [] } = useQuery({
    queryKey: ['locDetailProviders'],
    queryFn: () => base44.entities.Provider.list('-created_date', 500),
    staleTime: 60000,
  });

  const coProviders = allProviders.filter(p => coLocatedNPIs.includes(p.npi));

  // Fetch utilization data for the main NPI
  const { data: utilizations = [] } = useQuery({
    queryKey: ['locUtil', location?.npi],
    queryFn: () => base44.entities.CMSUtilization.filter({ npi: location.npi }),
    enabled: !!location?.npi,
  });

  // Fetch referrals for the main NPI
  const { data: referrals = [] } = useQuery({
    queryKey: ['locRef', location?.npi],
    queryFn: () => base44.entities.CMSReferral.filter({ npi: location.npi }),
    enabled: !!location?.npi,
  });

  const { data: matches = [] } = useQuery({
    queryKey: ['locMatches', location?.id],
    queryFn: () => base44.entities.ProviderLocationMatch.filter({ location_id: location.id }),
    enabled: !!location?.id,
  });

  // Fetch all locations for geo insights
  const { data: allLocationsForGeo = [] } = useQuery({
    queryKey: ['locDetailGeo'],
    queryFn: () => base44.entities.ProviderLocation.list('-created_date', 500),
    staleTime: 120000,
  });

  // Fetch the associated provider for enrichment status
  const { data: providerForLoc = [] } = useQuery({
    queryKey: ['provForLoc', location?.npi],
    queryFn: () => base44.entities.Provider.filter({ npi: location.npi }),
    enabled: !!location?.npi,
  });

  // Fetch taxonomies for associated provider
  const { data: locTaxonomies = [] } = useQuery({
    queryKey: ['locTax', location?.npi],
    queryFn: () => base44.entities.ProviderTaxonomy.filter({ npi: location.npi }),
    enabled: !!location?.npi,
  });

  // DQ alerts for this NPI
  const { data: dqAlerts = [] } = useQuery({
    queryKey: ['locDQ', location?.npi],
    queryFn: () => base44.entities.DataQualityAlert.filter({ npi: location.npi }),
    enabled: !!location?.npi,
  });

  const associatedProvider = providerForLoc[0];
  const openDQAlerts = dqAlerts.filter(a => a.status === 'open');

  if (loadingLoc) {
    return (
      <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-48" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!location) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[400px]">
        <p className="text-gray-500 text-lg mb-4">Location not found</p>
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Go Back
        </Button>
      </div>
    );
  }

  const latestUtil = [...utilizations].sort((a, b) => (b.year || 0) - (a.year || 0))[0];
  const latestRef = [...referrals].sort((a, b) => (b.year || 0) - (a.year || 0))[0];

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
      <Button variant="ghost" className="mb-4" onClick={() => navigate(-1)}>
        <ArrowLeft className="w-4 h-4 mr-2" /> Back
      </Button>

      {/* Header Card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-sky-600" />
            Location Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div>
                <p className="text-2xl font-bold text-slate-900">{location.address_1 || 'No address'}</p>
                {location.address_2 && <p className="text-slate-600">{location.address_2}</p>}
                <p className="text-slate-600">{location.city}, {location.state} {location.zip}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{location.location_type || 'Unknown Type'}</Badge>
                {location.is_primary && <Badge className="bg-blue-100 text-blue-700">Primary Location</Badge>}
                <Badge variant="outline" className="font-mono">NPI: {location.npi}</Badge>
              </div>
            </div>
            <div className="space-y-2">
              {location.phone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="w-4 h-4 text-slate-400" />
                  <span>{location.phone}</span>
                </div>
              )}
              {location.fax && (
                <div className="flex items-center gap-2 text-sm">
                  <Printer className="w-4 h-4 text-slate-400" />
                  <span>{location.fax}</span>
                </div>
              )}
              <Link to={createPageUrl(`ProviderDetail?npi=${location.npi}`)}>
                <Button variant="outline" size="sm" className="mt-2 gap-1.5">
                  <ExternalLink className="w-3.5 h-3.5" /> View Provider
                </Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main content 2-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Left column - main data */}
        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Utilization */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="w-4 h-4 text-blue-500" /> Provider Utilization
                </CardTitle>
              </CardHeader>
              <CardContent>
                {latestUtil ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-blue-50 rounded-lg">
                      <p className="text-[10px] text-blue-600 font-medium">Beneficiaries</p>
                      <p className="text-xl font-bold text-blue-900">{(latestUtil.total_medicare_beneficiaries || 0).toLocaleString()}</p>
                      <p className="text-[10px] text-blue-500">{latestUtil.year}</p>
                    </div>
                    <div className="p-3 bg-teal-50 rounded-lg">
                      <p className="text-[10px] text-teal-600 font-medium">Total Services</p>
                      <p className="text-xl font-bold text-teal-900">{(latestUtil.total_services || 0).toLocaleString()}</p>
                      <p className="text-[10px] text-teal-500">{latestUtil.year}</p>
                    </div>
                    <div className="p-3 bg-emerald-50 rounded-lg">
                      <p className="text-[10px] text-emerald-600 font-medium">Medicare Payment</p>
                      <p className="text-xl font-bold text-emerald-900">${(latestUtil.total_medicare_payment || 0).toLocaleString()}</p>
                    </div>
                    <div className="p-3 bg-violet-50 rounded-lg">
                      <p className="text-[10px] text-violet-600 font-medium">Drug Services</p>
                      <p className="text-xl font-bold text-violet-900">{(latestUtil.drug_services || 0).toLocaleString()}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 py-4 text-center">No utilization data</p>
                )}
              </CardContent>
            </Card>

            {/* Referral Summary */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <GitBranch className="w-4 h-4 text-violet-500" /> Referral Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                {latestRef ? (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center p-2.5 bg-slate-50 rounded-lg">
                      <span className="text-sm text-slate-600">Total Referrals</span>
                      <span className="text-lg font-bold">{(latestRef.total_referrals || 0).toLocaleString()}</span>
                    </div>
                    {[
                      { label: 'Home Health', value: latestRef.home_health_referrals, color: 'bg-blue-100 text-blue-800' },
                      { label: 'Hospice', value: latestRef.hospice_referrals, color: 'bg-purple-100 text-purple-800' },
                      { label: 'SNF', value: latestRef.snf_referrals, color: 'bg-amber-100 text-amber-800' },
                      { label: 'DME', value: latestRef.dme_referrals, color: 'bg-green-100 text-green-800' },
                      { label: 'Imaging', value: latestRef.imaging_referrals, color: 'bg-pink-100 text-pink-800' },
                    ].filter(r => r.value > 0).map(r => (
                      <div key={r.label} className="flex justify-between items-center px-2.5 py-1.5">
                        <span className="text-sm text-slate-600">{r.label}</span>
                        <Badge className={r.color}>{r.value}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 py-4 text-center">No referral data</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Specialties */}
          {locTaxonomies.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Provider Specialties</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {locTaxonomies.map(t => (
                    <Badge key={t.id} variant="outline" className={`text-xs ${t.primary_flag ? 'bg-blue-50 border-blue-200 text-blue-700' : ''}`}>
                      {t.taxonomy_description || t.taxonomy_code}
                      {t.primary_flag && <span className="ml-1 text-[9px]">★</span>}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right sidebar */}
        <div className="space-y-6">
          <LocationGeoInsights location={location} coProviders={coProviders} allLocations={allLocationsForGeo} />
          <ContactEnrichmentStatus location={location} provider={associatedProvider} />

          <AIContactEnrichment provider={associatedProvider || {}} location={location} taxonomies={locTaxonomies} />

          <AILocationInsights
            location={location}
            coProviders={coProviders}
            associatedProvider={associatedProvider}
            taxonomies={locTaxonomies}
            utilizations={utilizations}
            referrals={referrals}
          />

          {/* DQ Alerts summary */}
          {openDQAlerts.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="w-4 h-4 text-amber-500" />
                  Data Quality
                  <Badge className="bg-amber-100 text-amber-700 text-[10px] ml-auto">{openDQAlerts.length} open</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {openDQAlerts.slice(0, 4).map(a => (
                  <div key={a.id} className="text-xs bg-slate-50 rounded px-2.5 py-1.5 flex items-center gap-2">
                    <Badge variant="secondary" className={`text-[9px] shrink-0 ${a.severity === 'critical' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{a.severity}</Badge>
                    <span className="truncate text-slate-600">{a.summary}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Co-located providers */}
      {coProviders.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="w-4 h-4 text-indigo-600" />
              Providers at This Address
              <Badge variant="outline" className="ml-auto text-xs">{coProviders.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>NPI</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Credential</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {coProviders.map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">{p.npi}</TableCell>
                      <TableCell className="font-medium">
                        {p.entity_type === 'Individual' ? `${p.last_name}, ${p.first_name}` : p.organization_name}
                      </TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{p.entity_type}</Badge></TableCell>
                      <TableCell>{p.credential || '-'}</TableCell>
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

      {/* AI Matches */}
      {matches.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4 text-violet-600" />
              AI-Matched Providers
              <Badge variant="outline" className="ml-auto text-xs">{matches.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {matches.sort((a, b) => (b.confidence_score || 0) - (a.confidence_score || 0)).map(m => (
                <div key={m.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="text-sm font-medium">{m.provider_name || m.npi}</p>
                    <div className="flex gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">Conf: {m.confidence_score}%</Badge>
                      <Badge variant="outline" className="text-xs">{m.status}</Badge>
                    </div>
                  </div>
                  <Link to={createPageUrl(`ProviderDetail?npi=${m.npi}`)}>
                    <Button variant="outline" size="sm" className="text-xs h-7">View Provider</Button>
                  </Link>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { invokeOrThrow, toastFunctionError } from '@/api/functionResult';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Zap, ShieldCheck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import EnrichmentMergePanel from './EnrichmentMergePanel';

const NPI_STATUS_LABELS = { active: 'Active', deactivated: 'Deactivated', not_found: 'Not in registry' };

export default function ExternalDataDisplay({ npi, provider, onEnrichmentComplete }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [checking, setChecking] = useState(false);
  const [tab, setTab] = useState(null);
  const { data: medicareData, isLoading: loadingMedicare } = useQuery({
    queryKey: ['providerMedicareCompare', npi],
    queryFn: () => base44.entities.ProviderMedicareCompare.filter({ npi }),
    enabled: !!npi,
    staleTime: 86400000, // 24 hours
  });

  const { data: npiValidation, isLoading: loadingNPI, refetch: refetchNPI } = useQuery({
    queryKey: ['providerNPIValidation', npi],
    queryFn: () => base44.entities.ProviderNPIValidation.filter({ npi }),
    enabled: !!npi,
    staleTime: 86400000,
  });

  const { data: deaData, isLoading: loadingDEA } = useQuery({
    queryKey: ['providerDEASchedules', npi],
    queryFn: () => base44.entities.ProviderDEASchedules.filter({ npi }),
    enabled: !!npi,
    staleTime: 86400000,
  });

  const handleCheckRegistry = async () => {
    setChecking(true);
    try {
      const data = await invokeOrThrow('validateProviderNPI', { npi, checkDiscrepancies: true });
      const v = data.validation || {};
      const diffs = v.discrepancies?.length || 0;
      if (v.status === 'active') {
        (diffs ? toast.warning : toast.success)(
          diffs ? `NPI is active. ${diffs} detail${diffs === 1 ? '' : 's'} differ from the registry.` : 'NPI is active and matches the registry.',
        );
      } else if (v.status === 'deactivated') {
        toast.warning('The registry lists this NPI as deactivated.');
      } else {
        toast.warning('This NPI isn\'t in the NPI Registry. It may have been deactivated.');
      }
      await refetchNPI();
      setTab('npi');
      onEnrichmentComplete?.();
    } catch (error) {
      toastFunctionError(error, "Couldn't check the NPI Registry");
    } finally {
      setChecking(false);
    }
  };

  if (!npi) return null;
  const medicare = medicareData?.[0];
  const npi_val = npiValidation?.[0];
  const dea = deaData?.[0];
  const loading = loadingMedicare || loadingNPI || loadingDEA;
  const available = [medicare && 'medicare', npi_val && 'npi', dea && 'dea'].filter(Boolean);
  const activeTab = available.includes(tab) ? tab : available[0];
  const checkedAt = npi_val?.checked_at || npi_val?.validated_at;

  return (
    <Card className="bg-slate-900 border-slate-700">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-white">
            <Zap className="w-5 h-5 text-blue-400" />
            External Data Enrichment
          </CardTitle>
          <Button
            onClick={handleCheckRegistry}
            disabled={checking}
            variant="outline"
            size="sm"
            className="gap-2 text-slate-200 border-slate-600 hover:border-slate-500"
          >
            {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            {checking ? 'Checking…' : npi_val ? 'Re-check NPI Registry' : 'Check NPI Registry'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {available.length === 0 ? (
          <p className="text-sm text-slate-400">
            {loading ? 'Loading…' : 'Check this NPI against the national NPI Registry (NPPES) to confirm it\'s active and spot outdated name, address, phone or specialty details.'}
          </p>
        ) : (
        <Tabs value={activeTab} onValueChange={setTab} className="w-full">
          <TabsList className="w-full justify-start h-10 bg-slate-800 p-1 mb-4">
            {medicare && (
              <TabsTrigger value="medicare" className="h-8 data-[state=active]:bg-slate-700 data-[state=active]:text-white">
                Medicare Quality
              </TabsTrigger>
            )}
            {npi_val && (
              <TabsTrigger value="npi" className="h-8 data-[state=active]:bg-slate-700 data-[state=active]:text-white">
                NPI Registry
              </TabsTrigger>
            )}
            {dea && (
              <TabsTrigger value="dea" className="h-8 data-[state=active]:bg-slate-700 data-[state=active]:text-white">
                DEA Schedules
              </TabsTrigger>
            )}
          </TabsList>

          {/* Medicare Compare Data */}
          {medicare && (
            <TabsContent value="medicare" className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {medicare.quality_score !== null && (
                  <div className="p-3 bg-slate-800 rounded-lg border border-slate-700">
                    <p className="text-xs text-slate-400">Overall Quality</p>
                    <p className="text-2xl font-bold text-emerald-400 mt-1">{Math.round(medicare.quality_score)}</p>
                  </div>
                )}
                {medicare.safety_score !== null && (
                  <div className="p-3 bg-slate-800 rounded-lg border border-slate-700">
                    <p className="text-xs text-slate-400">Safety Score</p>
                    <p className="text-2xl font-bold text-blue-400 mt-1">{Math.round(medicare.safety_score)}</p>
                  </div>
                )}
                {medicare.timeliness_score !== null && (
                  <div className="p-3 bg-slate-800 rounded-lg border border-slate-700">
                    <p className="text-xs text-slate-400">Timeliness</p>
                    <p className="text-2xl font-bold text-purple-400 mt-1">{Math.round(medicare.timeliness_score)}</p>
                  </div>
                )}
                {medicare.cost_score !== null && (
                  <div className="p-3 bg-slate-800 rounded-lg border border-slate-700">
                    <p className="text-xs text-slate-400">Cost Score</p>
                    <p className="text-2xl font-bold text-orange-400 mt-1">{Math.round(medicare.cost_score)}</p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                {medicare.readmission_rate !== null && (
                  <div className="p-2 bg-slate-800 rounded border border-slate-700">
                    <p className="text-xs text-slate-400">Readmission Rate</p>
                    <p className="text-lg font-semibold text-slate-200 mt-1">{medicare.readmission_rate.toFixed(1)}%</p>
                  </div>
                )}
                {medicare.mortality_rate !== null && (
                  <div className="p-2 bg-slate-800 rounded border border-slate-700">
                    <p className="text-xs text-slate-400">Mortality Rate</p>
                    <p className="text-lg font-semibold text-slate-200 mt-1">{medicare.mortality_rate.toFixed(1)}%</p>
                  </div>
                )}
                {medicare.patient_satisfaction !== null && (
                  <div className="p-2 bg-slate-800 rounded border border-slate-700">
                    <p className="text-xs text-slate-400">Patient Satisfaction</p>
                    <p className="text-lg font-semibold text-slate-200 mt-1">{Math.round(medicare.patient_satisfaction)}%</p>
                  </div>
                )}
                {medicare.years_of_experience && (
                  <div className="p-2 bg-slate-800 rounded border border-slate-700">
                    <p className="text-xs text-slate-400">Years of Experience</p>
                    <p className="text-lg font-semibold text-slate-200 mt-1">{medicare.years_of_experience}</p>
                  </div>
                )}
              </div>

              {medicare.hospital_affiliations?.length > 0 && (
                <div className="p-3 bg-slate-800 rounded border border-slate-700">
                  <p className="text-xs text-slate-400 font-medium mb-2">Hospital Affiliations</p>
                  <div className="flex flex-wrap gap-1">
                    {medicare.hospital_affiliations.map((aff, i) => (
                      <Badge key={i} variant="outline" className="text-xs bg-slate-700 text-slate-200">
                        {aff}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>
          )}

          {/* NPI Validation Data */}
          {npi_val && (
            <TabsContent value="npi" className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between p-3 bg-slate-800 rounded border border-slate-700">
                  <p className="text-sm text-slate-400">Status</p>
                  <Badge variant={npi_val.is_valid ? 'default' : 'destructive'}>
                    {NPI_STATUS_LABELS[npi_val.status] || npi_val.status}
                  </Badge>
                </div>
                {npi_val.npi_type && (
                  <div className="p-3 bg-slate-800 rounded border border-slate-700 text-sm">
                    <p className="text-xs text-slate-400">Registry record</p>
                    <p className="font-semibold text-slate-200 mt-1">
                      {npi_val.organization_name || [npi_val.first_name, npi_val.last_name].filter(Boolean).join(' ')}
                      {npi_val.credentials?.length > 0 && `, ${npi_val.credentials.join(', ')}`}
                      <span className="ml-2 text-xs font-normal text-slate-400 capitalize">{npi_val.npi_type}</span>
                    </p>
                    {npi_val.address && (
                      <p className="text-slate-300 mt-1">{[npi_val.address, npi_val.city, npi_val.state, npi_val.zip].filter(Boolean).join(', ')}</p>
                    )}
                    {npi_val.phone && <p className="text-slate-400 mt-0.5">{npi_val.phone}</p>}
                    {npi_val.registry_last_updated && (
                      <p className="text-xs text-slate-500 mt-1">Registry record last updated {npi_val.registry_last_updated}</p>
                    )}
                  </div>
                )}
              </div>

              {npi_val.taxonomies?.length > 0 && (
                <div className="p-3 bg-slate-800 rounded border border-slate-700">
                  <p className="text-xs text-slate-400 font-medium mb-2">Taxonomies from NPI Registry</p>
                  <div className="space-y-1">
                    {npi_val.taxonomies.map((tax, i) => (
                      <div key={i} className="text-xs text-slate-300">
                        <span className="font-semibold">{tax.code}</span>
                        {tax.primary && <Badge variant="outline" className="ml-2 text-[10px]">Primary</Badge>}
                        <p className="text-slate-400 mt-0.5">{tax.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {npi_val.discrepancies?.length > 0 && (
                <div className="p-3 bg-amber-900/30 border border-amber-700 rounded">
                  <p className="text-xs text-amber-400 font-medium mb-2">⚠️ Discrepancies Found</p>
                  {npi_val.discrepancies.map((d, i) => (
                    <p key={i} className="text-xs text-amber-300 mb-1">• {d}</p>
                  ))}
                </div>
              )}

              {provider && isAdmin && npi_val.is_valid && (
                 <div className="mt-4">
                    <EnrichmentMergePanel 
                       provider={provider} 
                       npiValidation={npi_val} 
                       onMergeComplete={onEnrichmentComplete}
                    />
                 </div>
              )}
            </TabsContent>
          )}

          {/* DEA Data */}
          {dea && (
            <TabsContent value="dea" className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-slate-800 rounded border border-slate-700">
                <p className="text-sm text-slate-400">DEA Registration</p>
                <Badge variant={dea.is_dea_registered ? 'default' : 'outline'}>
                  {dea.is_dea_registered ? 'Registered' : 'Not Registered'}
                </Badge>
              </div>

              {dea.is_dea_registered && (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2 bg-slate-800 rounded border border-slate-700 text-center">
                      <p className="text-[10px] text-slate-400">Opioids</p>
                      <p className="text-lg font-bold mt-1 text-slate-200">
                        {dea.can_prescribe_opioids ? '✓' : '✗'}
                      </p>
                    </div>
                    <div className="p-2 bg-slate-800 rounded border border-slate-700 text-center">
                      <p className="text-[10px] text-slate-400">Stimulants</p>
                      <p className="text-lg font-bold mt-1 text-slate-200">
                        {dea.can_prescribe_stimulants ? '✓' : '✗'}
                      </p>
                    </div>
                    <div className="p-2 bg-slate-800 rounded border border-slate-700 text-center">
                      <p className="text-[10px] text-slate-400">Benzos</p>
                      <p className="text-lg font-bold mt-1 text-slate-200">
                        {dea.can_prescribe_benzodiazepines ? '✓' : '✗'}
                      </p>
                    </div>
                  </div>

                  {dea.authorized_schedules?.length > 0 && (
                    <div className="p-3 bg-slate-800 rounded border border-slate-700">
                      <p className="text-xs text-slate-400 font-medium mb-2">Authorized Schedules</p>
                      <div className="flex flex-wrap gap-1">
                        {dea.authorized_schedules.map((s, i) => (
                          <Badge key={i} variant="outline" className="text-xs bg-emerald-900/50 text-emerald-300 border-emerald-700">
                            {s}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {dea.restrictions?.length > 0 && (
                    <div className="p-3 bg-amber-900/30 border border-amber-700 rounded">
                      <p className="text-xs text-amber-400 font-medium mb-2">Restrictions</p>
                      {dea.restrictions.map((r, i) => (
                        <p key={i} className="text-xs text-amber-300">• {r}</p>
                      ))}
                    </div>
                  )}
                </>
              )}
            </TabsContent>
          )}
        </Tabs>
        )}

        {checkedAt && (
          <p className="text-xs text-slate-400 mt-4 pt-4 border-t border-slate-700">
            NPI Registry checked {new Date(checkedAt).toLocaleString()}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
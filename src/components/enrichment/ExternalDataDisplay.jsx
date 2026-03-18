import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Zap, RefreshCw, Clock } from 'lucide-react';
import EnrichmentMergePanel from './EnrichmentMergePanel';

export default function ExternalDataDisplay({ npi, provider, onEnrichmentComplete }) {
  const [enriching, setEnriching] = useState(false);
  const { data: medicareData, isLoading: loadingMedicare, refetch: refetchMedicare } = useQuery({
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

  const { data: deaData, isLoading: loadingDEA, refetch: refetchDEA } = useQuery({
    queryKey: ['providerDEASchedules', npi],
    queryFn: () => base44.entities.ProviderDEASchedules.filter({ npi }),
    enabled: !!npi,
    staleTime: 86400000,
  });

  const handleEnrich = async () => {
    setEnriching(true);
    try {
      await Promise.all([
        base44.functions.invoke('enrichProviderMedicareData', { npi }),
        base44.functions.invoke('validateProviderNPI', { npi, checkDiscrepancies: true }),
        base44.functions.invoke('enrichProviderDEAData', { npi })
      ]);
      
      // Refresh all data
      await Promise.all([refetchMedicare(), refetchNPI(), refetchDEA()]);
      onEnrichmentComplete?.();
    } catch (error) {
      console.error('Enrichment error:', error);
    } finally {
      setEnriching(false);
    }
  };

  const hasData = (medicareData?.length > 0) || (npiValidation?.length > 0) || (deaData?.length > 0);
  if (!hasData && !loadingMedicare && !loadingNPI && !loadingDEA) return null;

  const medicare = medicareData?.[0];
  const npi_val = npiValidation?.[0];
  const dea = deaData?.[0];

  return (
    <Card className="bg-slate-900 border-slate-700">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-white">
            <Zap className="w-5 h-5 text-blue-400" />
            External Data Enrichment
          </CardTitle>
          <Button 
            onClick={handleEnrich} 
            disabled={enriching}
            variant="outline"
            size="sm"
            className="gap-2 text-slate-200 border-slate-600 hover:border-slate-500"
          >
            {enriching ? <Clock className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {enriching ? 'Enriching...' : 'Enrich Now'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="medicare" className="w-full">
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
                  <Badge variant={npi_val.is_valid ? 'default' : 'destructive'} className="capitalize">
                    {npi_val.status}
                  </Badge>
                </div>
                <div className="p-3 bg-slate-800 rounded border border-slate-700">
                  <p className="text-xs text-slate-400">NPI Type</p>
                  <p className="text-sm font-semibold text-slate-200 mt-1 capitalize">{npi_val.npi_type}</p>
                </div>
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

              {provider && npi_val.is_valid && (
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

        <p className="text-xs text-slate-400 mt-4 pt-4 border-t border-slate-700">
          Last updated: {new Date().toLocaleDateString()}
        </p>
      </CardContent>
    </Card>
  );
}
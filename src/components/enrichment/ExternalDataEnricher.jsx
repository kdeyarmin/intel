import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, AlertCircle, TrendingUp, Shield, Zap } from 'lucide-react';
import { toast } from 'sonner';

export default function ExternalDataEnricher({ npi, onEnrichmentComplete }) {
  const [loading, setLoading] = useState(false);
  const [enrichments, setEnrichments] = useState({
    medicare: null,
    npi_validation: null,
    dea: null
  });
  const [status, setStatus] = useState({});

  const handleEnrichMedicare = async () => {
    setLoading(true);
    setStatus(prev => ({ ...prev, medicare: 'loading' }));
    try {
      const response = await base44.functions.invoke('enrichProviderMedicareData', { npi });
      setEnrichments(prev => ({ ...prev, medicare: response.data }));
      setStatus(prev => ({ ...prev, medicare: 'success' }));
      toast.success('Medicare quality metrics loaded');
    } catch (error) {
      setStatus(prev => ({ ...prev, medicare: 'error' }));
      toast.error('Failed to load Medicare data');
    } finally {
      setLoading(false);
    }
  };

  const handleValidateNPI = async () => {
    setLoading(true);
    setStatus(prev => ({ ...prev, npi_validation: 'loading' }));
    try {
      const response = await base44.functions.invoke('validateProviderNPI', {
        npi,
        checkDiscrepancies: true
      });
      setEnrichments(prev => ({ ...prev, npi_validation: response.data }));
      setStatus(prev => ({ ...prev, npi_validation: response.data.is_valid ? 'success' : 'error' }));
      toast.success(response.data.is_valid ? 'NPI validated successfully' : 'NPI validation issues found');
    } catch (error) {
      setStatus(prev => ({ ...prev, npi_validation: 'error' }));
      toast.error('Failed to validate NPI');
    } finally {
      setLoading(false);
    }
  };

  const handleEnrichDEA = async () => {
    setLoading(true);
    setStatus(prev => ({ ...prev, dea: 'loading' }));
    try {
      const response = await base44.functions.invoke('enrichProviderDEAData', { npi });
      setEnrichments(prev => ({ ...prev, dea: response.data }));
      setStatus(prev => ({ ...prev, dea: response.data.is_dea_registered ? 'success' : 'warning' }));
      toast.success(`DEA registration: ${response.data.is_dea_registered ? 'Found' : 'Not registered'}`);
    } catch (error) {
      setStatus(prev => ({ ...prev, dea: 'error' }));
      toast.error('Failed to load DEA data');
    } finally {
      setLoading(false);
    }
  };

  const handleEnrichAll = async () => {
    await Promise.all([
      handleEnrichMedicare(),
      handleValidateNPI(),
      handleEnrichDEA()
    ]);
    if (onEnrichmentComplete) onEnrichmentComplete();
  };

  return (
    <div className="space-y-4">
      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={handleEnrichMedicare}
          disabled={loading}
          variant="outline"
          size="sm"
          className="gap-2"
        >
          {status.medicare === 'loading' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : status.medicare === 'success' ? (
            <CheckCircle className="w-4 h-4 text-green-600" />
          ) : (
            <TrendingUp className="w-4 h-4" />
          )}
          Medicare Quality Data
        </Button>

        <Button
          onClick={handleValidateNPI}
          disabled={loading}
          variant="outline"
          size="sm"
          className="gap-2"
        >
          {status.npi_validation === 'loading' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : status.npi_validation === 'success' ? (
            <CheckCircle className="w-4 h-4 text-green-600" />
          ) : (
            <Shield className="w-4 h-4" />
          )}
          Validate NPI
        </Button>

        <Button
          onClick={handleEnrichDEA}
          disabled={loading}
          variant="outline"
          size="sm"
          className="gap-2"
        >
          {status.dea === 'loading' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : status.dea === 'success' ? (
            <CheckCircle className="w-4 h-4 text-green-600" />
          ) : (
            <Zap className="w-4 h-4" />
          )}
          DEA Schedules
        </Button>

        <Button
          onClick={handleEnrichAll}
          disabled={loading}
          className="gap-2 bg-blue-600 hover:bg-blue-700"
          size="sm"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Zap className="w-4 h-4" />
          )}
          Enrich All
        </Button>
      </div>

      {/* Medicare Data */}
      {enrichments.medicare && (
        <Card className="bg-slate-50">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              <CardTitle className="text-base">Medicare Quality Metrics</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {enrichments.medicare.quality_metrics?.safety && (
                <div className="p-3 bg-white rounded-lg border border-slate-200">
                  <p className="text-xs text-slate-500 font-medium">Safety Score</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{enrichments.medicare.quality_metrics.safety}</p>
                </div>
              )}
              {enrichments.medicare.quality_metrics?.timeliness && (
                <div className="p-3 bg-white rounded-lg border border-slate-200">
                  <p className="text-xs text-slate-500 font-medium">Timeliness</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{enrichments.medicare.quality_metrics.timeliness}</p>
                </div>
              )}
              {enrichments.medicare.quality_metrics?.cost && (
                <div className="p-3 bg-white rounded-lg border border-slate-200">
                  <p className="text-xs text-slate-500 font-medium">Cost Score</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{enrichments.medicare.quality_metrics.cost}</p>
                </div>
              )}
              {enrichments.medicare.quality_metrics?.patient_satisfaction && (
                <div className="p-3 bg-white rounded-lg border border-slate-200">
                  <p className="text-xs text-slate-500 font-medium">Satisfaction</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{enrichments.medicare.quality_metrics.patient_satisfaction}%</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* NPI Validation */}
      {enrichments.npi_validation && (
        <Card className={`${enrichments.npi_validation.is_valid ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className={`w-5 h-5 ${enrichments.npi_validation.is_valid ? 'text-green-600' : 'text-amber-600'}`} />
                <CardTitle className="text-base">NPI Validation</CardTitle>
              </div>
              <Badge variant={enrichments.npi_validation.is_valid ? 'default' : 'outline'}>
                {enrichments.npi_validation.is_valid ? 'Valid' : 'Issues Found'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><span className="font-medium">Provider:</span> {enrichments.npi_validation.provider_name}</p>
            <p><span className="font-medium">Type:</span> {enrichments.npi_validation.npi_type}</p>
            <p><span className="font-medium">Status:</span> {enrichments.npi_validation.status}</p>
            {enrichments.npi_validation.discrepancies?.length > 0 && (
              <div className="mt-2 p-2 bg-white rounded border border-amber-300">
                <p className="font-medium text-xs text-amber-900">Discrepancies:</p>
                {enrichments.npi_validation.discrepancies.map((d, i) => (
                  <p key={i} className="text-xs text-amber-700 mt-1">• {d}</p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* DEA Data */}
      {enrichments.dea && (
        <Card className={`${enrichments.dea.is_dea_registered ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50'}`}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className={`w-5 h-5 ${enrichments.dea.is_dea_registered ? 'text-emerald-600' : 'text-slate-400'}`} />
                <CardTitle className="text-base">DEA Registration & Schedules</CardTitle>
              </div>
              <Badge variant={enrichments.dea.is_dea_registered ? 'default' : 'outline'}>
                {enrichments.dea.is_dea_registered ? 'Registered' : 'Not Registered'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {enrichments.dea.is_dea_registered && (
              <>
                <div className="space-y-2">
                  <p className="text-xs font-medium text-slate-600">Authorized Schedules:</p>
                  <div className="flex flex-wrap gap-1">
                    {enrichments.dea.authorized_schedules?.map((s, i) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="p-2 rounded bg-white border border-slate-200">
                    <p className="text-xs font-medium text-slate-600">Opioids</p>
                    <p className="text-sm font-bold text-slate-900 mt-1">
                      {enrichments.dea.can_prescribe?.opioids ? '✓' : '✗'}
                    </p>
                  </div>
                  <div className="p-2 rounded bg-white border border-slate-200">
                    <p className="text-xs font-medium text-slate-600">Stimulants</p>
                    <p className="text-sm font-bold text-slate-900 mt-1">
                      {enrichments.dea.can_prescribe?.stimulants ? '✓' : '✗'}
                    </p>
                  </div>
                  <div className="p-2 rounded bg-white border border-slate-200">
                    <p className="text-xs font-medium text-slate-600">Benzodiazepines</p>
                    <p className="text-sm font-bold text-slate-900 mt-1">
                      {enrichments.dea.can_prescribe?.benzodiazepines ? '✓' : '✗'}
                    </p>
                  </div>
                </div>
              </>
            )}
            {enrichments.dea.restrictions?.length > 0 && (
              <div className="p-2 rounded bg-amber-100 border border-amber-300">
                <p className="text-xs font-medium text-amber-900">Restrictions:</p>
                {enrichments.dea.restrictions.map((r, i) => (
                  <p key={i} className="text-xs text-amber-700 mt-1">• {r}</p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
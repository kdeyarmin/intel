import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Loader2, Sparkles, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

export default function EnrichProviderButton({ providers = [], locations = [], taxonomies = [], onComplete, _mode = 'bulk' }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const enrichProvider = async (provider) => {
    const loc = locations.find(l => l.npi === provider.npi && l.is_primary) || locations.find(l => l.npi === provider.npi);
    const tax = taxonomies.find(t => t.npi === provider.npi && t.primary_flag) || taxonomies.find(t => t.npi === provider.npi);

    const name = provider.entity_type === 'Individual'
      ? `${provider.first_name || ''} ${provider.last_name || ''}`.trim()
      : provider.organization_name || '';

    const missingFields = [];
    if (!provider.credential && provider.entity_type === 'Individual') missingFields.push('credential');
    if (!provider.organization_name) missingFields.push('organization_name');
    if (!loc?.phone) missingFields.push('phone');
    if (!loc?.city || !loc?.state) missingFields.push('address');
    if (!tax?.taxonomy_description) missingFields.push('specialty');

    if (missingFields.length === 0) {
      return { npi: provider.npi, name, status: 'skipped', message: 'All fields populated' };
    }

    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `Search for missing details about this healthcare provider. Use the NPI number to find accurate information from NPPES, CMS, and public healthcare directories.

PROVIDER:
- NPI: ${provider.npi}
- Name: ${name}
- Type: ${provider.entity_type}
- Current Credential: ${provider.credential || 'MISSING'}
- Current Organization: ${provider.organization_name || 'MISSING'}
- Current Specialty: ${tax?.taxonomy_description || 'MISSING'}
- Current Address: ${loc ? `${loc.address_1 || ''}, ${loc.city || ''}, ${loc.state || ''} ${loc.zip || ''}` : 'MISSING'}
- Current Phone: ${loc?.phone || 'MISSING'}

MISSING FIELDS TO FIND: ${missingFields.join(', ')}

Search the NPI registry and healthcare directories to find accurate data for the missing fields. Only return data you're confident about. Return null for any field you can't verify.`,
      add_context_from_internet: true,
      response_json_schema: {
        type: "object",
        properties: {
          credential: { type: ["string", "null"] },
          organization_name: { type: ["string", "null"] },
          specialty: { type: ["string", "null"] },
          taxonomy_code: { type: ["string", "null"] },
          address_1: { type: ["string", "null"] },
          city: { type: ["string", "null"] },
          state: { type: ["string", "null"] },
          zip: { type: ["string", "null"] },
          phone: { type: ["string", "null"] },
          fax: { type: ["string", "null"] },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          source: { type: "string" },
          fields_found: { type: "array", items: { type: "string" } }
        }
      }
    });

    // Update Provider record
    const providerUpdate = {};
    if (res.credential && !provider.credential) providerUpdate.credential = res.credential;
    if (res.organization_name && !provider.organization_name) providerUpdate.organization_name = res.organization_name;
    if (Object.keys(providerUpdate).length > 0) {
      providerUpdate.needs_nppes_enrichment = false;
      await base44.entities.Provider.update(provider.id, providerUpdate);
    }

    // Update or create ProviderLocation
    const locUpdate = {};
    if (res.address_1 && !loc?.address_1) locUpdate.address_1 = res.address_1;
    if (res.city && !loc?.city) locUpdate.city = res.city;
    if (res.state && !loc?.state) locUpdate.state = res.state;
    if (res.zip && !loc?.zip) locUpdate.zip = res.zip;
    if (res.phone && !loc?.phone) locUpdate.phone = res.phone;
    if (res.fax && !loc?.fax) locUpdate.fax = res.fax;

    if (Object.keys(locUpdate).length > 0) {
      if (loc) {
        await base44.entities.ProviderLocation.update(loc.id, locUpdate);
      } else {
        await base44.entities.ProviderLocation.create({
          npi: provider.npi,
          location_type: 'Practice',
          is_primary: true,
          ...locUpdate,
        });
      }
    }

    // Update or create ProviderTaxonomy
    if (res.specialty && !tax?.taxonomy_description) {
      const taxUpdate = { taxonomy_description: res.specialty };
      if (res.taxonomy_code) taxUpdate.taxonomy_code = res.taxonomy_code;
      if (tax) {
        await base44.entities.ProviderTaxonomy.update(tax.id, taxUpdate);
      } else {
        await base44.entities.ProviderTaxonomy.create({
          npi: provider.npi,
          primary_flag: true,
          ...taxUpdate,
        });
      }
    }

    const fieldsUpdated = [
      ...Object.keys(providerUpdate).filter(k => k !== 'needs_nppes_enrichment'),
      ...Object.keys(locUpdate),
      ...(res.specialty && !tax?.taxonomy_description ? ['specialty'] : []),
    ];

    return {
      npi: provider.npi,
      name,
      status: fieldsUpdated.length > 0 ? 'enriched' : 'no_new_data',
      fieldsUpdated,
      confidence: res.confidence,
      source: res.source,
    };
  };

  const handleEnrich = async () => {
    setLoading(true);
    setResults(null);
    const total = providers.length;
    setProgress({ current: 0, total });
    const allResults = [];

    for (let i = 0; i < providers.length; i++) {
      try {
        const result = await enrichProvider(providers[i]);
        allResults.push(result);
      } catch (err) {
        allResults.push({
          npi: providers[i].npi,
          name: providers[i].first_name || providers[i].organization_name || providers[i].npi,
          status: 'error',
          message: err.message,
        });
      }
      setProgress({ current: i + 1, total });
    }

    setResults(allResults);
    setLoading(false);
    const enrichedCount = allResults.filter(r => r.status === 'enriched').length;
    toast.success(`Enriched ${enrichedCount} of ${total} providers`);
    if (onComplete) onComplete();
  };

  const statusIcons = {
    enriched: <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />,
    skipped: <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />,
    no_new_data: <AlertTriangle className="w-3.5 h-3.5 text-slate-400" />,
    error: <XCircle className="w-3.5 h-3.5 text-red-500" />,
  };

  return (
    <>
      <Button onClick={() => setOpen(true)} variant="outline" className="gap-1.5">
        <Sparkles className="w-4 h-4 text-violet-500" /> Enrich Data
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-violet-500" />
              AI Data Enrichment
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              AI will search public healthcare directories and the NPI registry to find missing details
              for <strong>{providers.length}</strong> selected provider{providers.length !== 1 ? 's' : ''}.
            </p>

            <div className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3 space-y-1">
              <p className="font-medium text-slate-700">Fields that will be enriched:</p>
              <p>• Credential (MD, DO, NP, etc.)</p>
              <p>• Organization name</p>
              <p>• Primary specialty</p>
              <p>• Practice address & phone</p>
            </div>

            {loading && (
              <div className="space-y-2">
                <Progress value={(progress.current / Math.max(progress.total, 1)) * 100} className="h-2" />
                <p className="text-xs text-slate-500 text-center">
                  Processing {progress.current} of {progress.total}...
                </p>
              </div>
            )}

            {!results && (
              <Button onClick={handleEnrich} disabled={loading} className="w-full bg-violet-600 hover:bg-violet-700 gap-2">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {loading ? `Enriching... (${progress.current}/${progress.total})` : `Enrich ${providers.length} Provider${providers.length !== 1 ? 's' : ''}`}
              </Button>
            )}

            {results && (
              <div className="space-y-2">
                {/* Summary */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="text-center p-2 rounded-lg bg-green-50">
                    <p className="text-lg font-bold text-green-700">{results.filter(r => r.status === 'enriched').length}</p>
                    <p className="text-[9px] text-green-600">Enriched</p>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-amber-50">
                    <p className="text-lg font-bold text-amber-700">{results.filter(r => r.status === 'skipped' || r.status === 'no_new_data').length}</p>
                    <p className="text-[9px] text-amber-600">No Changes</p>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-red-50">
                    <p className="text-lg font-bold text-red-700">{results.filter(r => r.status === 'error').length}</p>
                    <p className="text-[9px] text-red-600">Errors</p>
                  </div>
                </div>

                {/* Details */}
                <div className="max-h-[250px] overflow-y-auto space-y-1">
                  {results.map((r, i) => (
                    <div key={i} className="flex items-start gap-2 p-2 bg-slate-50 rounded-lg">
                      {statusIcons[r.status] || statusIcons.error}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-slate-800 truncate">{r.name}</p>
                        <p className="text-[10px] text-slate-400 font-mono">{r.npi}</p>
                        {r.fieldsUpdated?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {r.fieldsUpdated.map((f, j) => (
                              <Badge key={j} className="bg-green-100 text-green-700 text-[8px]">{f}</Badge>
                            ))}
                          </div>
                        )}
                        {r.message && <p className="text-[9px] text-slate-400 mt-0.5">{r.message}</p>}
                      </div>
                    </div>
                  ))}
                </div>

                <Button onClick={() => setOpen(false)} className="w-full" variant="outline">Done</Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
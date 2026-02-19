import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import { Globe, Loader2, Check, X, Building2 } from 'lucide-react';
import { toast } from 'sonner';

export default function AIProfileAugmenter({ providers = [], locations = [], taxonomies = [], onComplete }) {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [applying, setApplying] = useState(new Set());
  const [applied, setApplied] = useState(new Set());

  const handleAugment = async () => {
    setLoading(true);
    setResults(null);

    const batch = providers.slice(0, 15).map(p => {
      const loc = locations.find(l => l.npi === p.npi && l.is_primary) || locations.find(l => l.npi === p.npi);
      const tax = taxonomies.find(t => t.npi === p.npi && t.primary_flag) || taxonomies.find(t => t.npi === p.npi);
      return {
        npi: p.npi,
        name: p.entity_type === 'Individual' ? `${p.first_name} ${p.last_name}`.trim() : p.organization_name || '',
        entity_type: p.entity_type,
        credential: p.credential || '',
        specialty: tax?.taxonomy_description || '',
        city: loc?.city || '',
        state: loc?.state || '',
      };
    });

    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a healthcare provider research specialist. For each provider below, find additional publicly available information:

1. Practice website URL
2. Hospital/system affiliations
3. Board certifications & key specialties
4. Education/training background
5. Languages spoken
6. Accepting new patients status

Providers:
${JSON.stringify(batch, null, 1)}

Only return information you find with reasonable confidence. Do not fabricate data.`,
      add_context_from_internet: true,
      response_json_schema: {
        type: "object",
        properties: {
          profiles: {
            type: "array",
            items: {
              type: "object",
              properties: {
                npi: { type: "string" },
                name: { type: "string" },
                website: { type: "string" },
                affiliations: { type: "array", items: { type: "string" } },
                board_certifications: { type: "array", items: { type: "string" } },
                education: { type: "string" },
                languages: { type: "array", items: { type: "string" } },
                accepting_patients: { type: "string" },
                confidence: { type: "string" },
                notes: { type: "string" }
              }
            }
          },
          summary: { type: "string" }
        }
      }
    });

    setResults(res);
    setLoading(false);
  };

  const handleApply = async (profile) => {
    setApplying(prev => new Set([...prev, profile.npi]));

    const provider = providers.find(p => p.npi === profile.npi);
    if (provider) {
      const enrichmentData = {};
      const enrichmentParts = [];
      if (profile.website) enrichmentParts.push(`Website: ${profile.website}`);
      if (profile.affiliations?.length) enrichmentParts.push(`Affiliations: ${profile.affiliations.join(', ')}`);
      if (profile.board_certifications?.length) enrichmentParts.push(`Certifications: ${profile.board_certifications.join(', ')}`);
      if (profile.education) enrichmentParts.push(`Education: ${profile.education}`);
      if (profile.languages?.length) enrichmentParts.push(`Languages: ${profile.languages.join(', ')}`);

      // Store in additional_emails field as a workaround for free-form enrichment data
      // Or use email_source to store website
      if (profile.website && !provider.email_source) {
        enrichmentData.email_source = profile.website;
      }

      // Create a data quality alert with the full profile as enrichment record
      await base44.entities.DataQualityAlert.create({
        rule_id: `augment_${profile.npi}`,
        rule_name: 'Profile Augmentation',
        category: 'completeness',
        severity: 'low',
        summary: enrichmentParts.join(' | '),
        npi: profile.npi,
        status: 'accepted',
        ai_root_cause: profile.notes || 'AI-augmented profile data',
        ai_solutions: [
          profile.website || '',
          (profile.affiliations || []).join(', '),
          (profile.board_certifications || []).join(', '),
        ].filter(Boolean),
      });

      if (Object.keys(enrichmentData).length > 0) {
        await base44.entities.Provider.update(provider.id, enrichmentData);
      }
    }

    setApplying(prev => { const n = new Set(prev); n.delete(profile.npi); return n; });
    setApplied(prev => new Set([...prev, profile.npi]));
    toast.success(`Augmented profile for ${profile.name}`);
    if (onComplete) onComplete();
  };

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Globe className="w-4 h-4 text-teal-600" />
          AI Profile Augmenter
        </CardTitle>
        <Button size="sm" onClick={handleAugment} disabled={loading} className="bg-teal-600 hover:bg-teal-700 h-7 text-xs">
          {loading ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Researching...</> : <><Globe className="w-3 h-3 mr-1" /> Augment Profiles</>}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && (
          <div className="flex items-center justify-center py-6 gap-2 text-teal-600">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-xs">Researching public info for {Math.min(providers.length, 15)} providers...</span>
          </div>
        )}

        {!results && !loading && (
          <p className="text-[10px] text-slate-400 text-center py-2">
            Finds practice websites, affiliations, certifications, and more from public sources.
          </p>
        )}

        {results && (
          <div className="space-y-3">
            {results.summary && <p className="text-xs text-slate-500 italic">{results.summary}</p>}
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {results.profiles?.map((p, i) => {
                const hasData = p.website || p.affiliations?.length || p.board_certifications?.length || p.education || p.languages?.length;
                if (!hasData) return null;
                return (
                  <div key={i} className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-900">{p.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{p.npi}</span>
                      </div>
                      <Button
                        size="sm" variant="outline" className="h-6 text-[10px]"
                        disabled={applying.has(p.npi) || applied.has(p.npi)}
                        onClick={() => handleApply(p)}
                      >
                        {applied.has(p.npi) ? <><Check className="w-3 h-3 mr-1" /> Saved</> :
                         applying.has(p.npi) ? <Loader2 className="w-3 h-3 animate-spin" /> :
                         'Save Profile'}
                      </Button>
                    </div>
                    <div className="space-y-1 text-xs text-slate-600">
                      {p.website && (
                        <div className="flex items-center gap-1.5">
                          <Globe className="w-3 h-3 text-blue-500 shrink-0" />
                          <a href={p.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate">{p.website}</a>
                        </div>
                      )}
                      {p.affiliations?.length > 0 && (
                        <div className="flex items-start gap-1.5">
                          <Building2 className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
                          <span>{p.affiliations.join(', ')}</span>
                        </div>
                      )}
                      {p.board_certifications?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {p.board_certifications.map((c, j) => (
                            <Badge key={j} variant="outline" className="text-[9px]">{c}</Badge>
                          ))}
                        </div>
                      )}
                      {p.education && <p className="text-[10px] text-slate-400">{p.education}</p>}
                      {p.languages?.length > 0 && (
                        <p className="text-[10px] text-slate-400">Languages: {p.languages.join(', ')}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
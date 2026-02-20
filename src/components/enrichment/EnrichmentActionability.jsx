import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles, Megaphone, TrendingUp, Users, Wifi, ShieldCheck, Activity } from 'lucide-react';
import { createPageUrl } from '../../utils';
import { Link } from 'react-router-dom';

export default function EnrichmentActionability() {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState(null);

  const { data: records = [] } = useQuery({
    queryKey: ['enrichActionRecords'],
    queryFn: () => base44.entities.EnrichmentRecord.filter({ status: 'approved' }, '-created_date', 200),
    staleTime: 30000,
  });

  const analyze = async () => {
    setLoading(true);

    // Aggregate enriched data
    const byNPI = {};
    records.forEach(r => {
      if (!byNPI[r.npi]) byNPI[r.npi] = { npi: r.npi, name: r.provider_name, details: {} };
      if (r.enrichment_details) {
        Object.assign(byNPI[r.npi].details, r.enrichment_details);
      }
    });

    const enrichedProviders = Object.values(byNPI);
    const withTelehealth = enrichedProviders.filter(p => p.details.telehealth_available);
    const withInsurance = enrichedProviders.filter(p => p.details.insurance_accepted?.length > 0);
    const withVolume = enrichedProviders.filter(p => p.details.estimated_patient_volume);
    const withAffiliations = enrichedProviders.filter(p => p.details.hospital_affiliations?.length > 0);
    const highReviews = enrichedProviders.filter(p => p.details.review_score >= 4);

    const snapshot = {
      total: enrichedProviders.length,
      withTelehealth: withTelehealth.length,
      withInsurance: withInsurance.length,
      withVolume: withVolume.length,
      withAffiliations: withAffiliations.length,
      highReviews: highReviews.length,
      sampleInsurance: [...new Set(withInsurance.flatMap(p => p.details.insurance_accepted || []))].slice(0, 10),
      sampleAffiliations: [...new Set(withAffiliations.flatMap(p => p.details.hospital_affiliations || []))].slice(0, 8),
    };

    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `Based on enriched provider data, suggest actionable outreach and engagement strategies.

ENRICHED DATA SUMMARY:
- ${snapshot.total} providers enriched total
- ${snapshot.withTelehealth} offer telehealth
- ${snapshot.withInsurance} have insurance data (common: ${snapshot.sampleInsurance.join(', ')})
- ${snapshot.withVolume} have patient volume estimates
- ${snapshot.withAffiliations} have hospital affiliations (include: ${snapshot.sampleAffiliations.join(', ')})
- ${snapshot.highReviews} have 4+ star reviews

Suggest 4-5 specific actionable campaigns or engagement strategies using this enriched data. For each:
- Name the action
- Explain the strategy
- Identify which enriched data point makes it possible
- Estimate potential impact
- Suggest targeting criteria`,
      response_json_schema: {
        type: "object",
        properties: {
          actions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                strategy: { type: "string" },
                data_driver: { type: "string" },
                impact: { type: "string" },
                target_count: { type: "number" },
                icon_type: { type: "string", enum: ["telehealth", "insurance", "volume", "affiliation", "reviews"] }
              }
            }
          },
          summary: { type: "string" }
        }
      }
    });
    setSuggestions(res);
    setLoading(false);
  };

  const ICONS = {
    telehealth: { icon: Wifi, color: 'text-cyan-500 bg-cyan-50' },
    insurance: { icon: ShieldCheck, color: 'text-emerald-500 bg-emerald-50' },
    volume: { icon: Activity, color: 'text-violet-500 bg-violet-50' },
    affiliation: { icon: Users, color: 'text-blue-500 bg-blue-50' },
    reviews: { icon: TrendingUp, color: 'text-amber-500 bg-amber-50' },
  };

  return (
    <Card className="bg-[#141d30] border-slate-700/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-amber-400" />
            Enrichment → Action Suggestions
          </CardTitle>
          <Button size="sm" onClick={analyze} disabled={loading || records.length === 0}
            className="h-7 text-[10px] gap-1 bg-amber-600 hover:bg-amber-700">
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            {loading ? 'Analyzing...' : 'Find Actions'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {records.length === 0 && (
          <p className="text-xs text-slate-500 text-center py-4">Approve enrichment records to unlock actionable suggestions.</p>
        )}

        {!suggestions && records.length > 0 && !loading && (
          <p className="text-xs text-slate-500 text-center py-4">
            {records.length} approved records. Click "Find Actions" to discover outreach opportunities.
          </p>
        )}

        {suggestions && (
          <div className="space-y-3">
            {suggestions.summary && (
              <p className="text-[10px] text-slate-400 bg-slate-800/40 rounded-lg p-2">{suggestions.summary}</p>
            )}
            {suggestions.actions?.map((a, i) => {
              const iconCfg = ICONS[a.icon_type] || ICONS.volume;
              const Icon = iconCfg.icon;
              return (
                <div key={i} className="border border-slate-700/30 rounded-lg p-3 hover:bg-slate-800/30">
                  <div className="flex items-start gap-2">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-slate-800/50`}>
                      <Icon className={`w-3.5 h-3.5 ${iconCfg.color.split(' ')[0]}`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-slate-200">{a.name}</p>
                        {a.target_count > 0 && <Badge className="bg-slate-700/50 text-slate-400 text-[9px]">{a.target_count} targets</Badge>}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">{a.strategy}</p>
                      <div className="flex gap-2 mt-1.5">
                        <Badge className="bg-cyan-500/10 text-cyan-400 text-[8px]">{a.data_driver}</Badge>
                        <Badge className="bg-emerald-500/10 text-emerald-400 text-[8px]">{a.impact}</Badge>
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 ml-9">
                    <Link to={createPageUrl('ProviderOutreach')}>
                      <Button size="sm" variant="outline" className="h-6 text-[9px] gap-1 bg-transparent border-slate-700 text-slate-400 hover:text-cyan-400">
                        <Megaphone className="w-3 h-3" /> Create Campaign
                      </Button>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
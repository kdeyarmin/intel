import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Users, Loader2, Sparkles, ExternalLink, ArrowRight } from 'lucide-react';

export default function AIRelatedProviders({ provider, location, taxonomies, referrals, allProviders = [], allLocations = [], allTaxonomies = [] }) {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  const name = provider?.entity_type === 'Individual'
    ? `${provider.first_name || ''} ${provider.last_name || ''}`.trim()
    : provider?.organization_name || '';

  const analyze = async () => {
    setLoading(true);

    const specialty = (taxonomies || []).map(t => t.taxonomy_description).filter(Boolean).join(', ');

    // Get co-located providers
    const sameCity = allLocations.filter(l => l.city === location?.city && l.state === location?.state).map(l => l.npi);
    const nearbyProviders = allProviders
      .filter(p => sameCity.includes(p.npi) && p.npi !== provider?.npi)
      .slice(0, 15)
      .map(p => {
        const tax = allTaxonomies.find(t => t.npi === p.npi && t.primary_flag);
        return `${p.entity_type === 'Individual' ? `${p.first_name} ${p.last_name}` : p.organization_name} (NPI:${p.npi}, ${tax?.taxonomy_description || 'Unknown'})`;
      });

    const refTypes = [];
    if (referrals?.home_health_referrals > 0) refTypes.push(`Home Health: ${referrals.home_health_referrals}`);
    if (referrals?.hospice_referrals > 0) refTypes.push(`Hospice: ${referrals.hospice_referrals}`);
    if (referrals?.snf_referrals > 0) refTypes.push(`SNF: ${referrals.snf_referrals}`);
    if (referrals?.dme_referrals > 0) refTypes.push(`DME: ${referrals.dme_referrals}`);

    try {
      const res = await base44.integrations.Core.InvokeLLM({
        prompt: `Analyze this provider's network and suggest related providers or organizations they should connect with.

TARGET PROVIDER:
- Name: ${name}
- NPI: ${provider?.npi}
- Type: ${provider?.entity_type}
- Specialty: ${specialty}
- Location: ${location?.city || ''}, ${location?.state || ''}
- Referral patterns: ${refTypes.join(', ') || 'No referral data'}

NEARBY PROVIDERS (same city):
${nearbyProviders.join('\n')}

Based on:
1. Specialty alignment (complementary specialties that commonly refer to each other)
2. Geographic proximity (providers in the same area)
3. Referral pattern analysis (providers who would benefit from mutual referrals)
4. Practice type synergy (e.g., primary care + specialist, hospital + post-acute care)

Suggest 5 types of providers/organizations this provider should connect with, and match them to specific nearby providers if possible. For each, explain the relationship rationale.`,
        response_json_schema: {
          type: "object",
          properties: {
            suggestions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  category: { type: "string" },
                  description: { type: "string" },
                  rationale: { type: "string" },
                  matched_npi: { type: "string" },
                  matched_name: { type: "string" },
                  relationship_strength: { type: "string", enum: ["strong", "moderate", "exploratory"] },
                }
              }
            },
            network_summary: { type: "string" }
          }
        }
      });

      setResults(res);
    } catch (err) {
      console.error('Analysis failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const strengthColors = { strong: 'bg-green-100 text-green-700', moderate: 'bg-blue-100 text-blue-700', exploratory: 'bg-slate-100 text-slate-600' };

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="w-4 h-4 text-blue-500" />
          AI Suggested Connections
        </CardTitle>
        <Button size="sm" onClick={analyze} disabled={loading} className="bg-blue-600 hover:bg-blue-700 h-7 text-xs">
          {loading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}
          {loading ? 'Analyzing...' : results ? 'Re-analyze' : 'Find Connections'}
        </Button>
      </CardHeader>
      <CardContent>
        {!results && !loading && (
          <p className="text-xs text-slate-400 text-center py-4">AI will suggest related providers based on specialty, network position, and referral patterns</p>
        )}
        {loading && (
          <div className="space-y-2">
            {[1,2,3].map(i => <Skeleton key={i} className="h-16" />)}
          </div>
        )}
        {results && (
          <div className="space-y-3">
            {results.network_summary && (
              <p className="text-xs text-slate-600 bg-blue-50 rounded-lg px-3 py-2 leading-relaxed">{results.network_summary}</p>
            )}
            {results.suggestions?.map((s, i) => (
              <div key={i} className="border rounded-lg p-3 hover:bg-slate-50/50 transition-colors">
                <div className="flex items-start justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-800">{s.category}</span>
                    <Badge className={`text-[9px] ${strengthColors[s.relationship_strength] || strengthColors.exploratory}`}>
                      {s.relationship_strength}
                    </Badge>
                  </div>
                  {s.matched_npi && (
                    <Link to={createPageUrl(`ProviderDetail?npi=${s.matched_npi}`)}>
                      <ExternalLink className="w-3.5 h-3.5 text-blue-400 hover:text-blue-600" />
                    </Link>
                  )}
                </div>
                {s.matched_name && (
                  <p className="text-xs text-blue-600 font-medium mb-0.5 flex items-center gap-1">
                    <ArrowRight className="w-3 h-3" /> {s.matched_name}
                  </p>
                )}
                <p className="text-[10px] text-slate-500 leading-relaxed">{s.rationale}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
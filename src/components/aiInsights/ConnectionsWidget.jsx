import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Users, Loader2, Sparkles, ExternalLink } from 'lucide-react';

export default function ConnectionsWidget({ providers = [], locations = [], taxonomies = [], referrals = [], scores = [] }) {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  const topProviders = useMemo(() =>
    [...scores].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 5),
  [scores]);

  const analyze = async () => {
    setLoading(true);

    const provMap = {};
    providers.forEach(p => { provMap[p.npi] = p; });

    const topProvsInfo = topProviders.map(s => {
      const p = provMap[s.npi];
      const tax = taxonomies.find(t => t.npi === s.npi && t.primary_flag);
      const loc = locations.find(l => l.npi === s.npi && l.is_primary);
      const ref = referrals.find(r => r.npi === s.npi);
      return {
        name: p ? (p.entity_type === 'Individual' ? `${p.first_name} ${p.last_name}` : p.organization_name) : s.npi,
        npi: s.npi,
        score: s.score,
        specialty: tax?.taxonomy_description || 'Unknown',
        city: loc?.city || '',
        state: loc?.state || '',
        totalReferrals: ref?.total_referrals || 0,
      };
    });

    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `Analyze these top-scored healthcare providers and suggest strategic connection opportunities between them and the broader network.

TOP PROVIDERS:
${topProvsInfo.map(p => `- ${p.name} (NPI:${p.npi}, Score:${p.score}, ${p.specialty}, ${p.city} ${p.state}, Referrals:${p.totalReferrals})`).join('\n')}

NETWORK STATS:
- Total providers: ${providers.length}
- Total locations: ${locations.length}

For each top provider, suggest 1 ideal connection type they should make (e.g., partner with post-acute care, connect with specialist, join a referral network). Also identify 3 cross-provider collaboration opportunities that could benefit the network.`,
      response_json_schema: {
        type: "object",
        properties: {
          provider_connections: {
            type: "array",
            items: {
              type: "object",
              properties: {
                npi: { type: "string" },
                provider_name: { type: "string" },
                suggested_connection: { type: "string" },
                rationale: { type: "string" },
                strength: { type: "string", enum: ["strong", "moderate", "exploratory"] }
              }
            }
          },
          network_opportunities: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                description: { type: "string" },
                providers_involved: { type: "string" },
                impact: { type: "string", enum: ["high", "medium", "low"] }
              }
            }
          }
        }
      }
    });
    setResults(res);
    setLoading(false);
  };

  const strColors = { strong: 'bg-green-100 text-green-700', moderate: 'bg-blue-100 text-blue-700', exploratory: 'bg-slate-100 text-slate-600' };
  const impColors = { high: 'bg-red-100 text-red-700', medium: 'bg-amber-100 text-amber-700', low: 'bg-slate-100 text-slate-600' };

  return (
    <Card className="h-full">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="w-4 h-4 text-blue-500" /> Suggested Connections
        </CardTitle>
        <Button size="sm" onClick={analyze} disabled={loading || topProviders.length === 0} className="bg-blue-600 hover:bg-blue-700 h-7 text-xs gap-1">
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          {loading ? 'Analyzing...' : 'Analyze Network'}
        </Button>
      </CardHeader>
      <CardContent>
        {topProviders.length === 0 && <p className="text-xs text-slate-400 text-center py-8">Score providers first to get connection suggestions</p>}
        {topProviders.length > 0 && !results && !loading && (
          <p className="text-xs text-slate-400 text-center py-8">AI will suggest strategic connections for your top-scored providers</p>
        )}
        {loading && <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-14" />)}</div>}
        {results && (
          <div className="space-y-3">
            {results.provider_connections?.map((pc, i) => (
              <div key={i} className="border rounded-lg p-2.5 hover:bg-slate-50/50 transition-colors">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-slate-800">{pc.provider_name}</span>
                  <div className="flex items-center gap-1.5">
                    <Badge className={`text-[8px] ${strColors[pc.strength] || strColors.moderate}`}>{pc.strength}</Badge>
                    <Link to={createPageUrl(`ProviderDetail?npi=${pc.npi}`)}>
                      <ExternalLink className="w-3 h-3 text-slate-300 hover:text-blue-500" />
                    </Link>
                  </div>
                </div>
                <p className="text-[10px] text-blue-600 font-medium">{pc.suggested_connection}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{pc.rationale}</p>
              </div>
            ))}

            {results.network_opportunities?.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide mb-1.5">Network Opportunities</p>
                {results.network_opportunities.map((opp, i) => (
                  <div key={i} className="bg-blue-50 rounded-lg p-2.5 mb-1.5 border border-blue-100">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-blue-800">{opp.title}</span>
                      <Badge className={`text-[8px] ${impColors[opp.impact]}`}>{opp.impact}</Badge>
                    </div>
                    <p className="text-[10px] text-blue-600 mt-0.5">{opp.description}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
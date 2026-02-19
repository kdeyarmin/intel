import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { MapPin, Loader2, Sparkles, TrendingUp, Users, ShieldAlert, ExternalLink } from 'lucide-react';

export default function AILocationInsights({ location, coProviders = [], associatedProvider, taxonomies = [], utilizations = [], referrals = [] }) {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  const analyze = async () => {
    setLoading(true);

    const providerList = coProviders.slice(0, 10).map(p =>
      `${p.entity_type === 'Individual' ? `${p.first_name} ${p.last_name}` : p.organization_name} (${p.entity_type}, ${p.credential || 'N/A'})`
    ).join('\n');

    const specialties = taxonomies.map(t => t.taxonomy_description).filter(Boolean).join(', ');
    const latestUtil = [...utilizations].sort((a, b) => (b.year || 0) - (a.year || 0))[0];
    const latestRef = [...referrals].sort((a, b) => (b.year || 0) - (a.year || 0))[0];

    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `Analyze this healthcare location and provide strategic insights about the market, related providers to connect with, and growth opportunities.

LOCATION:
- Address: ${location?.address_1 || ''}, ${location?.city || ''}, ${location?.state || ''} ${location?.zip || ''}
- Type: ${location?.location_type || 'Unknown'}
- Primary NPI: ${location?.npi}

ASSOCIATED PROVIDER:
- Name: ${associatedProvider?.entity_type === 'Individual' ? `${associatedProvider?.first_name} ${associatedProvider?.last_name}` : associatedProvider?.organization_name || 'Unknown'}
- Specialties: ${specialties || 'Unknown'}

CO-LOCATED PROVIDERS (${coProviders.length}):
${providerList || 'None'}

UTILIZATION:
- Beneficiaries: ${latestUtil?.total_medicare_beneficiaries || 0}
- Services: ${latestUtil?.total_services || 0}
- Medicare Payment: $${latestUtil?.total_medicare_payment || 0}

REFERRALS:
- Total: ${latestRef?.total_referrals || 0}
- Home Health: ${latestRef?.home_health_referrals || 0}
- Hospice: ${latestRef?.hospice_referrals || 0}

Provide:
1. Related organizations or providers in the area that could be strategic connections
2. Market growth opportunities for this location
3. Competitive threats or market pressures
4. Overall location strategic assessment`,
      add_context_from_internet: true,
      response_json_schema: {
        type: "object",
        properties: {
          location_assessment: { type: "string" },
          related_connections: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                type: { type: "string" },
                rationale: { type: "string" },
                relationship_strength: { type: "string", enum: ["strong", "moderate", "exploratory"] }
              }
            }
          },
          growth_opportunities: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                description: { type: "string" },
                priority: { type: "string", enum: ["high", "medium", "low"] }
              }
            }
          },
          competitive_threats: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                description: { type: "string" }
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
  const prioColors = { high: 'bg-red-100 text-red-700', medium: 'bg-amber-100 text-amber-700', low: 'bg-slate-100 text-slate-600' };

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-teal-500" />
          AI Location Intelligence
        </CardTitle>
        <Button size="sm" onClick={analyze} disabled={loading} className="bg-teal-600 hover:bg-teal-700 h-7 text-xs">
          {loading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}
          {loading ? 'Analyzing...' : results ? 'Re-analyze' : 'Analyze'}
        </Button>
      </CardHeader>
      <CardContent>
        {!results && !loading && (
          <p className="text-xs text-slate-400 text-center py-4">AI will analyze market opportunities, related connections, and competitive landscape for this location</p>
        )}
        {loading && <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-14" />)}</div>}
        {results && (
          <div className="space-y-3">
            {results.location_assessment && (
              <p className="text-xs text-slate-600 bg-teal-50 rounded-lg px-3 py-2 leading-relaxed border border-teal-100">{results.location_assessment}</p>
            )}

            {results.related_connections?.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                  <Users className="w-3 h-3" /> Suggested Connections
                </p>
                {results.related_connections.map((c, i) => (
                  <div key={i} className="border rounded-lg p-2.5 mb-1.5 hover:bg-slate-50/50">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-700">{c.name}</span>
                      <Badge className={`text-[9px] ${strColors[c.relationship_strength] || strColors.exploratory}`}>{c.relationship_strength}</Badge>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">{c.rationale}</p>
                  </div>
                ))}
              </div>
            )}

            {results.growth_opportunities?.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> Growth Opportunities
                </p>
                {results.growth_opportunities.map((g, i) => (
                  <div key={i} className="bg-emerald-50 rounded-lg p-2.5 mb-1.5 border border-emerald-100">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-emerald-800">{g.title}</span>
                      <Badge className={`text-[9px] ${prioColors[g.priority]}`}>{g.priority}</Badge>
                    </div>
                    <p className="text-[10px] text-emerald-600 mt-0.5">{g.description}</p>
                  </div>
                ))}
              </div>
            )}

            {results.competitive_threats?.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                  <ShieldAlert className="w-3 h-3" /> Competitive Threats
                </p>
                {results.competitive_threats.map((t, i) => (
                  <div key={i} className="bg-red-50 rounded-lg p-2.5 mb-1.5 border border-red-100">
                    <span className="text-xs font-semibold text-red-800">{t.title}</span>
                    <p className="text-[10px] text-red-600 mt-0.5">{t.description}</p>
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
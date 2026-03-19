import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { base44 } from '@/api/base44Client';
import { TrendingUp, Loader2, Sparkles, ShieldAlert, Target, Zap } from 'lucide-react';

const INSIGHT_ICONS = { growth: TrendingUp, threat: ShieldAlert, opportunity: Target, action: Zap };
const INSIGHT_COLORS = {
  growth: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  threat: 'bg-red-50 border-red-200 text-red-800',
  opportunity: 'bg-blue-50 border-blue-200 text-blue-800',
  action: 'bg-violet-50 border-violet-200 text-violet-800',
};
const PRIORITY_COLORS = { high: 'bg-red-100 text-red-700', medium: 'bg-amber-100 text-amber-700', low: 'bg-slate-100 text-slate-600' };

export default function AIMarketInsights({ provider, location, taxonomies, utilizations = [], referrals = [], score }) {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  const name = provider?.entity_type === 'Individual'
    ? `${provider.first_name || ''} ${provider.last_name || ''}`.trim()
    : provider?.organization_name || '';

  const analyze = async () => {
    setLoading(true);

    const specialty = (taxonomies || []).map(t => t.taxonomy_description).filter(Boolean).join(', ');
    const latestUtil = [...utilizations].sort((a, b) => (b.year || 0) - (a.year || 0))[0];
    const latestRef = [...referrals].sort((a, b) => (b.year || 0) - (a.year || 0))[0];

    // Calculate YoY trends
    const sortedUtil = [...utilizations].sort((a, b) => a.year - b.year);
    const utilTrend = sortedUtil.length >= 2
      ? `Beneficiaries changed from ${sortedUtil[sortedUtil.length - 2]?.total_medicare_beneficiaries || 0} to ${sortedUtil[sortedUtil.length - 1]?.total_medicare_beneficiaries || 0}`
      : 'Insufficient trend data';

    const sortedRef = [...referrals].sort((a, b) => a.year - b.year);
    const refTrend = sortedRef.length >= 2
      ? `Referrals changed from ${sortedRef[sortedRef.length - 2]?.total_referrals || 0} to ${sortedRef[sortedRef.length - 1]?.total_referrals || 0}`
      : 'Insufficient trend data';

    try {
      const res = await base44.integrations.Core.InvokeLLM({
        prompt: `Provide strategic market intelligence for this healthcare provider. Think like a healthcare market analyst.

PROVIDER:
- Name: ${name}
- NPI: ${provider?.npi}
- Type: ${provider?.entity_type}
- Specialty: ${specialty}
- Location: ${location?.city || ''}, ${location?.state || ''}
- CareMetric Fit Score: ${score?.score || 'N/A'}/100

UTILIZATION DATA:
- Latest beneficiaries: ${latestUtil?.total_medicare_beneficiaries || 0}
- Latest services: ${latestUtil?.total_services || 0}
- Medicare payment: $${latestUtil?.total_medicare_payment || 0}
- Trend: ${utilTrend}

REFERRAL DATA:
- Total referrals: ${latestRef?.total_referrals || 0}
- Home Health: ${latestRef?.home_health_referrals || 0}
- Hospice: ${latestRef?.hospice_referrals || 0}
- SNF: ${latestRef?.snf_referrals || 0}
- Trend: ${refTrend}

Analyze and provide:
1. GROWTH AREAS: Where this provider could expand (new service lines, patient populations, geographic reach)
2. COMPETITIVE THREATS: What market pressures or competitive dynamics to watch
3. OPPORTUNITIES: Specific partnership, referral, or market opportunities
4. ACTION ITEMS: Concrete next steps for engagement

For each insight, categorize as growth/threat/opportunity/action and rate priority (high/medium/low).
Also provide an overall market position assessment.`,
        add_context_from_internet: true,
        response_json_schema: {
          type: "object",
          properties: {
            market_position: { type: "string" },
            market_score: { type: "number" },
            insights: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  type: { type: "string", enum: ["growth", "threat", "opportunity", "action"] },
                  title: { type: "string" },
                  description: { type: "string" },
                  priority: { type: "string", enum: ["high", "medium", "low"] },
                  data_point: { type: "string" },
                }
              }
            },
            competitive_landscape: { type: "string" },
            recommended_strategy: { type: "string" }
          }
        }
      });

      setResults(res);
    } catch (err) {
      console.error('Market analysis failed:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-500" />
          AI Market Insights
        </CardTitle>
        <Button size="sm" onClick={analyze} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 h-7 text-xs">
          {loading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}
          {loading ? 'Analyzing...' : results ? 'Re-analyze' : 'Analyze Market'}
        </Button>
      </CardHeader>
      <CardContent>
        {!results && !loading && (
          <p className="text-xs text-slate-400 text-center py-4">
            AI will analyze growth areas, competitive threats, and strategic opportunities
          </p>
        )}
        {loading && (
          <div className="space-y-2 py-2">
            {[1,2,3,4].map(i => <Skeleton key={i} className="h-16" />)}
          </div>
        )}
        {results && (
          <div className="space-y-3">
            {/* Market position header */}
            <div className="bg-gradient-to-r from-slate-50 to-emerald-50 rounded-lg p-3 border border-emerald-100">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-medium text-slate-500 uppercase">Market Position</span>
                {results.market_score != null && (
                  <Badge className={`text-[10px] ${results.market_score >= 70 ? 'bg-emerald-100 text-emerald-700' : results.market_score >= 40 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                    Score: {results.market_score}/100
                  </Badge>
                )}
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">{results.market_position}</p>
            </div>

            {/* Insights */}
            {results.insights?.map((insight, i) => {
              const Icon = INSIGHT_ICONS[insight.type] || TrendingUp;
              return (
                <div key={i} className={`rounded-lg p-3 border ${INSIGHT_COLORS[insight.type] || INSIGHT_COLORS.opportunity}`}>
                  <div className="flex items-start justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <Icon className="w-3.5 h-3.5" />
                      <span className="text-xs font-semibold">{insight.title}</span>
                    </div>
                    <Badge className={`text-[9px] ${PRIORITY_COLORS[insight.priority] || PRIORITY_COLORS.medium}`}>{insight.priority}</Badge>
                  </div>
                  <p className="text-[10px] leading-relaxed opacity-80">{insight.description}</p>
                  {insight.data_point && (
                    <p className="text-[9px] mt-1 opacity-60 italic">📊 {insight.data_point}</p>
                  )}
                </div>
              );
            })}

            {/* Competitive landscape */}
            {results.competitive_landscape && (
              <div className="bg-red-50/50 rounded-lg p-3 border border-red-100">
                <p className="text-[10px] font-medium text-red-700 uppercase mb-1 flex items-center gap-1">
                  <ShieldAlert className="w-3 h-3" /> Competitive Landscape
                </p>
                <p className="text-[10px] text-red-600 leading-relaxed">{results.competitive_landscape}</p>
              </div>
            )}

            {/* Recommended strategy */}
            {results.recommended_strategy && (
              <div className="bg-violet-50 rounded-lg p-3 border border-violet-100">
                <p className="text-[10px] font-medium text-violet-700 uppercase mb-1 flex items-center gap-1">
                  <Zap className="w-3 h-3" /> Recommended Strategy
                </p>
                <p className="text-[10px] text-violet-600 leading-relaxed">{results.recommended_strategy}</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
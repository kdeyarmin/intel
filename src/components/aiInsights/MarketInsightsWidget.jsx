import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { base44 } from '@/api/base44Client';
import { TrendingUp, Loader2, Sparkles, ShieldAlert, Target, Zap } from 'lucide-react';

const TYPE_CFG = {
  growth: { icon: TrendingUp, bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700' },
  threat: { icon: ShieldAlert, bg: 'bg-red-50 border-red-200', text: 'text-red-700' },
  opportunity: { icon: Target, bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700' },
  action: { icon: Zap, bg: 'bg-violet-50 border-violet-200', text: 'text-violet-700' },
};
const PRIO = { high: 'bg-red-100 text-red-700', medium: 'bg-amber-100 text-amber-700', low: 'bg-slate-100 text-slate-600' };

export default function MarketInsightsWidget({ providers = [], locations = [], taxonomies = [], utilizations = [], referrals = [] }) {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  const analyze = async () => {
    setLoading(true);
    const topStates = {};
    locations.forEach(l => { if (l.state) topStates[l.state] = (topStates[l.state] || 0) + 1; });
    const stateList = Object.entries(topStates).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([s, c]) => `${s}: ${c} locations`).join(', ');

    const topSpecialties = {};
    taxonomies.filter(t => t.primary_flag && t.taxonomy_description).forEach(t => {
      topSpecialties[t.taxonomy_description] = (topSpecialties[t.taxonomy_description] || 0) + 1;
    });
    const specList = Object.entries(topSpecialties).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([s, c]) => `${s} (${c})`).join(', ');

    const totalRef = referrals.reduce((s, r) => s + (r.total_referrals || 0), 0);
    const totalBenef = utilizations.reduce((s, u) => s + (u.total_medicare_beneficiaries || 0), 0);

    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `As a healthcare market analyst, provide a comprehensive market overview based on this provider network data.

NETWORK OVERVIEW:
- ${providers.length} providers, ${locations.length} locations
- Top states: ${stateList}
- Top specialties: ${specList}
- Total referral volume: ${totalRef.toLocaleString()}
- Total Medicare beneficiaries: ${totalBenef.toLocaleString()}

Provide 6 strategic insights covering growth opportunities, competitive threats, market trends, and actionable recommendations for a healthcare sales team.`,
      add_context_from_internet: true,
      response_json_schema: {
        type: "object",
        properties: {
          summary: { type: "string" },
          market_health_score: { type: "number" },
          insights: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["growth", "threat", "opportunity", "action"] },
                title: { type: "string" },
                description: { type: "string" },
                priority: { type: "string", enum: ["high", "medium", "low"] },
              }
            }
          }
        }
      }
    });
    setResults(res);
    setLoading(false);
  };

  return (
    <Card className="h-full">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-500" /> Market Intelligence
        </CardTitle>
        <Button size="sm" onClick={analyze} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 h-7 text-xs gap-1">
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          {loading ? 'Analyzing...' : results ? 'Refresh' : 'Analyze'}
        </Button>
      </CardHeader>
      <CardContent>
        {!results && !loading && <p className="text-xs text-slate-400 text-center py-8">Generate AI-driven market intelligence across your entire provider network</p>}
        {loading && <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-16" />)}</div>}
        {results && (
          <div className="space-y-3">
            <div className="flex items-center justify-between bg-gradient-to-r from-slate-50 to-emerald-50 rounded-lg p-3 border border-emerald-100">
              <p className="text-xs text-slate-700 leading-relaxed flex-1">{results.summary}</p>
              {results.market_health_score != null && (
                <Badge className={`ml-3 shrink-0 text-xs ${results.market_health_score >= 70 ? 'bg-emerald-100 text-emerald-700' : results.market_health_score >= 40 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                  {results.market_health_score}/100
                </Badge>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {results.insights?.map((ins, i) => {
                const cfg = TYPE_CFG[ins.type] || TYPE_CFG.opportunity;
                const Icon = cfg.icon;
                return (
                  <div key={i} className={`rounded-lg p-3 border ${cfg.bg}`}>
                    <div className="flex items-start justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <Icon className={`w-3.5 h-3.5 ${cfg.text}`} />
                        <span className={`text-xs font-semibold ${cfg.text}`}>{ins.title}</span>
                      </div>
                      <Badge className={`text-[8px] ${PRIO[ins.priority]}`}>{ins.priority}</Badge>
                    </div>
                    <p className={`text-[10px] leading-relaxed ${cfg.text} opacity-80`}>{ins.description}</p>
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
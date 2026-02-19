import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { GitBranch, Loader2, Sparkles, ExternalLink, TrendingUp, AlertTriangle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export default function HighReferralPotentialWidget({ providers = [], referrals = [], utilizations = [], locations = [], taxonomies = [], scores = [] }) {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  // Pre-compute referral stats
  const refMap = useMemo(() => {
    const m = {};
    referrals.forEach(r => {
      if (!m[r.npi] || r.year > m[r.npi].year) m[r.npi] = r;
    });
    return m;
  }, [referrals]);

  const utilMap = useMemo(() => {
    const m = {};
    utilizations.forEach(u => {
      if (!m[u.npi] || u.year > m[u.npi].year) m[u.npi] = u;
    });
    return m;
  }, [utilizations]);

  const provMap = useMemo(() => {
    const m = {};
    providers.forEach(p => { m[p.npi] = p; });
    return m;
  }, [providers]);

  const scoreMap = useMemo(() => {
    const m = {};
    scores.forEach(s => { m[s.npi] = s.score; });
    return m;
  }, [scores]);

  // Identify top referral potential candidates locally
  const candidates = useMemo(() => {
    return providers
      .map(p => {
        const ref = refMap[p.npi];
        const util = utilMap[p.npi];
        const loc = locations.find(l => l.npi === p.npi && l.is_primary) || locations.find(l => l.npi === p.npi);
        const tax = taxonomies.find(t => t.npi === p.npi && t.primary_flag) || taxonomies.find(t => t.npi === p.npi);
        const totalRef = ref?.total_referrals || 0;
        const hhRef = ref?.home_health_referrals || 0;
        const hospRef = ref?.hospice_referrals || 0;
        const benef = util?.total_medicare_beneficiaries || 0;
        const payment = util?.total_medicare_payment || 0;
        const name = p.entity_type === 'Individual' ? `${p.first_name || ''} ${p.last_name || ''}`.trim() : p.organization_name || '';
        return {
          npi: p.npi, name: name || p.npi, totalRef, hhRef, hospRef, benef, payment,
          specialty: tax?.taxonomy_description || '', state: loc?.state || '', city: loc?.city || '',
          score: scoreMap[p.npi] || 0,
        };
      })
      .filter(c => c.benef > 0 || c.totalRef > 0)
      .sort((a, b) => (b.totalRef + b.benef) - (a.totalRef + a.benef))
      .slice(0, 15);
  }, [providers, refMap, utilMap, locations, taxonomies, scoreMap]);

  const chartData = candidates.slice(0, 8).map(c => ({
    name: c.name.length > 14 ? c.name.slice(0, 12) + '…' : c.name,
    referrals: c.totalRef,
    beneficiaries: Math.round(c.benef / 10), // Scale down for chart readability
  }));

  const analyze = async () => {
    setLoading(true);
    const topData = candidates.slice(0, 10).map(c =>
      `${c.name} (NPI:${c.npi}) — Referrals:${c.totalRef}, HH:${c.hhRef}, Hospice:${c.hospRef}, Beneficiaries:${c.benef}, Payment:$${Math.round(c.payment/1000)}K, Specialty:${c.specialty}, ${c.city} ${c.state}, Score:${c.score}`
    ).join('\n');

    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a healthcare sales intelligence analyst. Analyze these providers and identify which have the HIGHEST REFERRAL POTENTIAL for home health and hospice services.

TOP PROVIDERS BY REFERRAL + UTILIZATION VOLUME:
${topData}

For each provider, assess:
1. Current referral activity (are they already referring? to where?)
2. Untapped potential (high beneficiaries but low HH/hospice referrals = opportunity)
3. Growth signals (high volume, good specialty match)
4. Risk factors (declining referrals, deactivated, etc.)

Rank the top 5 providers by referral potential and explain WHY. Also provide 3 overall network-level observations about referral patterns.`,
      response_json_schema: {
        type: "object",
        properties: {
          top_referral_leads: {
            type: "array",
            items: {
              type: "object",
              properties: {
                npi: { type: "string" },
                name: { type: "string" },
                potential_score: { type: "number" },
                current_status: { type: "string" },
                opportunity: { type: "string" },
                risk_level: { type: "string", enum: ["low", "medium", "high"] },
                recommended_action: { type: "string" },
              }
            }
          },
          network_observations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                insight: { type: "string" },
                priority: { type: "string", enum: ["high", "medium", "low"] },
              }
            }
          },
          summary: { type: "string" },
        }
      }
    });
    setResults(res);
    setLoading(false);
  };

  const riskColors = { low: 'bg-green-100 text-green-700', medium: 'bg-amber-100 text-amber-700', high: 'bg-red-100 text-red-700' };
  const prioColors = { high: 'border-red-200 bg-red-50', medium: 'border-amber-200 bg-amber-50', low: 'border-slate-200 bg-slate-50' };

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-violet-500" /> High Referral Potential
          <Badge variant="outline" className="text-[10px] ml-1">{candidates.length} candidates</Badge>
        </CardTitle>
        <Button size="sm" onClick={analyze} disabled={loading || candidates.length === 0} className="bg-violet-600 hover:bg-violet-700 h-7 text-xs gap-1">
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          {loading ? 'Analyzing...' : results ? 'Refresh' : 'Identify Leads'}
        </Button>
      </CardHeader>
      <CardContent>
        {candidates.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-8">Import referral or utilization data to identify high-potential providers</p>
        )}

        {candidates.length > 0 && !results && !loading && (
          <div className="space-y-4">
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 9 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={100} />
                  <Tooltip />
                  <Bar dataKey="referrals" fill="#8b5cf6" radius={[0, 4, 4, 0]} name="Referrals" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-slate-400 text-center">Click "Identify Leads" for AI-powered referral potential analysis</p>
          </div>
        )}

        {loading && <div className="space-y-2">{[1,2,3,4].map(i => <Skeleton key={i} className="h-16" />)}</div>}

        {results && (
          <div className="space-y-3">
            {results.summary && (
              <div className="bg-gradient-to-r from-violet-50 to-blue-50 rounded-lg p-3 border border-violet-100">
                <p className="text-xs text-slate-700 leading-relaxed">{results.summary}</p>
              </div>
            )}

            <div className="space-y-2">
              {results.top_referral_leads?.map((lead, i) => (
                <div key={i} className="border rounded-lg p-3 hover:bg-slate-50/50 transition-colors">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-[10px] font-bold">
                        {i + 1}
                      </div>
                      <span className="text-sm font-semibold text-slate-800">{lead.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge className="text-[10px] bg-violet-100 text-violet-700">{lead.potential_score}/100</Badge>
                      <Badge className={`text-[8px] ${riskColors[lead.risk_level]}`}>{lead.risk_level} risk</Badge>
                      <Link to={createPageUrl(`ProviderDetail?npi=${lead.npi}`)}>
                        <ExternalLink className="w-3 h-3 text-slate-300 hover:text-blue-500" />
                      </Link>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 mb-1">{lead.current_status}</p>
                  <div className="flex items-start gap-1.5">
                    <TrendingUp className="w-3 h-3 text-emerald-500 mt-0.5 shrink-0" />
                    <p className="text-[11px] text-emerald-700">{lead.opportunity}</p>
                  </div>
                  <p className="text-[10px] text-blue-600 mt-1 font-medium">→ {lead.recommended_action}</p>
                </div>
              ))}
            </div>

            {results.network_observations?.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Network Observations</p>
                {results.network_observations.map((obs, i) => (
                  <div key={i} className={`rounded-lg p-2.5 border ${prioColors[obs.priority]}`}>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <AlertTriangle className="w-3 h-3 text-slate-500" />
                      <span className="text-xs font-semibold text-slate-700">{obs.title}</span>
                    </div>
                    <p className="text-[10px] text-slate-600">{obs.insight}</p>
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
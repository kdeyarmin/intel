import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { base44 } from '@/api/base44Client';
import { FileText, Loader2, Sparkles, Users, Building2, MapPin, Stethoscope } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const SPEC_COLORS = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1', '#14b8a6'];

export default function ProviderSummaryWidget({ providers = [], locations = [], taxonomies = [], referrals = [], utilizations = [] }) {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  const breakdown = useMemo(() => {
    const individuals = providers.filter(p => p.entity_type === 'Individual').length;
    const organizations = providers.filter(p => p.entity_type === 'Organization').length;
    const active = providers.filter(p => p.status === 'Active').length;
    const withEmail = providers.filter(p => p.email).length;

    const stateCount = {};
    locations.forEach(l => { if (l.state) stateCount[l.state] = (stateCount[l.state] || 0) + 1; });
    const topStates = Object.entries(stateCount).sort((a, b) => b[1] - a[1]).slice(0, 8);

    const specCount = {};
    taxonomies.filter(t => t.primary_flag && t.taxonomy_description).forEach(t => {
      specCount[t.taxonomy_description] = (specCount[t.taxonomy_description] || 0) + 1;
    });
    const topSpecs = Object.entries(specCount).sort((a, b) => b[1] - a[1]).slice(0, 8);

    const credCount = {};
    providers.filter(p => p.credential).forEach(p => {
      credCount[p.credential] = (credCount[p.credential] || 0) + 1;
    });
    const topCreds = Object.entries(credCount).sort((a, b) => b[1] - a[1]).slice(0, 6);

    return { individuals, organizations, active, withEmail, topStates, topSpecs, topCreds };
  }, [providers, locations, taxonomies]);

  const specChartData = breakdown.topSpecs.map(([name, count]) => ({
    name: name.length > 22 ? name.slice(0, 20) + '…' : name,
    count,
  }));

  const stateChartData = breakdown.topStates.map(([state, count]) => ({ state, count }));

  const typePieData = [
    { name: 'Individual', value: breakdown.individuals },
    { name: 'Organization', value: breakdown.organizations },
  ].filter(d => d.value > 0);

  const analyze = async () => {
    setLoading(true);

    const totalRef = referrals.reduce((s, r) => s + (r.total_referrals || 0), 0);
    const totalBenef = utilizations.reduce((s, u) => s + (u.total_medicare_beneficiaries || 0), 0);
    const totalPayment = utilizations.reduce((s, u) => s + (u.total_medicare_payment || 0), 0);

    const stateList = breakdown.topStates.map(([s, c]) => `${s}(${c})`).join(', ');
    const specList = breakdown.topSpecs.map(([s, c]) => `${s}(${c})`).join(', ');
    const credList = breakdown.topCreds.map(([c, n]) => `${c}(${n})`).join(', ');

    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a healthcare analytics expert. Generate a comprehensive executive summary of this provider network database.

NETWORK OVERVIEW:
- Total providers: ${providers.length} (${breakdown.individuals} individuals, ${breakdown.organizations} organizations)
- Active: ${breakdown.active}, With email: ${breakdown.withEmail}
- Total locations: ${locations.length}
- Total taxonomy records: ${taxonomies.length}

REFERRAL DATA:
- Total referral volume: ${totalRef.toLocaleString()}
- Providers with referral data: ${new Set(referrals.map(r => r.npi)).size}

UTILIZATION DATA:
- Total Medicare beneficiaries: ${totalBenef.toLocaleString()}
- Total Medicare payments: $${Math.round(totalPayment/1000000)}M
- Providers with utilization data: ${new Set(utilizations.map(u => u.npi)).size}

TOP STATES: ${stateList}
TOP SPECIALTIES: ${specList}
TOP CREDENTIALS: ${credList}

Provide:
1. Executive summary (2-3 sentences)
2. Network strengths (top 3)
3. Network gaps (top 3)
4. Key demographic patterns
5. Strategic recommendations for a sales team`,
      response_json_schema: {
        type: "object",
        properties: {
          executive_summary: { type: "string" },
          strengths: { type: "array", items: { type: "object", properties: { title: { type: "string" }, detail: { type: "string" } } } },
          gaps: { type: "array", items: { type: "object", properties: { title: { type: "string" }, detail: { type: "string" } } } },
          demographic_patterns: { type: "array", items: { type: "string" } },
          strategic_recommendations: { type: "array", items: { type: "object", properties: { recommendation: { type: "string" }, rationale: { type: "string" }, priority: { type: "string", enum: ["high", "medium", "low"] } } } },
        }
      }
    });
    setResults(res);
    setLoading(false);
  };

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="w-4 h-4 text-blue-500" /> Provider Network Summary
        </CardTitle>
        <Button size="sm" onClick={analyze} disabled={loading || providers.length === 0} className="bg-blue-600 hover:bg-blue-700 h-7 text-xs gap-1">
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          {loading ? 'Summarizing...' : results ? 'Refresh' : 'Generate Summary'}
        </Button>
      </CardHeader>
      <CardContent>
        {providers.length === 0 && <p className="text-xs text-slate-400 text-center py-8">Import providers to generate summary</p>}

        {/* Always show charts */}
        {providers.length > 0 && (
          <div className="space-y-4">
            {/* Quick stats */}
            <div className="grid grid-cols-4 gap-2">
              <div className="bg-blue-50 rounded-lg p-2 text-center">
                <Users className="w-4 h-4 text-blue-500 mx-auto mb-0.5" />
                <p className="text-lg font-bold text-blue-700">{breakdown.individuals}</p>
                <p className="text-[9px] text-blue-500">Individuals</p>
              </div>
              <div className="bg-indigo-50 rounded-lg p-2 text-center">
                <Building2 className="w-4 h-4 text-indigo-500 mx-auto mb-0.5" />
                <p className="text-lg font-bold text-indigo-700">{breakdown.organizations}</p>
                <p className="text-[9px] text-indigo-500">Organizations</p>
              </div>
              <div className="bg-emerald-50 rounded-lg p-2 text-center">
                <MapPin className="w-4 h-4 text-emerald-500 mx-auto mb-0.5" />
                <p className="text-lg font-bold text-emerald-700">{breakdown.topStates.length}</p>
                <p className="text-[9px] text-emerald-500">States</p>
              </div>
              <div className="bg-violet-50 rounded-lg p-2 text-center">
                <Stethoscope className="w-4 h-4 text-violet-500 mx-auto mb-0.5" />
                <p className="text-lg font-bold text-violet-700">{breakdown.topSpecs.length}</p>
                <p className="text-[9px] text-violet-500">Specialties</p>
              </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] font-medium text-slate-400 uppercase mb-1">Top States</p>
                <div className="h-36">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stateChartData}>
                      <XAxis dataKey="state" tick={{ fontSize: 9 }} />
                      <YAxis tick={{ fontSize: 9 }} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-medium text-slate-400 uppercase mb-1">Top Specialties</p>
                <div className="h-36">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={specChartData} layout="vertical">
                      <XAxis type="number" tick={{ fontSize: 9 }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 8 }} width={90} />
                      <Tooltip />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                        {specChartData.map((_, i) => <Cell key={i} fill={SPEC_COLORS[i % SPEC_COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {loading && <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-14" />)}</div>}

            {results && (
              <div className="space-y-3 border-t pt-3">
                {/* Executive summary */}
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-3 border border-blue-100">
                  <p className="text-xs font-medium text-blue-800 mb-1">Executive Summary</p>
                  <p className="text-xs text-slate-700 leading-relaxed">{results.executive_summary}</p>
                </div>

                {/* Strengths and Gaps side by side */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-medium text-emerald-600 uppercase tracking-wide">Strengths</p>
                    {results.strengths?.map((s, i) => (
                      <div key={i} className="bg-emerald-50 rounded-lg p-2 border border-emerald-100">
                        <p className="text-[11px] font-semibold text-emerald-800">{s.title}</p>
                        <p className="text-[10px] text-emerald-600">{s.detail}</p>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-medium text-red-600 uppercase tracking-wide">Gaps</p>
                    {results.gaps?.map((g, i) => (
                      <div key={i} className="bg-red-50 rounded-lg p-2 border border-red-100">
                        <p className="text-[11px] font-semibold text-red-800">{g.title}</p>
                        <p className="text-[10px] text-red-600">{g.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Demographic patterns */}
                {results.demographic_patterns?.length > 0 && (
                  <div className="bg-slate-50 rounded-lg p-2.5 border">
                    <p className="text-[10px] font-medium text-slate-500 uppercase mb-1">Key Patterns</p>
                    {results.demographic_patterns.map((p, i) => (
                      <p key={i} className="text-[10px] text-slate-600 mb-0.5">• {p}</p>
                    ))}
                  </div>
                )}

                {/* Strategic recommendations */}
                {results.strategic_recommendations?.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-medium text-blue-600 uppercase tracking-wide">Strategic Recommendations</p>
                    {results.strategic_recommendations.map((r, i) => (
                      <div key={i} className="border rounded-lg p-2.5">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[11px] font-semibold text-slate-800">{r.recommendation}</span>
                          <Badge className={`text-[8px] ${r.priority === 'high' ? 'bg-red-100 text-red-700' : r.priority === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{r.priority}</Badge>
                        </div>
                        <p className="text-[10px] text-slate-500">{r.rationale}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {!results && !loading && (
              <p className="text-xs text-slate-400 text-center">Click "Generate Summary" for an AI-powered executive overview</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
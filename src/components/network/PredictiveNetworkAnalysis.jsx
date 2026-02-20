import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles, TrendingUp, Users, MapPin, Handshake, AlertTriangle, Activity } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export default function PredictiveNetworkAnalysis({ nodes = [], edges = [], locations = [] }) {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);

  const networkSnapshot = useMemo(() => {
    const stateSpecs = {};
    const npiState = {};
    locations.forEach(l => { if (l.npi && l.state) npiState[l.npi] = l.state; });

    nodes.forEach(n => {
      const st = n.state || npiState[n.npi];
      if (!st) return;
      if (!stateSpecs[st]) stateSpecs[st] = { providers: 0, totalVol: 0, hubs: 0, specs: {} };
      stateSpecs[st].providers++;
      stateSpecs[st].totalVol += n.totalVolume;
      if (n.isHub) stateSpecs[st].hubs++;
      if (n.specialty) stateSpecs[st].specs[n.specialty] = (stateSpecs[st].specs[n.specialty] || 0) + 1;
    });

    // Referral flow patterns
    const flowBySpec = {};
    edges.forEach(e => {
      const src = nodes.find(n => n.npi === e.source);
      const tgt = nodes.find(n => n.npi === e.target);
      if (src?.specialty && tgt?.specialty && src.specialty !== tgt.specialty) {
        const key = `${src.specialty} → ${tgt.specialty}`;
        flowBySpec[key] = (flowBySpec[key] || 0) + e.volume;
      }
    });

    const topFlows = Object.entries(flowBySpec).sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([path, vol]) => ({ path, volume: vol }));

    return { stateSpecs, topFlows, totalNodes: nodes.length, totalEdges: edges.length };
  }, [nodes, edges, locations]);

  const runAnalysis = async () => {
    setLoading(true);

    const statesSummary = Object.entries(networkSnapshot.stateSpecs)
      .sort((a, b) => b[1].providers - a[1].providers)
      .slice(0, 15)
      .map(([st, d]) => `${st}: ${d.providers} providers, ${d.hubs} hubs, vol=${d.totalVol}, specialties=${Object.keys(d.specs).length}`)
      .join('\n');

    const flowsSummary = networkSnapshot.topFlows.map(f => `${f.path}: ${f.volume}`).join('\n');

    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a healthcare network analytics expert. Perform predictive analysis on this referral network.

NETWORK: ${networkSnapshot.totalNodes} providers, ${networkSnapshot.totalEdges} connections

STATE BREAKDOWN:
${statesSummary}

TOP REFERRAL PATHWAYS (specialty-to-specialty):
${flowsSummary}

Analyze and predict:

1. REFERRAL PATTERN PREDICTIONS: What referral patterns are emerging? Which specialty pairs will likely see increased referral volume?

2. UNDERSERVED POPULATIONS: Based on provider density, specialty mix, and referral patterns, which areas likely have underserved patient populations? Consider socio-economic factors (rural vs urban, specialty access).

3. FUTURE NETWORK NEEDS (6-12 months): What specialties or providers should be recruited to strengthen the network? Where are the bottlenecks?

4. CARE GAP FORECAST: Based on current trends, which states/specialties will face growing care gaps?

5. STRATEGIC PARTNERSHIPS: Recommend 3-5 specific partnership types or organizational connections that would most benefit this network. Be specific about what type of organization, in which state, and why.

Provide data-driven predictions with confidence levels.`,
      response_json_schema: {
        type: "object",
        properties: {
          referral_predictions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                pattern: { type: "string" },
                trend: { type: "string", enum: ["growing", "stable", "declining"] },
                confidence: { type: "string", enum: ["high", "medium", "low"] },
                implication: { type: "string" }
              }
            }
          },
          underserved_populations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                area: { type: "string" },
                severity: { type: "string", enum: ["critical", "high", "moderate"] },
                affected_specialties: { type: "array", items: { type: "string" } },
                socioeconomic_factor: { type: "string" },
                recommendation: { type: "string" }
              }
            }
          },
          future_needs: {
            type: "array",
            items: {
              type: "object",
              properties: {
                need: { type: "string" },
                priority: { type: "string", enum: ["critical", "high", "medium"] },
                timeline: { type: "string" },
                action: { type: "string" }
              }
            }
          },
          care_gap_forecast: {
            type: "array",
            items: {
              type: "object",
              properties: {
                state: { type: "string" },
                specialty: { type: "string" },
                current_gap_score: { type: "number" },
                predicted_gap_score: { type: "number" },
                timeframe: { type: "string" }
              }
            }
          },
          strategic_partnerships: {
            type: "array",
            items: {
              type: "object",
              properties: {
                partner_type: { type: "string" },
                location: { type: "string" },
                rationale: { type: "string" },
                expected_impact: { type: "string" },
                priority: { type: "string", enum: ["high", "medium", "low"] }
              }
            }
          },
          network_health_forecast: {
            type: "object",
            properties: {
              current_score: { type: "number" },
              predicted_6m_score: { type: "number" },
              predicted_12m_score: { type: "number" },
              key_driver: { type: "string" }
            }
          }
        }
      }
    });

    setAnalysis(res);
    setLoading(false);
  };

  const SEVERITY_COLORS = { critical: 'bg-red-500/15 text-red-400', high: 'bg-amber-500/15 text-amber-400', moderate: 'bg-blue-500/15 text-blue-400', medium: 'bg-amber-500/15 text-amber-400', low: 'bg-slate-700/50 text-slate-400' };
  const TREND_ICONS = { growing: '↑', stable: '→', declining: '↓' };
  const TREND_COLORS = { growing: 'text-emerald-400', stable: 'text-slate-400', declining: 'text-red-400' };
  const tooltipStyle = { background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 11, color: '#e2e8f0' };

  if (nodes.length === 0) return null;

  return (
    <div className="space-y-4">
      <Button onClick={runAnalysis} disabled={loading} className="w-full bg-violet-600 hover:bg-violet-700 gap-2">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        {loading ? 'Running Predictive Analysis...' : 'Run AI Predictive Network Analysis'}
      </Button>

      {loading && (
        <div className="text-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-violet-400 mx-auto mb-3" />
          <p className="text-sm text-slate-400">Analyzing referral patterns, population data, and network topology...</p>
        </div>
      )}

      {analysis && !loading && (
        <div className="space-y-4">
          {/* Health forecast */}
          {analysis.network_health_forecast && (
            <Card className="bg-[#141d30] border-slate-700/50">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300 flex items-center gap-2"><Activity className="w-4 h-4 text-cyan-400" /> Network Health Forecast</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Current', value: analysis.network_health_forecast.current_score, period: 'Now' },
                    { label: '6 Month', value: analysis.network_health_forecast.predicted_6m_score, period: '+6m' },
                    { label: '12 Month', value: analysis.network_health_forecast.predicted_12m_score, period: '+12m' },
                  ].map(f => (
                    <div key={f.label} className="text-center">
                      <p className={`text-2xl font-bold ${f.value >= 70 ? 'text-emerald-400' : f.value >= 40 ? 'text-amber-400' : 'text-red-400'}`}>{f.value}</p>
                      <p className="text-[10px] text-slate-500">{f.label}</p>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-slate-500 mt-2 text-center">{analysis.network_health_forecast.key_driver}</p>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Referral predictions */}
            {analysis.referral_predictions?.length > 0 && (
              <Card className="bg-[#141d30] border-slate-700/50">
                <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-emerald-400" /> Referral Predictions</CardTitle></CardHeader>
                <CardContent className="space-y-2 max-h-[300px] overflow-y-auto">
                  {analysis.referral_predictions.map((p, i) => (
                    <div key={i} className="border border-slate-700/30 rounded-lg p-2.5">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold ${TREND_COLORS[p.trend]}`}>{TREND_ICONS[p.trend]}</span>
                        <span className="text-xs text-slate-300 flex-1">{p.pattern}</span>
                        <Badge className={`text-[8px] ${SEVERITY_COLORS[p.confidence]}`}>{p.confidence}</Badge>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1">{p.implication}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Underserved populations */}
            {analysis.underserved_populations?.length > 0 && (
              <Card className="bg-[#141d30] border-slate-700/50">
                <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300 flex items-center gap-2"><MapPin className="w-4 h-4 text-amber-400" /> Underserved Populations</CardTitle></CardHeader>
                <CardContent className="space-y-2 max-h-[300px] overflow-y-auto">
                  {analysis.underserved_populations.map((p, i) => (
                    <div key={i} className="border border-slate-700/30 rounded-lg p-2.5">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-slate-200">{p.area}</span>
                        <Badge className={`text-[8px] ${SEVERITY_COLORS[p.severity]}`}>{p.severity}</Badge>
                      </div>
                      <p className="text-[9px] text-slate-500">{p.socioeconomic_factor}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {p.affected_specialties?.map(s => <Badge key={s} className="bg-red-500/10 text-red-400 text-[8px]">{s}</Badge>)}
                      </div>
                      <p className="text-[10px] text-cyan-400 mt-1">{p.recommendation}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Care gap forecast chart */}
          {analysis.care_gap_forecast?.length > 0 && (
            <Card className="bg-[#141d30] border-slate-700/50">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-400" /> Care Gap Forecast</CardTitle></CardHeader>
              <CardContent>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analysis.care_gap_forecast.slice(0, 8)} layout="vertical">
                      <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: '#64748b' }} />
                      <YAxis type="category" dataKey={(d) => `${d.state} ${d.specialty?.slice(0, 12)}`} tick={{ fontSize: 9, fill: '#94a3b8' }} width={100} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="current_gap_score" fill="#64748b" name="Current" barSize={10} radius={[0, 2, 2, 0]} />
                      <Bar dataKey="predicted_gap_score" fill="#ef4444" name="Predicted" barSize={10} radius={[0, 2, 2, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Strategic partnerships */}
          {analysis.strategic_partnerships?.length > 0 && (
            <Card className="bg-[#141d30] border-slate-700/50">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300 flex items-center gap-2"><Handshake className="w-4 h-4 text-violet-400" /> Strategic Partnership Opportunities</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {analysis.strategic_partnerships.map((p, i) => (
                  <div key={i} className="border border-slate-700/30 rounded-lg p-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs font-medium text-slate-200">{p.partner_type}</p>
                        <p className="text-[10px] text-slate-500">{p.location}</p>
                      </div>
                      <Badge className={`text-[8px] ${SEVERITY_COLORS[p.priority]}`}>{p.priority} priority</Badge>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1.5">{p.rationale}</p>
                    <Badge className="bg-emerald-500/10 text-emerald-400 text-[8px] mt-1">{p.expected_impact}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Future needs */}
          {analysis.future_needs?.length > 0 && (
            <Card className="bg-[#141d30] border-slate-700/50">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300 flex items-center gap-2"><Users className="w-4 h-4 text-cyan-400" /> Future Network Needs</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {analysis.future_needs.map((n, i) => (
                  <div key={i} className="flex items-start gap-3 border border-slate-700/30 rounded-lg p-2.5">
                    <Badge className={`text-[8px] shrink-0 mt-0.5 ${SEVERITY_COLORS[n.priority]}`}>{n.priority}</Badge>
                    <div>
                      <p className="text-xs text-slate-200">{n.need}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">{n.action}</p>
                      <Badge variant="outline" className="text-[8px] text-slate-500 mt-1">{n.timeline}</Badge>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
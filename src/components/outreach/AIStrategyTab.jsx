import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Lightbulb, TrendingUp, TrendingDown, Target, Clock, AlertTriangle } from 'lucide-react';

export default function AIStrategyTab({ campaigns = [], providers = [], scores = [], referrals = [], locations = [], taxonomies = [] }) {
  const [loading, setLoading] = useState(false);
  const [strategy, setStrategy] = useState(null);

  const generateStrategy = async () => {
    setLoading(true);

    const historicalData = campaigns.filter(c => c.sent_count > 0).map(c => ({
      name: c.name,
      source: c.source_criteria,
      sent: c.sent_count,
      opened: c.opened_count,
      responded: c.responded_count,
      bounced: c.bounced_count,
      openRate: c.sent_count > 0 ? Math.round((c.opened_count / c.sent_count) * 100) : 0,
      responseRate: c.sent_count > 0 ? Math.round((c.responded_count / c.sent_count) * 100) : 0,
      status: c.status,
      created: c.created_date,
    }));

    const providerStats = {
      total: providers.length,
      withEmail: providers.filter(p => p.email).length,
      individuals: providers.filter(p => p.entity_type === 'Individual').length,
      organizations: providers.filter(p => p.entity_type === 'Organization').length,
      avgScore: scores.length > 0 ? Math.round(scores.reduce((a, s) => a + (s.score || 0), 0) / scores.length) : 0,
      topStates: Object.entries(locations.reduce((acc, l) => { if (l.state) acc[l.state] = (acc[l.state] || 0) + 1; return acc; }, {}))
        .sort((a, b) => b[1] - a[1]).slice(0, 5).map(([s, c]) => `${s}: ${c}`),
      topSpecialties: Object.entries(taxonomies.reduce((acc, t) => { if (t.taxonomy_description) acc[t.taxonomy_description] = (acc[t.taxonomy_description] || 0) + 1; return acc; }, {}))
        .sort((a, b) => b[1] - a[1]).slice(0, 5).map(([s, c]) => `${s}: ${c}`),
    };

    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a healthcare B2B marketing strategist. Based on the historical campaign performance and provider database, proactively suggest the next best campaign strategies.

HISTORICAL CAMPAIGNS (${historicalData.length} total):
${historicalData.length > 0 ? JSON.stringify(historicalData, null, 2) : 'No completed campaigns yet - suggest initial strategies.'}

PROVIDER DATABASE OVERVIEW:
${JSON.stringify(providerStats, null, 2)}

Provide 3-5 proactive campaign strategy recommendations. For each:
1. A clear campaign concept and name
2. Why now (timing rationale based on data patterns)
3. Recommended target audience segment
4. Expected performance vs historical benchmarks
5. Key risks and mitigations
6. Priority level

Also provide:
- Overall strategic assessment of the outreach program
- Top 3 patterns you spotted in historical data
- What's working well vs what needs to change
- Recommended campaign cadence/calendar for next quarter`,
      response_json_schema: {
        type: "object",
        properties: {
          strategic_assessment: { type: "string" },
          patterns: {
            type: "array",
            items: {
              type: "object",
              properties: {
                pattern: { type: "string" },
                impact: { type: "string", enum: ["positive", "negative", "neutral"] },
                insight: { type: "string" }
              }
            }
          },
          whats_working: { type: "array", items: { type: "string" } },
          needs_improvement: { type: "array", items: { type: "string" } },
          campaign_strategies: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                concept: { type: "string" },
                why_now: { type: "string" },
                target_audience: { type: "string" },
                expected_open_rate: { type: "number" },
                expected_response_rate: { type: "number" },
                priority: { type: "string", enum: ["high", "medium", "low"] },
                risks: { type: "array", items: { type: "string" } },
                mitigations: { type: "array", items: { type: "string" } }
              }
            }
          },
          quarterly_calendar: {
            type: "array",
            items: {
              type: "object",
              properties: {
                month: { type: "string" },
                campaign_type: { type: "string" },
                focus: { type: "string" }
              }
            }
          }
        }
      }
    });
    setStrategy(res);
    setLoading(false);
  };

  const impactColors = { positive: 'text-green-600', negative: 'text-red-600', neutral: 'text-slate-500' };
  const impactIcons = { positive: TrendingUp, negative: TrendingDown, neutral: Target };
  const prioColors = { high: 'bg-red-100 text-red-700', medium: 'bg-amber-100 text-amber-700', low: 'bg-slate-100 text-slate-600' };

  return (
    <div className="space-y-2">
      <Button size="sm" onClick={generateStrategy} disabled={loading} className="w-full bg-violet-600 hover:bg-violet-700 h-7 text-xs gap-1">
        {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Lightbulb className="w-3 h-3" />}
        {loading ? 'Analyzing...' : 'Generate Campaign Strategies'}
      </Button>

      {strategy && (
        <div className="space-y-2.5">
          {/* Strategic Assessment */}
          <div className="bg-slate-50 rounded-lg p-2.5 border">
            <p className="text-[10px] font-semibold text-slate-500 uppercase mb-1">Strategic Assessment</p>
            <p className="text-[10px] text-slate-700 leading-relaxed">{strategy.strategic_assessment}</p>
          </div>

          {/* Patterns */}
          {strategy.patterns?.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">Data Patterns</p>
              {strategy.patterns.map((p, i) => {
                const Icon = impactIcons[p.impact] || Target;
                return (
                  <div key={i} className="flex items-start gap-1.5 mb-1.5">
                    <Icon className={`w-3 h-3 mt-0.5 shrink-0 ${impactColors[p.impact]}`} />
                    <div>
                      <p className="text-[10px] font-medium text-slate-700">{p.pattern}</p>
                      <p className="text-[9px] text-slate-400">{p.insight}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Working vs Needs Improvement */}
          <div className="grid grid-cols-2 gap-2">
            {strategy.whats_working?.length > 0 && (
              <div className="bg-green-50 rounded-lg p-2 border border-green-100">
                <p className="text-[10px] font-semibold text-green-700 mb-1">✓ Working Well</p>
                {strategy.whats_working.map((w, i) => <p key={i} className="text-[9px] text-green-600 mb-0.5">• {w}</p>)}
              </div>
            )}
            {strategy.needs_improvement?.length > 0 && (
              <div className="bg-amber-50 rounded-lg p-2 border border-amber-100">
                <p className="text-[10px] font-semibold text-amber-700 mb-1">⚡ Improve</p>
                {strategy.needs_improvement.map((n, i) => <p key={i} className="text-[9px] text-amber-600 mb-0.5">• {n}</p>)}
              </div>
            )}
          </div>

          {/* Campaign Strategies */}
          {strategy.campaign_strategies?.map((s, i) => (
            <div key={i} className="bg-white rounded-lg border p-2.5 hover:border-violet-300 transition-colors">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] font-bold text-slate-800">{s.name}</p>
                <Badge className={`text-[8px] ${prioColors[s.priority]}`}>{s.priority}</Badge>
              </div>
              <p className="text-[9px] text-slate-600 mb-1.5">{s.concept}</p>
              <div className="grid grid-cols-2 gap-1.5 mb-1.5">
                <div className="bg-blue-50 rounded px-2 py-1">
                  <p className="text-[8px] text-blue-400">Target</p>
                  <p className="text-[9px] font-medium text-blue-700">{s.target_audience}</p>
                </div>
                <div className="bg-emerald-50 rounded px-2 py-1">
                  <p className="text-[8px] text-emerald-400">Expected</p>
                  <p className="text-[9px] font-medium text-emerald-700">{s.expected_open_rate}% open · {s.expected_response_rate}% response</p>
                </div>
              </div>
              <div className="flex items-start gap-1 mb-1">
                <Clock className="w-2.5 h-2.5 text-violet-400 mt-0.5 shrink-0" />
                <p className="text-[9px] text-violet-600">{s.why_now}</p>
              </div>
              {s.risks?.length > 0 && (
                <div className="flex items-start gap-1">
                  <AlertTriangle className="w-2.5 h-2.5 text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-[9px] text-amber-600">{s.risks[0]}{s.mitigations?.[0] ? ` → ${s.mitigations[0]}` : ''}</p>
                </div>
              )}
            </div>
          ))}

          {/* Quarterly Calendar */}
          {strategy.quarterly_calendar?.length > 0 && (
            <div className="bg-violet-50 rounded-lg p-2.5 border border-violet-100">
              <p className="text-[10px] font-semibold text-violet-700 mb-1.5">📅 Quarterly Cadence</p>
              {strategy.quarterly_calendar.map((q, i) => (
                <div key={i} className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-[8px] shrink-0 w-14 justify-center">{q.month}</Badge>
                  <div>
                    <span className="text-[9px] font-medium text-violet-800">{q.campaign_type}</span>
                    <span className="text-[9px] text-violet-500"> — {q.focus}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
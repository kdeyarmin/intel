import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, PieChart, DollarSign } from 'lucide-react';

export default function AISegmentationTab({ campaigns = [], providers = [], scores = [], referrals = [], locations = [], taxonomies = [] }) {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);

  const generateSegmentation = async () => {
    setLoading(true);

    const providerSample = providers.slice(0, 100).map(p => ({
      npi: p.npi,
      type: p.entity_type,
      credential: p.credential,
      hasEmail: !!p.email,
      emailValidation: p.email_validation_status,
      state: locations.find(l => l.npi === p.npi && l.is_primary)?.state || '',
      specialty: taxonomies.find(t => t.npi === p.npi && t.primary_flag)?.taxonomy_description || '',
      score: scores.find(s => s.npi === p.npi)?.score || 0,
      referrals: referrals.find(r => r.npi === p.npi)?.total_referrals || 0,
    }));

    const historicalPerf = campaigns.filter(c => c.sent_count > 0).map(c => ({
      source: c.source_criteria,
      openRate: c.sent_count > 0 ? Math.round((c.opened_count / c.sent_count) * 100) : 0,
      responseRate: c.sent_count > 0 ? Math.round((c.responded_count / c.sent_count) * 100) : 0,
    }));

    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a healthcare marketing segmentation expert. Analyze the provider database and historical campaign performance to recommend audience segments and budget allocation.

PROVIDER SAMPLE (${providerSample.length} of ${providers.length} total):
${JSON.stringify(providerSample.slice(0, 50), null, 2)}

HISTORICAL CAMPAIGN PERFORMANCE:
${historicalPerf.length > 0 ? JSON.stringify(historicalPerf, null, 2) : 'No historical data yet.'}

DATABASE STATS:
- Total providers: ${providers.length}
- With email: ${providers.filter(p => p.email).length}
- Validated emails: ${providers.filter(p => p.email_validation_status === 'valid').length}
- Avg lead score: ${scores.length > 0 ? Math.round(scores.reduce((a, s) => a + (s.score || 0), 0) / scores.length) : 'N/A'}

Provide:
1. 4-6 audience segments with clear definitions, estimated size, and expected response rates
2. Budget allocation recommendation across segments (as percentages of total budget)
3. For each segment: recommended messaging approach, frequency, and channel priority
4. A priority matrix: which segments to target first and why
5. Cross-segment strategies (how to leverage segment overlaps)
6. Engagement scoring tiers and re-engagement strategies for cold segments`,
      response_json_schema: {
        type: "object",
        properties: {
          segments: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                definition: { type: "string" },
                estimated_size: { type: "number" },
                estimated_percentage: { type: "number" },
                predicted_open_rate: { type: "number" },
                predicted_response_rate: { type: "number" },
                budget_allocation_pct: { type: "number" },
                messaging_approach: { type: "string" },
                recommended_frequency: { type: "string" },
                priority: { type: "string", enum: ["high", "medium", "low"] }
              }
            }
          },
          priority_matrix: {
            type: "array",
            items: {
              type: "object",
              properties: {
                segment: { type: "string" },
                value: { type: "string", enum: ["high", "medium", "low"] },
                effort: { type: "string", enum: ["high", "medium", "low"] },
                recommendation: { type: "string" }
              }
            }
          },
          cross_segment_strategies: { type: "array", items: { type: "string" } },
          reengagement_tiers: {
            type: "array",
            items: {
              type: "object",
              properties: {
                tier: { type: "string" },
                criteria: { type: "string" },
                strategy: { type: "string" }
              }
            }
          },
          overall_recommendation: { type: "string" }
        }
      }
    });
    setResults(res);
    setLoading(false);
  };

  const prioColors = { high: 'bg-red-100 text-red-700', medium: 'bg-amber-100 text-amber-700', low: 'bg-slate-100 text-slate-600' };
  const valColors = { high: 'text-green-600', medium: 'text-amber-600', low: 'text-slate-400' };

  return (
    <div className="space-y-2">
      <Button size="sm" onClick={generateSegmentation} disabled={loading} className="w-full bg-violet-600 hover:bg-violet-700 h-7 text-xs gap-1">
        {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <PieChart className="w-3 h-3" />}
        {loading ? 'Analyzing Segments...' : 'Generate Segmentation & Budget Plan'}
      </Button>

      {results && (
        <div className="space-y-2.5">
          {/* Overall Recommendation */}
          {results.overall_recommendation && (
            <div className="bg-slate-50 rounded-lg p-2 border">
              <p className="text-[10px] text-slate-700 leading-relaxed">{results.overall_recommendation}</p>
            </div>
          )}

          {/* Segments with Budget */}
          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">Audience Segments & Budget</p>
            {results.segments?.map((s, i) => (
              <div key={i} className="bg-white rounded-lg border p-2.5 mb-1.5 hover:border-violet-300 transition-colors">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <Badge className={`text-[8px] ${prioColors[s.priority]}`}>{s.priority}</Badge>
                    <p className="text-[10px] font-bold text-slate-800">{s.name}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <DollarSign className="w-3 h-3 text-emerald-500" />
                    <span className="text-[10px] font-bold text-emerald-700">{s.budget_allocation_pct}%</span>
                  </div>
                </div>
                <p className="text-[9px] text-slate-500 mb-1.5">{s.definition}</p>
                <div className="grid grid-cols-4 gap-1 mb-1.5">
                  <div className="bg-blue-50 rounded px-1.5 py-0.5 text-center">
                    <p className="text-[8px] text-blue-400">Size</p>
                    <p className="text-[9px] font-bold text-blue-700">{s.estimated_size || '~'}  <span className="font-normal text-[8px]">({s.estimated_percentage}%)</span></p>
                  </div>
                  <div className="bg-emerald-50 rounded px-1.5 py-0.5 text-center">
                    <p className="text-[8px] text-emerald-400">Open</p>
                    <p className="text-[9px] font-bold text-emerald-700">{s.predicted_open_rate}%</p>
                  </div>
                  <div className="bg-violet-50 rounded px-1.5 py-0.5 text-center">
                    <p className="text-[8px] text-violet-400">Response</p>
                    <p className="text-[9px] font-bold text-violet-700">{s.predicted_response_rate}%</p>
                  </div>
                  <div className="bg-amber-50 rounded px-1.5 py-0.5 text-center">
                    <p className="text-[8px] text-amber-400">Frequency</p>
                    <p className="text-[9px] font-bold text-amber-700">{s.recommended_frequency}</p>
                  </div>
                </div>
                <p className="text-[9px] text-slate-500 italic">{s.messaging_approach}</p>
              </div>
            ))}
          </div>

          {/* Budget Allocation Summary Bar */}
          {results.segments?.length > 0 && (
            <div className="bg-emerald-50 rounded-lg p-2 border border-emerald-100">
              <p className="text-[10px] font-semibold text-emerald-700 mb-1.5">💰 Budget Allocation</p>
              <div className="flex h-4 rounded-full overflow-hidden mb-1.5">
                {results.segments.map((s, i) => {
                  const colors = ['bg-violet-500', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-pink-500', 'bg-slate-400'];
                  return (
                    <div key={i} className={`${colors[i % colors.length]} transition-all`}
                      style={{ width: `${s.budget_allocation_pct}%` }}
                      title={`${s.name}: ${s.budget_allocation_pct}%`} />
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                {results.segments.map((s, i) => {
                  const dots = ['bg-violet-500', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-pink-500', 'bg-slate-400'];
                  return (
                    <div key={i} className="flex items-center gap-1">
                      <div className={`w-2 h-2 rounded-full ${dots[i % dots.length]}`} />
                      <span className="text-[8px] text-slate-600">{s.name} ({s.budget_allocation_pct}%)</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Priority Matrix */}
          {results.priority_matrix?.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">Priority Matrix</p>
              <div className="bg-white rounded-lg border overflow-hidden">
                <div className="grid grid-cols-4 gap-0 text-[8px] font-semibold text-slate-400 uppercase bg-slate-50 px-2 py-1.5">
                  <span>Segment</span><span>Value</span><span>Effort</span><span>Action</span>
                </div>
                {results.priority_matrix.map((p, i) => (
                  <div key={i} className="grid grid-cols-4 gap-0 px-2 py-1.5 border-t text-[9px]">
                    <span className="font-medium text-slate-700">{p.segment}</span>
                    <span className={`font-medium ${valColors[p.value]}`}>{p.value}</span>
                    <span className="text-slate-500">{p.effort}</span>
                    <span className="text-slate-600">{p.recommendation}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cross-Segment Strategies */}
          {results.cross_segment_strategies?.length > 0 && (
            <div className="bg-blue-50 rounded-lg p-2 border border-blue-100">
              <p className="text-[10px] font-semibold text-blue-700 mb-1">🔗 Cross-Segment Strategies</p>
              {results.cross_segment_strategies.map((s, i) => (
                <p key={i} className="text-[9px] text-blue-600 mb-0.5">• {s}</p>
              ))}
            </div>
          )}

          {/* Re-engagement Tiers */}
          {results.reengagement_tiers?.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">Re-engagement Tiers</p>
              {results.reengagement_tiers.map((t, i) => (
                <div key={i} className="flex items-start gap-2 mb-1.5">
                  <Badge variant="outline" className="text-[8px] shrink-0 mt-0.5">{t.tier}</Badge>
                  <div>
                    <p className="text-[9px] text-slate-600">{t.criteria}</p>
                    <p className="text-[9px] text-violet-600 font-medium">{t.strategy}</p>
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
import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Sparkles, TrendingUp, TrendingDown, Minus, Target, Clock, Mail, X } from 'lucide-react';

export default function CampaignPerformanceAnalysis({ campaign, messages = [], onClose }) {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);

  const statusCounts = messages.reduce((acc, m) => {
    acc[m.status] = (acc[m.status] || 0) + 1;
    return acc;
  }, {});

  const openRate = campaign.sent_count > 0 ? ((campaign.opened_count / campaign.sent_count) * 100).toFixed(1) : 0;
  const responseRate = campaign.sent_count > 0 ? ((campaign.responded_count / campaign.sent_count) * 100).toFixed(1) : 0;
  const bounceRate = campaign.sent_count > 0 ? ((campaign.bounced_count / campaign.sent_count) * 100).toFixed(1) : 0;

  const runAnalysis = async () => {
    setLoading(true);

    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `Analyze the performance of this completed healthcare provider outreach campaign and provide actionable insights.

CAMPAIGN DETAILS:
- Name: ${campaign.name}
- Description: ${campaign.description || 'N/A'}
- Source Criteria: ${campaign.source_criteria || 'N/A'}
- Subject Template: ${campaign.subject_template || 'N/A'}
- Total Recipients: ${campaign.total_recipients || 0}

PERFORMANCE METRICS:
- Sent: ${campaign.sent_count || 0}
- Opened: ${campaign.opened_count || 0} (${openRate}%)
- Responded: ${campaign.responded_count || 0} (${responseRate}%)
- Bounced: ${campaign.bounced_count || 0} (${bounceRate}%)

MESSAGE STATUS BREAKDOWN:
${Object.entries(statusCounts).map(([s, c]) => `- ${s}: ${c}`).join('\n')}

INDUSTRY BENCHMARKS (Healthcare B2B Email):
- Average open rate: 20-25%
- Average response rate: 3-8%
- Average bounce rate: 2-5%

Provide a thorough analysis including:
1. Overall performance verdict (success/moderate/underperforming) with reasoning
2. Specific strengths of this campaign
3. Specific weaknesses or missed opportunities
4. Why the open rate was ${Number(openRate) > 25 ? 'above' : Number(openRate) > 15 ? 'around' : 'below'} average
5. Subject line assessment and 3 improved alternatives
6. Best send time recommendations for healthcare providers
7. Targeting refinements (who to include/exclude next time)
8. Content/messaging improvements
9. A concrete action plan for the next campaign`,
      response_json_schema: {
        type: "object",
        properties: {
          verdict: { type: "string", enum: ["success", "moderate", "underperforming"] },
          verdict_summary: { type: "string" },
          performance_score: { type: "number" },
          strengths: { type: "array", items: { type: "string" } },
          weaknesses: { type: "array", items: { type: "string" } },
          open_rate_analysis: { type: "string" },
          response_rate_analysis: { type: "string" },
          subject_line_assessment: { type: "string" },
          improved_subject_lines: { type: "array", items: { type: "string" } },
          send_time_recommendations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                time_window: { type: "string" },
                reasoning: { type: "string" }
              }
            }
          },
          targeting_refinements: { type: "array", items: { type: "string" } },
          content_improvements: { type: "array", items: { type: "string" } },
          action_plan: {
            type: "array",
            items: {
              type: "object",
              properties: {
                step: { type: "string" },
                priority: { type: "string", enum: ["high", "medium", "low"] },
                expected_impact: { type: "string" }
              }
            }
          }
        }
      }
    });

    setAnalysis(res);
    setLoading(false);
  };

  const verdictConfig = {
    success: { color: 'bg-green-100 text-green-800 border-green-200', icon: TrendingUp, label: 'Strong Performance' },
    moderate: { color: 'bg-amber-100 text-amber-800 border-amber-200', icon: Minus, label: 'Moderate Performance' },
    underperforming: { color: 'bg-red-100 text-red-800 border-red-200', icon: TrendingDown, label: 'Underperforming' },
  };

  const priorityColors = { high: 'bg-red-100 text-red-700', medium: 'bg-amber-100 text-amber-700', low: 'bg-slate-100 text-slate-600' };

  return (
    <Card className="border-violet-200">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-500" />
            AI Performance Analysis
          </CardTitle>
          {onClose && (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
              <X className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Quick metrics */}
        <div className="grid grid-cols-4 gap-2">
          <div className="text-center p-2 rounded-lg bg-blue-50">
            <p className="text-lg font-bold text-blue-700">{campaign.sent_count || 0}</p>
            <p className="text-[9px] text-blue-500">Sent</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-emerald-50">
            <p className="text-lg font-bold text-emerald-700">{openRate}%</p>
            <p className="text-[9px] text-emerald-500">Open Rate</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-violet-50">
            <p className="text-lg font-bold text-violet-700">{responseRate}%</p>
            <p className="text-[9px] text-violet-500">Response Rate</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-red-50">
            <p className="text-lg font-bold text-red-700">{bounceRate}%</p>
            <p className="text-[9px] text-red-500">Bounce Rate</p>
          </div>
        </div>

        {!analysis && (
          <Button size="sm" onClick={runAnalysis} disabled={loading}
            className="w-full bg-violet-600 hover:bg-violet-700 h-8 text-xs gap-1">
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            {loading ? 'Analyzing...' : 'Analyze Campaign Performance'}
          </Button>
        )}

        {analysis && (
          <div className="space-y-3">
            {/* Verdict */}
            {analysis.verdict && (() => {
              const v = verdictConfig[analysis.verdict] || verdictConfig.moderate;
              const Icon = v.icon;
              return (
                <div className={`rounded-lg p-3 border ${v.color}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="w-4 h-4" />
                    <span className="text-sm font-semibold">{v.label}</span>
                    {analysis.performance_score && (
                      <Badge className="bg-white/50 text-[10px]">{analysis.performance_score}/100</Badge>
                    )}
                  </div>
                  <p className="text-xs leading-relaxed">{analysis.verdict_summary}</p>
                </div>
              );
            })()}

            {/* Strengths & Weaknesses */}
            <div className="grid grid-cols-2 gap-2">
              {analysis.strengths?.length > 0 && (
                <div className="bg-green-50 rounded-lg p-2 border border-green-100">
                  <p className="text-[10px] font-semibold text-green-700 mb-1">✓ Strengths</p>
                  {analysis.strengths.map((s, i) => <p key={i} className="text-[9px] text-green-600 mb-0.5">• {s}</p>)}
                </div>
              )}
              {analysis.weaknesses?.length > 0 && (
                <div className="bg-red-50 rounded-lg p-2 border border-red-100">
                  <p className="text-[10px] font-semibold text-red-700 mb-1">✗ Weaknesses</p>
                  {analysis.weaknesses.map((w, i) => <p key={i} className="text-[9px] text-red-600 mb-0.5">• {w}</p>)}
                </div>
              )}
            </div>

            {/* Rate Analysis */}
            {analysis.open_rate_analysis && (
              <div className="bg-slate-50 rounded-lg p-2">
                <p className="text-[10px] font-medium text-slate-500 mb-0.5">Open Rate Analysis</p>
                <p className="text-[10px] text-slate-700 leading-relaxed">{analysis.open_rate_analysis}</p>
              </div>
            )}

            {/* Improved Subject Lines */}
            {analysis.improved_subject_lines?.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-slate-400 uppercase mb-1">
                  <Mail className="w-3 h-3 inline mr-1" />Improved Subject Lines
                </p>
                {analysis.improved_subject_lines.map((sl, i) => (
                  <div key={i} className="bg-white border rounded-lg px-2.5 py-1.5 mb-1 hover:border-violet-300">
                    <p className="text-[10px] text-slate-800">"{sl}"</p>
                  </div>
                ))}
              </div>
            )}

            {/* Send Time Recommendations */}
            {analysis.send_time_recommendations?.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-slate-400 uppercase mb-1">
                  <Clock className="w-3 h-3 inline mr-1" />Best Send Times
                </p>
                {analysis.send_time_recommendations.map((st, i) => (
                  <div key={i} className="flex items-start gap-2 mb-1">
                    <Badge className="bg-blue-100 text-blue-700 text-[8px] shrink-0 mt-0.5">{st.time_window}</Badge>
                    <p className="text-[9px] text-slate-600">{st.reasoning}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Targeting Refinements */}
            {analysis.targeting_refinements?.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-slate-400 uppercase mb-1">
                  <Target className="w-3 h-3 inline mr-1" />Targeting Refinements
                </p>
                {analysis.targeting_refinements.map((t, i) => (
                  <p key={i} className="text-[9px] text-slate-600 mb-0.5">• {t}</p>
                ))}
              </div>
            )}

            {/* Action Plan */}
            {analysis.action_plan?.length > 0 && (
              <div className="bg-violet-50 rounded-lg p-2 border border-violet-100">
                <p className="text-[10px] font-semibold text-violet-700 mb-1.5">Action Plan</p>
                {analysis.action_plan.map((a, i) => (
                  <div key={i} className="flex items-start gap-2 mb-1.5">
                    <Badge className={`text-[8px] shrink-0 mt-0.5 ${priorityColors[a.priority] || priorityColors.medium}`}>
                      {a.priority}
                    </Badge>
                    <div>
                      <p className="text-[10px] font-medium text-violet-800">{a.step}</p>
                      <p className="text-[9px] text-violet-500">{a.expected_impact}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Button size="sm" onClick={runAnalysis} disabled={loading} variant="outline"
              className="w-full h-7 text-xs gap-1">
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              Re-Analyze
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
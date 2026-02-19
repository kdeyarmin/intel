import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { base44 } from '@/api/base44Client';
import { BarChart3, Loader2, Sparkles } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export default function CampaignPredictionWidget({ campaigns = [] }) {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  const activeCampaigns = campaigns.filter(c => c.sent_count > 0);

  const chartData = activeCampaigns.slice(0, 8).map(c => ({
    name: c.name.length > 12 ? c.name.slice(0, 10) + '…' : c.name,
    'Open %': c.sent_count > 0 ? Math.round((c.opened_count / c.sent_count) * 100) : 0,
    'Response %': c.sent_count > 0 ? Math.round((c.responded_count / c.sent_count) * 100) : 0,
    'Bounce %': c.sent_count > 0 ? Math.round((c.bounced_count / c.sent_count) * 100) : 0,
  }));

  const predict = async () => {
    setLoading(true);
    const historical = activeCampaigns.map(c => ({
      name: c.name,
      sent: c.sent_count,
      opened: c.opened_count,
      responded: c.responded_count,
      bounced: c.bounced_count,
      source: c.source_criteria,
    }));

    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `Analyze these outreach campaign results and provide performance predictions and optimization recommendations.

HISTORICAL CAMPAIGNS:
${JSON.stringify(historical, null, 2)}

Provide:
1. Overall campaign health assessment
2. Performance trend analysis
3. Predicted performance for next campaign
4. Top 3 optimization recommendations
5. Best performing campaign pattern identified`,
      response_json_schema: {
        type: "object",
        properties: {
          health_assessment: { type: "string" },
          trend_direction: { type: "string", enum: ["improving", "stable", "declining"] },
          predicted_next_open_rate: { type: "number" },
          predicted_next_response_rate: { type: "number" },
          best_pattern: { type: "string" },
          recommendations: { type: "array", items: { type: "string" } },
          insights: { type: "array", items: { type: "object", properties: { metric: { type: "string" }, value: { type: "string" }, trend: { type: "string" } } } }
        }
      }
    });
    setResults(res);
    setLoading(false);
  };

  const trendColors = { improving: 'bg-emerald-100 text-emerald-700', stable: 'bg-blue-100 text-blue-700', declining: 'bg-red-100 text-red-700' };

  return (
    <Card className="h-full">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-violet-500" /> Campaign Performance
        </CardTitle>
        <Button size="sm" onClick={predict} disabled={loading || activeCampaigns.length === 0} className="bg-violet-600 hover:bg-violet-700 h-7 text-xs gap-1">
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          {loading ? 'Predicting...' : 'AI Predict'}
        </Button>
      </CardHeader>
      <CardContent>
        {activeCampaigns.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-8">Send campaigns first to see performance predictions</p>
        ) : (
          <div className="space-y-4">
            {/* Chart */}
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 9 }} unit="%" />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="Open %" fill="#10b981" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="Response %" fill="#8b5cf6" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="Bounce %" fill="#ef4444" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {loading && <div className="space-y-2">{[1,2].map(i => <Skeleton key={i} className="h-12" />)}</div>}

            {results && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge className={`text-[10px] ${trendColors[results.trend_direction] || trendColors.stable}`}>
                    Trend: {results.trend_direction}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">Next open: ~{results.predicted_next_open_rate}%</Badge>
                  <Badge variant="outline" className="text-[10px]">Next response: ~{results.predicted_next_response_rate}%</Badge>
                </div>
                <p className="text-xs text-slate-600 bg-violet-50 rounded-lg px-3 py-2 leading-relaxed border border-violet-100">{results.health_assessment}</p>
                {results.best_pattern && (
                  <p className="text-[10px] text-violet-600 italic">🏆 Best pattern: {results.best_pattern}</p>
                )}
                {results.recommendations?.length > 0 && (
                  <div className="bg-amber-50 rounded-lg p-2.5 border border-amber-100">
                    <p className="text-[10px] font-medium text-amber-700 mb-1">Recommendations</p>
                    {results.recommendations.map((r, i) => <p key={i} className="text-[10px] text-amber-600">• {r}</p>)}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
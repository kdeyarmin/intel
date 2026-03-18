import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles, TrendingUp, Clock, Target } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from 'recharts';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = ['6am', '7am', '8am', '9am', '10am', '11am', '12pm', '1pm', '2pm', '3pm', '4pm', '5pm', '6pm', '7pm'];

export default function CampaignPredictiveAnalytics({ campaigns = [], providers = [], scores = [], referrals = [] }) {
  const [loading, setLoading] = useState(false);
  const [prediction, setPrediction] = useState(null);

  const historicalStats = useMemo(() => {
    const completed = campaigns.filter(c => c.sent_count > 0);
    if (completed.length === 0) return null;
    const avgOpen = completed.reduce((s, c) => s + (c.sent_count > 0 ? c.opened_count / c.sent_count : 0), 0) / completed.length * 100;
    const avgResp = completed.reduce((s, c) => s + (c.sent_count > 0 ? c.responded_count / c.sent_count : 0), 0) / completed.length * 100;
    const avgBounce = completed.reduce((s, c) => s + (c.sent_count > 0 ? c.bounced_count / c.sent_count : 0), 0) / completed.length * 100;
    const trend = completed.map(c => ({
      name: c.name.length > 12 ? c.name.slice(0, 10) + '…' : c.name,
      open: c.sent_count > 0 ? Math.round(c.opened_count / c.sent_count * 100) : 0,
      response: c.sent_count > 0 ? Math.round(c.responded_count / c.sent_count * 100) : 0,
    }));
    return { avgOpen: avgOpen.toFixed(1), avgResp: avgResp.toFixed(1), avgBounce: avgBounce.toFixed(1), count: completed.length, trend };
  }, [campaigns]);

  const runPrediction = async () => {
    setLoading(true);
    const historical = campaigns.filter(c => c.sent_count > 0).map(c => ({
      name: c.name, sent: c.sent_count, opened: c.opened_count, responded: c.responded_count,
      bounced: c.bounced_count, source: c.source_criteria, date: c.created_date,
    }));

    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a healthcare marketing analytics expert. Analyze campaign history and predict optimal strategies.

HISTORICAL CAMPAIGNS (${historical.length}):
${JSON.stringify(historical, null, 2)}

DATABASE: ${providers.length} providers, ${scores.length} scored

Provide:
1. Predicted success rate for the NEXT campaign based on trends
2. Optimal send time (day of week + hour) with healthcare B2B benchmarks
3. A send-time heatmap: for each day (Mon-Sat) and each time slot (morning/afternoon/evening), rate effectiveness 0-100
4. Forecast for next 3 campaigns if you maintain current trajectory
5. Key factors affecting performance and what to improve
6. Recommended audience segments to target next`,
      response_json_schema: {
        type: "object",
        properties: {
          next_campaign_prediction: {
            type: "object",
            properties: {
              predicted_open_rate: { type: "number" },
              predicted_response_rate: { type: "number" },
              confidence: { type: "string" },
              reasoning: { type: "string" }
            }
          },
          optimal_send_time: {
            type: "object",
            properties: {
              best_day: { type: "string" },
              best_hour: { type: "string" },
              worst_day: { type: "string" },
              reasoning: { type: "string" }
            }
          },
          send_time_heatmap: {
            type: "array",
            items: {
              type: "object",
              properties: {
                day: { type: "string" },
                morning: { type: "number" },
                afternoon: { type: "number" },
                evening: { type: "number" }
              }
            }
          },
          forecast: {
            type: "array",
            items: {
              type: "object",
              properties: {
                campaign_number: { type: "number" },
                predicted_open_rate: { type: "number" },
                predicted_response_rate: { type: "number" },
                recommendation: { type: "string" }
              }
            }
          },
          improvement_factors: { type: "array", items: { type: "string" } },
          recommended_segments: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                description: { type: "string" },
                expected_lift: { type: "string" }
              }
            }
          }
        }
      }
    });
    setPrediction(res);
    setLoading(false);
  };

  const tooltipStyle = { background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 11, color: '#e2e8f0' };

  return (
    <div className="space-y-4">
      {/* Historical stats */}
      {historicalStats && (
        <div className="grid grid-cols-3 gap-3">
          <Card><CardContent className="p-3 text-center">
            <p className="text-lg font-bold text-emerald-600">{historicalStats.avgOpen}%</p>
            <p className="text-[10px] text-slate-500">Avg Open Rate</p>
          </CardContent></Card>
          <Card><CardContent className="p-3 text-center">
            <p className="text-lg font-bold text-violet-600">{historicalStats.avgResp}%</p>
            <p className="text-[10px] text-slate-500">Avg Response Rate</p>
          </CardContent></Card>
          <Card><CardContent className="p-3 text-center">
            <p className="text-lg font-bold text-slate-700">{historicalStats.count}</p>
            <p className="text-[10px] text-slate-500">Campaigns Run</p>
          </CardContent></Card>
        </div>
      )}

      {historicalStats?.trend?.length > 1 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">Performance Trend</CardTitle></CardHeader>
          <CardContent>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={historicalStats.trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 9 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="open" stroke="#10b981" strokeWidth={2} name="Open %" />
                  <Line type="monotone" dataKey="response" stroke="#8b5cf6" strokeWidth={2} name="Response %" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      <Button onClick={runPrediction} disabled={loading} className="w-full bg-violet-600 hover:bg-violet-700 gap-2">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        {loading ? 'Predicting...' : 'Run AI Predictive Analysis'}
      </Button>

      {prediction && (
        <div className="space-y-4">
          {/* Next campaign prediction */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="w-4 h-4 text-emerald-500" /> Next Campaign Forecast</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="bg-emerald-50 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-emerald-700">{prediction.next_campaign_prediction?.predicted_open_rate}%</p>
                  <p className="text-[10px] text-emerald-600">Predicted Open Rate</p>
                </div>
                <div className="bg-violet-50 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-violet-700">{prediction.next_campaign_prediction?.predicted_response_rate}%</p>
                  <p className="text-[10px] text-violet-600">Predicted Response Rate</p>
                </div>
              </div>
              <p className="text-[10px] text-slate-500">{prediction.next_campaign_prediction?.reasoning}</p>
            </CardContent>
          </Card>

          {/* Send time heatmap */}
          {prediction.send_time_heatmap?.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Clock className="w-4 h-4 text-amber-500" /> Optimal Send Times</CardTitle></CardHeader>
              <CardContent>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={prediction.send_time_heatmap}>
                      <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="morning" fill="#fbbf24" name="Morning" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="afternoon" fill="#10b981" name="Afternoon" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="evening" fill="#6366f1" name="Evening" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 bg-emerald-50 rounded-lg p-2 border border-emerald-100">
                  <p className="text-[10px] text-emerald-700"><span className="font-medium">Best:</span> {prediction.optimal_send_time?.best_day} {prediction.optimal_send_time?.best_hour}</p>
                  <p className="text-[10px] text-red-600"><span className="font-medium">Avoid:</span> {prediction.optimal_send_time?.worst_day}</p>
                  <p className="text-[9px] text-slate-500 mt-0.5">{prediction.optimal_send_time?.reasoning}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recommended segments */}
          {prediction.recommended_segments?.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Target className="w-4 h-4 text-cyan-500" /> Recommended Segments</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {prediction.recommended_segments.map((seg, i) => (
                  <div key={i} className="border rounded-lg p-2.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-slate-700">{seg.name}</p>
                      <Badge className="bg-emerald-100 text-emerald-700 text-[9px]">{seg.expected_lift}</Badge>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">{seg.description}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Improvement factors */}
          {prediction.improvement_factors?.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">Improvement Factors</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-1">
                  {prediction.improvement_factors.map((f, i) => (
                    <li key={i} className="text-[10px] text-slate-600 pl-3 relative before:content-['→'] before:absolute before:left-0 before:text-violet-400">{f}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
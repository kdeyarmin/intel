import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles, ShieldAlert, TrendingDown, AlertTriangle, CheckCircle2, Clock, Activity } from 'lucide-react';

const SEVERITY_STYLES = {
  critical: 'bg-red-500/15 text-red-400 border-red-500/30',
  high: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  medium: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  low: 'bg-slate-700/50 text-slate-400 border-slate-600',
};

export default function ProactiveDQAlerts() {
  const [loading, setLoading] = useState(false);
  const [predictions, setPredictions] = useState(null);

  const { data: scans = [] } = useQuery({
    queryKey: ['dqScans'],
    queryFn: () => base44.entities.DataQualityScan.list('-created_date', 20),
    staleTime: 30000,
  });

  const { data: alerts = [] } = useQuery({
    queryKey: ['dqAlerts'],
    queryFn: () => base44.entities.DataQualityAlert.list('-created_date', 200),
    staleTime: 30000,
  });

  const { data: batches = [] } = useQuery({
    queryKey: ['dqBatches'],
    queryFn: () => base44.entities.ImportBatch.list('-created_date', 50),
    staleTime: 60000,
  });

  const runPrediction = async () => {
    setLoading(true);

    const scanHistory = scans.slice(0, 10).map(s => ({
      date: s.created_date,
      scores: s.scores,
      alertCount: s.alert_count || 0,
    }));

    const alertBreakdown = {
      open: alerts.filter(a => a.status === 'open').length,
      critical: alerts.filter(a => a.severity === 'critical').length,
      high: alerts.filter(a => a.severity === 'high').length,
      byCategory: {},
    };
    alerts.filter(a => a.status === 'open').forEach(a => {
      const cat = a.category || 'other';
      alertBreakdown.byCategory[cat] = (alertBreakdown.byCategory[cat] || 0) + 1;
    });

    const recentImports = batches.slice(0, 10).map(b => ({
      type: b.import_type, status: b.status, date: b.created_date,
      rows: b.total_rows, invalid: b.invalid_rows, errors: b.error_samples?.length || 0,
    }));

    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a healthcare data quality prediction expert. Analyze scan history, alert patterns, and import trends to predict upcoming data quality issues BEFORE they happen.

SCAN HISTORY (most recent first):
${JSON.stringify(scanHistory, null, 2)}

CURRENT ALERT BREAKDOWN:
${JSON.stringify(alertBreakdown, null, 2)}

RECENT IMPORTS:
${JSON.stringify(recentImports, null, 2)}

Based on patterns and trends, predict:
1. Which data quality dimensions are likely to degrade in the next 1-2 weeks
2. Specific upcoming issues based on import patterns and error trends
3. Preventative actions to take NOW to avoid degradation
4. Risk assessment for each data domain (providers, locations, referrals, utilization)

Be specific and actionable. Reference actual numbers from the data.`,
      response_json_schema: {
        type: "object",
        properties: {
          overall_risk: { type: "string", enum: ["low", "medium", "high", "critical"] },
          risk_trend: { type: "string", enum: ["improving", "stable", "degrading"] },
          predicted_alerts: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
                domain: { type: "string" },
                predicted_timeframe: { type: "string" },
                evidence: { type: "string" },
                preventative_action: { type: "string" }
              }
            }
          },
          domain_risk: {
            type: "array",
            items: {
              type: "object",
              properties: {
                domain: { type: "string" },
                current_health: { type: "number" },
                predicted_health: { type: "number" },
                risk_factors: { type: "array", items: { type: "string" } }
              }
            }
          },
          immediate_actions: { type: "array", items: { type: "string" } },
          summary: { type: "string" }
        }
      }
    });

    setPredictions(res);
    setLoading(false);
  };

  const RISK_COLORS = { low: 'text-emerald-400', medium: 'text-amber-400', high: 'text-orange-400', critical: 'text-red-400' };
  const TREND_ICONS = { improving: '↑', stable: '→', degrading: '↓' };
  const TREND_COLORS = { improving: 'text-emerald-400', stable: 'text-slate-400', degrading: 'text-red-400' };

  return (
    <div className="space-y-4">
      <Card className="bg-[#141d30] border-slate-700/50">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-400" />
              Proactive Quality Predictions
            </CardTitle>
            <Button size="sm" onClick={runPrediction} disabled={loading}
              className="h-8 text-xs gap-1.5 bg-amber-600 hover:bg-amber-700">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {loading ? 'Analyzing...' : 'Predict Issues'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!predictions && !loading && (
            <p className="text-sm text-slate-400 text-center py-6">
              Analyze historical scan patterns and import trends to predict upcoming data quality issues before they occur.
            </p>
          )}

          {loading && (
            <div className="text-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-amber-400 mx-auto mb-2" />
              <p className="text-sm text-slate-400">Analyzing patterns across {scans.length} scans and {alerts.length} alerts...</p>
            </div>
          )}

          {predictions && !loading && (
            <div className="space-y-4">
              {/* Risk overview */}
              <div className="flex items-center gap-4 bg-slate-800/40 rounded-lg p-3">
                <div className="text-center">
                  <p className={`text-2xl font-bold ${RISK_COLORS[predictions.overall_risk]}`}>
                    {predictions.overall_risk?.toUpperCase()}
                  </p>
                  <p className="text-[10px] text-slate-500">Overall Risk</p>
                </div>
                <div className="text-center">
                  <p className={`text-xl font-bold ${TREND_COLORS[predictions.risk_trend]}`}>
                    {TREND_ICONS[predictions.risk_trend]} {predictions.risk_trend}
                  </p>
                  <p className="text-[10px] text-slate-500">Trend</p>
                </div>
                <p className="text-xs text-slate-400 flex-1">{predictions.summary}</p>
              </div>

              {/* Domain health */}
              {predictions.domain_risk?.length > 0 && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                  {predictions.domain_risk.map((d, i) => {
                    const delta = d.predicted_health - d.current_health;
                    return (
                      <div key={i} className="border border-slate-700/30 rounded-lg p-2.5">
                        <p className="text-xs font-medium text-slate-200 mb-1">{d.domain}</p>
                        <div className="flex items-baseline gap-2">
                          <span className="text-lg font-bold text-white">{d.current_health}</span>
                          <span className={`text-sm font-bold ${delta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            → {d.predicted_health}
                          </span>
                        </div>
                        {d.risk_factors?.length > 0 && (
                          <p className="text-[10px] text-slate-500 mt-1 line-clamp-2">{d.risk_factors[0]}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Predicted alerts */}
              {predictions.predicted_alerts?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Predicted Issues</p>
                  {predictions.predicted_alerts.map((alert, i) => (
                    <div key={i} className={`border rounded-lg p-3 ${SEVERITY_STYLES[alert.severity]}`}>
                      <div className="flex items-start justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span className="text-sm font-medium">{alert.title}</span>
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          <Badge className="bg-slate-800/60 text-slate-300 text-[9px]">{alert.domain}</Badge>
                          <Badge className="bg-slate-800/60 text-slate-300 text-[9px]">
                            <Clock className="w-2.5 h-2.5 mr-0.5" />{alert.predicted_timeframe}
                          </Badge>
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-300 ml-5 mb-1">{alert.evidence}</p>
                      <div className="ml-5 bg-emerald-500/10 rounded px-2 py-1 mt-1.5">
                        <p className="text-[10px] text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> {alert.preventative_action}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Immediate actions */}
              {predictions.immediate_actions?.length > 0 && (
                <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-lg p-3">
                  <p className="text-xs font-medium text-cyan-400 mb-2 flex items-center gap-1">
                    <Activity className="w-3.5 h-3.5" /> Recommended Immediate Actions
                  </p>
                  <ul className="space-y-1">
                    {predictions.immediate_actions.map((a, i) => (
                      <li key={i} className="text-sm text-slate-300 pl-3 relative before:content-['→'] before:absolute before:left-0 before:text-cyan-400">
                        {a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
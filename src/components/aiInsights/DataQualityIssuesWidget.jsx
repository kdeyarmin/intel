import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { base44 } from '@/api/base44Client';
import { ShieldAlert, Loader2, Sparkles, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const ISSUE_COLORS = {
  missing_data: '#f59e0b',
  inconsistency: '#ef4444',
  stale_data: '#6366f1',
  duplicate: '#ec4899',
  enrichment_needed: '#3b82f6',
};

const SEV_COLORS = { critical: 'bg-red-100 text-red-700', warning: 'bg-amber-100 text-amber-700', info: 'bg-blue-100 text-blue-700' };

export default function DataQualityIssuesWidget({ providers = [], locations = [], taxonomies = [], referrals = [], utilizations = [] }) {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  // Pre-compute data quality stats
  const stats = useMemo(() => {
    const noLocation = providers.filter(p => !locations.some(l => l.npi === p.npi)).length;
    const noTaxonomy = providers.filter(p => !taxonomies.some(t => t.npi === p.npi)).length;
    const needsEnrich = providers.filter(p => p.needs_nppes_enrichment).length;
    const deactivated = providers.filter(p => p.status === 'Deactivated').length;
    const noName = providers.filter(p =>
      p.entity_type === 'Individual' ? (!p.first_name && !p.last_name) : !p.organization_name
    ).length;
    const noEmail = providers.filter(p => !p.email).length;
    const noRef = providers.filter(p => !referrals.some(r => r.npi === p.npi)).length;
    const noUtil = providers.filter(p => !utilizations.some(u => u.npi === p.npi)).length;
    const total = providers.length;

    return { noLocation, noTaxonomy, needsEnrich, deactivated, noName, noEmail, noRef, noUtil, total };
  }, [providers, locations, taxonomies, referrals, utilizations]);

  const pieData = [
    { name: 'Missing Location', value: stats.noLocation, color: ISSUE_COLORS.missing_data },
    { name: 'Missing Specialty', value: stats.noTaxonomy, color: ISSUE_COLORS.inconsistency },
    { name: 'Needs Enrichment', value: stats.needsEnrich, color: ISSUE_COLORS.enrichment_needed },
    { name: 'Missing Email', value: stats.noEmail, color: ISSUE_COLORS.stale_data },
  ].filter(d => d.value > 0);

  const completenessScore = stats.total > 0
    ? Math.round(((stats.total - stats.noLocation) / stats.total * 25) +
                  ((stats.total - stats.noTaxonomy) / stats.total * 25) +
                  ((stats.total - stats.needsEnrich) / stats.total * 25) +
                  ((stats.total - stats.noName) / stats.total * 25))
    : 0;

  const analyze = async () => {
    setLoading(true);

    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a healthcare data quality analyst. Analyze this provider database and identify data quality issues, risks, and remediation priorities.

DATABASE STATS (${stats.total} total providers):
- Missing location data: ${stats.noLocation} providers (${Math.round(stats.noLocation/Math.max(stats.total,1)*100)}%)
- Missing taxonomy/specialty: ${stats.noTaxonomy} providers (${Math.round(stats.noTaxonomy/Math.max(stats.total,1)*100)}%)
- Needs NPPES enrichment: ${stats.needsEnrich} providers (${Math.round(stats.needsEnrich/Math.max(stats.total,1)*100)}%)
- Deactivated providers: ${stats.deactivated} providers (${Math.round(stats.deactivated/Math.max(stats.total,1)*100)}%)
- Missing names: ${stats.noName} providers
- Missing email: ${stats.noEmail} providers (${Math.round(stats.noEmail/Math.max(stats.total,1)*100)}%)
- No referral data: ${stats.noRef} providers (${Math.round(stats.noRef/Math.max(stats.total,1)*100)}%)
- No utilization data: ${stats.noUtil} providers (${Math.round(stats.noUtil/Math.max(stats.total,1)*100)}%)
- Completeness score: ${completenessScore}/100

Provide:
1. Overall data health assessment
2. Top 5 specific data quality issues ranked by impact on sales operations
3. Prioritized remediation plan with effort estimates
4. Downstream risks if issues are not addressed`,
      response_json_schema: {
        type: "object",
        properties: {
          health_grade: { type: "string" },
          health_summary: { type: "string" },
          issues: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                description: { type: "string" },
                affected_count: { type: "number" },
                severity: { type: "string", enum: ["critical", "warning", "info"] },
                impact: { type: "string" },
                remediation: { type: "string" },
                effort: { type: "string", enum: ["low", "medium", "high"] },
              }
            }
          },
          risks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                risk: { type: "string" },
                likelihood: { type: "string", enum: ["high", "medium", "low"] },
                mitigation: { type: "string" },
              }
            }
          },
        }
      }
    });
    setResults(res);
    setLoading(false);
  };

  const gradeColor = (g) => {
    if (!g) return 'text-slate-500';
    const c = g.charAt(0).toUpperCase();
    if (c === 'A') return 'text-emerald-600';
    if (c === 'B') return 'text-blue-600';
    if (c === 'C') return 'text-amber-600';
    return 'text-red-600';
  };

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-500" /> Data Quality Analysis
          <Badge variant="outline" className="text-[10px] ml-1">{completenessScore}% complete</Badge>
        </CardTitle>
        <Button size="sm" onClick={analyze} disabled={loading || stats.total === 0} className="bg-amber-600 hover:bg-amber-700 h-7 text-xs gap-1">
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          {loading ? 'Scanning...' : results ? 'Rescan' : 'Detect Issues'}
        </Button>
      </CardHeader>
      <CardContent>
        {stats.total === 0 && <p className="text-xs text-slate-400 text-center py-8">Import provider data to analyze quality</p>}

        {stats.total > 0 && !results && !loading && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={30} outerRadius={60}
                        label={({ name, value }) => `${value}`} labelLine={false}>
                        {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                      </Pie>
                      <Tooltip formatter={(v, n) => [`${v} providers`, n]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="space-y-2 flex flex-col justify-center">
                {[
                  { label: 'Missing Location', count: stats.noLocation, icon: XCircle, color: 'text-amber-500' },
                  { label: 'Missing Specialty', count: stats.noTaxonomy, icon: AlertCircle, color: 'text-red-500' },
                  { label: 'Needs Enrichment', count: stats.needsEnrich, icon: AlertCircle, color: 'text-blue-500' },
                  { label: 'No Email', count: stats.noEmail, icon: XCircle, color: 'text-indigo-500' },
                ].map(item => {
                  const Icon = item.icon;
                  return (
                    <div key={item.label} className="flex items-center gap-2">
                      <Icon className={`w-3 h-3 ${item.color}`} />
                      <span className="text-[11px] text-slate-600 flex-1">{item.label}</span>
                      <span className="text-[11px] font-bold text-slate-700">{item.count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <p className="text-xs text-slate-400 text-center">Click "Detect Issues" for AI-powered quality analysis and remediation plan</p>
          </div>
        )}

        {loading && <div className="space-y-2">{[1,2,3,4].map(i => <Skeleton key={i} className="h-16" />)}</div>}

        {results && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 bg-slate-50 rounded-lg p-3 border">
              <div className={`text-3xl font-black ${gradeColor(results.health_grade)}`}>{results.health_grade}</div>
              <p className="text-xs text-slate-600 leading-relaxed flex-1">{results.health_summary}</p>
            </div>

            <div className="space-y-2">
              {results.issues?.map((issue, i) => (
                <div key={i} className="border rounded-lg p-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      {issue.severity === 'critical' ? <XCircle className="w-3.5 h-3.5 text-red-500" /> :
                       issue.severity === 'warning' ? <AlertCircle className="w-3.5 h-3.5 text-amber-500" /> :
                       <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />}
                      <span className="text-xs font-semibold text-slate-800">{issue.title}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge className={`text-[8px] ${SEV_COLORS[issue.severity]}`}>{issue.severity}</Badge>
                      <Badge variant="outline" className="text-[8px]">{issue.affected_count} affected</Badge>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500 mb-1">{issue.description}</p>
                  <p className="text-[10px] text-slate-500"><strong className="text-slate-600">Impact:</strong> {issue.impact}</p>
                  <p className="text-[10px] text-blue-600 mt-1">Fix: {issue.remediation} <Badge variant="outline" className="text-[8px] ml-1">{issue.effort} effort</Badge></p>
                </div>
              ))}
            </div>

            {results.risks?.length > 0 && (
              <div className="bg-red-50 rounded-lg p-3 border border-red-100">
                <p className="text-[10px] font-medium text-red-700 uppercase tracking-wide mb-1.5">Downstream Risks</p>
                {results.risks.map((r, i) => (
                  <div key={i} className="mb-1.5 last:mb-0">
                    <div className="flex items-center gap-1.5">
                      <Badge className={`text-[8px] ${r.likelihood === 'high' ? 'bg-red-200 text-red-800' : r.likelihood === 'medium' ? 'bg-amber-200 text-amber-800' : 'bg-slate-200 text-slate-700'}`}>{r.likelihood}</Badge>
                      <span className="text-[11px] font-medium text-red-800">{r.risk}</span>
                    </div>
                    <p className="text-[10px] text-red-600 ml-12">{r.mitigation}</p>
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
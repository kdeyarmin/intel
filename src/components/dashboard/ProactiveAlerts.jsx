import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, TrendingDown, TrendingUp, Clock, Users, Sparkles } from 'lucide-react';

export default function ProactiveAlerts({ providers = [], utilizations = [], referrals = [], locations = [] }) {
  const insights = useMemo(() => {
    const alerts = [];

    const needEnrichment = providers.filter(p => p.needs_nppes_enrichment);
    if (needEnrichment.length > 0) {
      alerts.push({
        id: 'enrichment', icon: Users, severity: 'medium',
        title: `${needEnrichment.length} providers need NPPES enrichment`,
        description: 'These providers were imported from CMS data without full NPPES details.',
        color: 'amber',
      });
    }

    const deactivatedNPIs = new Set(providers.filter(p => p.status === 'Deactivated').map(p => p.npi));
    const deactivatedWithUtil = utilizations.filter(u => deactivatedNPIs.has(u.npi));
    if (deactivatedWithUtil.length > 0) {
      alerts.push({
        id: 'deactivated-util', icon: AlertTriangle, severity: 'high',
        title: `${new Set(deactivatedWithUtil.map(u => u.npi)).size} deactivated providers with utilization data`,
        description: 'These providers are deactivated but still appear in utilization records.',
        color: 'red',
      });
    }

    const refByNPI = {};
    referrals.forEach(r => { if (!refByNPI[r.npi]) refByNPI[r.npi] = []; refByNPI[r.npi].push(r); });
    let highGrowthCount = 0;
    Object.values(refByNPI).forEach(refs => {
      if (refs.length < 2) return;
      const sorted = [...refs].sort((a, b) => (a.year || 0) - (b.year || 0));
      const prev = sorted[sorted.length - 2]?.total_referrals || 0;
      const curr = sorted[sorted.length - 1]?.total_referrals || 0;
      if (prev > 0 && curr > prev * 1.5) highGrowthCount++;
    });
    if (highGrowthCount > 0) {
      alerts.push({
        id: 'ref-growth', icon: TrendingUp, severity: 'info',
        title: `${highGrowthCount} providers with 50%+ referral growth`,
        description: 'These providers show significant referral volume growth — potential high-value targets.',
        color: 'emerald',
      });
    }

    const noPhone = locations.filter(l => !l.phone);
    if (noPhone.length > 10) {
      alerts.push({
        id: 'missing-phone', icon: Clock, severity: 'low',
        title: `${noPhone.length} locations missing phone numbers`,
        description: 'Consider enriching contact data for better outreach capability.',
        color: 'blue',
      });
    }

    const currentYear = new Date().getFullYear();
    const latestUtilYear = utilizations.reduce((max, u) => Math.max(max, u.year || 0), 0);
    if (latestUtilYear > 0 && currentYear - latestUtilYear >= 2) {
      alerts.push({
        id: 'stale-data', icon: TrendingDown, severity: 'medium',
        title: `Utilization data may be outdated (latest: ${latestUtilYear})`,
        description: 'Consider importing more recent CMS utilization data for accurate intelligence.',
        color: 'amber',
      });
    }

    return alerts;
  }, [providers, utilizations, referrals, locations]);

  if (insights.length === 0) return null;

  const colorMap = {
    red: { bg: 'bg-red-500/10', border: 'border-red-500/20', icon: 'text-red-400', badge: 'bg-red-500/15 text-red-400 border-red-500/20' },
    amber: { bg: 'bg-amber-500/10', border: 'border-amber-500/20', icon: 'text-amber-400', badge: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
    emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', icon: 'text-emerald-400', badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' },
    blue: { bg: 'bg-cyan-500/10', border: 'border-cyan-500/20', icon: 'text-cyan-400', badge: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20' },
  };

  return (
    <Card className="bg-[#141d30] border-slate-700/50 shadow-lg shadow-black/10">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2 text-slate-300 font-semibold">
          <Sparkles className="w-4 h-4 text-violet-400" />
          Proactive Insights
          <Badge variant="outline" className="ml-auto text-[10px] border-slate-700 text-slate-400">{insights.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {insights.map(alert => {
          const Icon = alert.icon;
          const colors = colorMap[alert.color] || colorMap.blue;
          return (
            <div key={alert.id} className={`flex items-start gap-3 p-3 rounded-lg border ${colors.bg} ${colors.border}`}>
              <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${colors.icon}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-slate-200">{alert.title}</p>
                  <Badge className={`text-[10px] border ${colors.badge}`}>{alert.severity}</Badge>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{alert.description}</p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
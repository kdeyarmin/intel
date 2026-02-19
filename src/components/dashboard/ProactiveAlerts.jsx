import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, TrendingDown, TrendingUp, Clock, Users, Sparkles } from 'lucide-react';

export default function ProactiveAlerts({ providers = [], utilizations = [], referrals = [], locations = [] }) {
  const insights = useMemo(() => {
    const alerts = [];

    // 1. Providers needing enrichment
    const needEnrichment = providers.filter(p => p.needs_nppes_enrichment);
    if (needEnrichment.length > 0) {
      alerts.push({
        id: 'enrichment',
        icon: Users,
        severity: 'medium',
        title: `${needEnrichment.length} providers need NPPES enrichment`,
        description: 'These providers were imported from CMS data without full NPPES details.',
        color: 'amber',
      });
    }

    // 2. Deactivated providers still in utilization data
    const deactivatedNPIs = new Set(providers.filter(p => p.status === 'Deactivated').map(p => p.npi));
    const deactivatedWithUtil = utilizations.filter(u => deactivatedNPIs.has(u.npi));
    if (deactivatedWithUtil.length > 0) {
      alerts.push({
        id: 'deactivated-util',
        icon: AlertTriangle,
        severity: 'high',
        title: `${new Set(deactivatedWithUtil.map(u => u.npi)).size} deactivated providers with utilization data`,
        description: 'These providers are deactivated but still appear in utilization records. Review for data accuracy.',
        color: 'red',
      });
    }

    // 3. High referral growth (opportunity signal)
    const refByNPI = {};
    referrals.forEach(r => {
      if (!refByNPI[r.npi]) refByNPI[r.npi] = [];
      refByNPI[r.npi].push(r);
    });
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
        id: 'ref-growth',
        icon: TrendingUp,
        severity: 'info',
        title: `${highGrowthCount} providers with 50%+ referral growth`,
        description: 'These providers show significant referral volume growth year-over-year — potential high-value targets.',
        color: 'emerald',
      });
    }

    // 4. Locations without phone numbers
    const noPhone = locations.filter(l => !l.phone);
    if (noPhone.length > 10) {
      alerts.push({
        id: 'missing-phone',
        icon: Clock,
        severity: 'low',
        title: `${noPhone.length} locations missing phone numbers`,
        description: 'Consider enriching contact data for better outreach capability.',
        color: 'blue',
      });
    }

    // 5. Stale data check
    const currentYear = new Date().getFullYear();
    const latestUtilYear = utilizations.reduce((max, u) => Math.max(max, u.year || 0), 0);
    if (latestUtilYear > 0 && currentYear - latestUtilYear >= 2) {
      alerts.push({
        id: 'stale-data',
        icon: TrendingDown,
        severity: 'medium',
        title: `Utilization data may be outdated (latest: ${latestUtilYear})`,
        description: 'Consider importing more recent CMS utilization data for accurate intelligence.',
        color: 'amber',
      });
    }

    return alerts;
  }, [providers, utilizations, referrals, locations]);

  if (insights.length === 0) return null;

  const colorMap = {
    red: { bg: 'bg-red-50', border: 'border-red-200', icon: 'text-red-500', badge: 'bg-red-100 text-red-700' },
    amber: { bg: 'bg-amber-50', border: 'border-amber-200', icon: 'text-amber-500', badge: 'bg-amber-100 text-amber-700' },
    emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', icon: 'text-emerald-500', badge: 'bg-emerald-100 text-emerald-700' },
    blue: { bg: 'bg-blue-50', border: 'border-blue-200', icon: 'text-blue-500', badge: 'bg-blue-100 text-blue-700' },
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-violet-500" />
          Proactive Insights
          <Badge variant="outline" className="ml-auto text-xs">{insights.length}</Badge>
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
                  <p className="text-sm font-medium text-slate-800">{alert.title}</p>
                  <Badge className={`text-[10px] ${colors.badge}`}>{alert.severity}</Badge>
                </div>
                <p className="text-xs text-slate-600 mt-0.5">{alert.description}</p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
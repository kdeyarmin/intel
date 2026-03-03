import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, TrendingDown, TrendingUp, Clock, Users, Sparkles } from 'lucide-react';

export default function ProactiveAlerts({ providers = [], utilizations = [], referrals = [], locations = [] }) {
  // Ensure we're working with arrays
  const safeProviders = Array.isArray(providers) ? providers : [];
  const safeUtilizations = Array.isArray(utilizations) ? utilizations : [];
  const safeReferrals = Array.isArray(referrals) ? referrals : [];
  const safeLocations = Array.isArray(locations) ? locations : [];

  const isSampled = safeProviders.length >= 200 || safeLocations.length >= 200;

  const insights = useMemo(() => {
    const alerts = [];
    const approxSuffix = isSampled ? '+' : '';

    const needEnrichment = safeProviders.filter(p => p.needs_nppes_enrichment);
    if (needEnrichment.length > 0) {
      alerts.push({
        id: 'enrichment', icon: Users, severity: 'medium',
        title: `${needEnrichment.length}${approxSuffix} providers need NPPES enrichment`,
        description: 'These providers were imported from CMS data without full NPPES details.',
        color: 'amber',
      });
    }

    const deactivatedNPIs = new Set(safeProviders.filter(p => p.status === 'Deactivated').map(p => p.npi));
    const deactivatedWithUtil = safeUtilizations.filter(u => deactivatedNPIs.has(u.npi));
    if (deactivatedWithUtil.length > 0) {
      alerts.push({
        id: 'deactivated-util', icon: AlertTriangle, severity: 'high',
        title: `${new Set(deactivatedWithUtil.map(u => u.npi)).size}${approxSuffix} deactivated providers with utilization data`,
        description: 'These providers are deactivated but still appear in utilization records.',
        color: 'red',
      });
    }

    const refByNPI = {};
    safeReferrals.forEach(r => { if (!refByNPI[r.npi]) refByNPI[r.npi] = []; refByNPI[r.npi].push(r); });
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
        title: `${highGrowthCount}${approxSuffix} providers with 50%+ referral growth`,
        description: 'These providers show significant referral volume growth — potential high-value targets.',
        color: 'emerald',
      });
    }

    const noPhone = safeLocations.filter(l => !l.phone);
    if (noPhone.length > 10) {
      alerts.push({
        id: 'missing-phone', icon: Clock, severity: 'low',
        title: `${noPhone.length}${approxSuffix} locations missing phone numbers`,
        description: 'Consider enriching contact data for better outreach capability.',
        color: 'blue',
      });
    }

    const currentYear = new Date().getFullYear();
    const latestUtilYear = safeUtilizations.reduce((max, u) => Math.max(max, u.year || 0), 0);
    if (latestUtilYear > 0 && currentYear - latestUtilYear >= 2) {
      alerts.push({
        id: 'stale-data', icon: TrendingDown, severity: 'medium',
        title: `Utilization data may be outdated (latest: ${latestUtilYear})`,
        description: 'Consider importing more recent CMS utilization data for accurate intelligence.',
        color: 'amber',
      });
    }

    return alerts;
  }, [safeProviders, safeUtilizations, safeReferrals, safeLocations, isSampled]);

  if (insights.length === 0) return null;

  const colorMap = {
    red: { bg: 'bg-red-500/10', border: 'border-red-500/20', icon: 'text-red-400', badge: 'bg-red-500/20 text-red-300 border-red-500/30' },
    amber: { bg: 'bg-amber-500/10', border: 'border-amber-500/20', icon: 'text-amber-400', badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
    emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', icon: 'text-emerald-400', badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
    blue: { bg: 'bg-cyan-500/10', border: 'border-cyan-500/20', icon: 'text-cyan-400', badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' },
  };

  return (
    <Card className="bg-[#141d30] border-slate-700/50 shadow-lg shadow-black/10">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 text-white font-semibold">
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
                  <p className="text-base font-medium text-white">{alert.title}</p>
                  <Badge className={`text-[10px] border ${colors.badge}`}>{alert.severity}</Badge>
                </div>
                <p className="text-sm text-slate-300 mt-0.5">{alert.description}</p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
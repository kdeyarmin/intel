import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, TrendingDown, Clock, Users, Sparkles } from 'lucide-react';

export default function ProactiveAlerts({ proactiveInsights }) {
  const insights = useMemo(() => {
    if (!proactiveInsights) return [];
    const alerts = [];

    if (proactiveInsights.needsEnrichment > 0) {
      alerts.push({
        id: 'enrichment', icon: Users, severity: 'medium',
        title: `${proactiveInsights.needsEnrichment.toLocaleString()} providers need NPPES enrichment`,
        description: 'These providers were imported from CMS data without full NPPES details.',
        color: 'amber',
      });
    }

    if (proactiveInsights.deactivatedProviders > 0) {
      alerts.push({
        id: 'deactivated', icon: AlertTriangle, severity: 'high',
        title: `${proactiveInsights.deactivatedProviders.toLocaleString()} deactivated providers in database`,
        description: 'These providers have been deactivated and may need review.',
        color: 'red',
      });
    }

    if (proactiveInsights.noPhoneLocations > 100) {
      alerts.push({
        id: 'missing-phone', icon: Clock, severity: 'low',
        title: `${proactiveInsights.noPhoneLocations.toLocaleString()} locations missing phone numbers`,
        description: 'Consider enriching contact data for better outreach capability.',
        color: 'blue',
      });
    }

    const currentYear = new Date().getFullYear();
    if (proactiveInsights.latestUtilYear > 0 && currentYear - proactiveInsights.latestUtilYear >= 2) {
      alerts.push({
        id: 'stale-data', icon: TrendingDown, severity: 'medium',
        title: `Utilization data may be outdated (latest: ${proactiveInsights.latestUtilYear})`,
        description: 'Consider importing more recent CMS utilization data for accurate intelligence.',
        color: 'amber',
      });
    }

    return alerts;
  }, [proactiveInsights]);

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

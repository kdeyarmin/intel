import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

function StatCard({ title, value, subtitle, link, loading, badge }) {
  const content = (
    <Card className="bg-[#141d30] border-slate-700/50 hover:border-cyan-500/30 transition-all cursor-pointer group">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">{title}</p>
            {loading ? (
              <Skeleton className="h-8 w-28 mt-2 bg-slate-700/50" />
            ) : (
              <>
                <p className="text-2xl lg:text-3xl font-bold text-white mt-1.5 tracking-tight group-hover:text-cyan-400 transition-colors">{value}</p>
                {subtitle && <p className="text-[11px] text-slate-400 mt-1">{subtitle}</p>}
              </>
            )}
          </div>
          {badge && !loading && (
            <div className="flex flex-col items-end gap-1.5">
              <Badge className={`text-[9px] ${badge.className}`}>{badge.label}</Badge>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );

  if (link) {
    return <Link to={createPageUrl(link)}>{content}</Link>;
  }
  return content;
}

function formatCount(value) {
  if (!value && value !== 0) return '0';
  return value.toLocaleString();
}

export default function DatabaseOverview({ stats, loading }) {
  return (
    <div className="space-y-3">
      <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Database Records</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          title="Providers"
          value={formatCount(stats?.totalProviders)}
          subtitle={stats?.emailStats?.needsEnrichment > 0 ? `${stats.emailStats.needsEnrichment.toLocaleString()} without email` : null}
          link="Providers"
          loading={loading}
        />
        <StatCard
          title="Referrals"
          value={formatCount(stats?.totalReferrals)}
          link="ReferralNetworkIntelligence"
          loading={loading}
        />
        <StatCard
          title="Utilization"
          value={formatCount(stats?.totalUtilization)}
          link="Utilization"
          loading={loading}
        />
        <StatCard
          title="Facilities"
          value={formatCount(stats?.totalFacilities)}
          subtitle="Hospitals, SNF, HHA & more"
          link="CMSAnalytics"
          loading={loading}
        />
      </div>
    </div>
  );
}

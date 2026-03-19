import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

function StatCard({ title, value, subtitle, link, loading, badge }) {
  const content = (
    <Card className="bg-[#141d30] border-slate-700/50 hover:border-cyan-500/30 transition-all cursor-pointer group">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">{title}</p>
            {loading ? (
              <Skeleton className="h-7 w-20 mt-1.5 bg-slate-700/50" />
            ) : (
              <>
                <p className="text-2xl font-bold text-white mt-1 tracking-tight group-hover:text-cyan-400 transition-colors">{value}</p>
                {subtitle && <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>}
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

function formatCount(value, isTruncated) {
  if (!value && value !== 0) return '0';
  return value.toLocaleString() + (isTruncated ? '+' : '');
}

export default function DatabaseOverview({ stats, loading }) {
  const emailPct = stats?.totalProviders > 0 && stats?.emailStats
    ? Math.round((stats.emailStats.withEmail / stats.totalProviders) * 100)
    : 0;

  const est = stats?.isEstimatedCounts;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Database Records</h2>
        {est && <span className="text-[9px] text-slate-500">(+ means more records exist)</span>}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard
          title="Providers"
          value={formatCount(stats?.totalProviders, est)}
          subtitle={stats?.emailStats?.needsEnrichment > 0 ? `${stats.emailStats.needsEnrichment.toLocaleString()} need enrichment` : null}
          link="Providers"
          loading={loading}
        />
        <StatCard
          title="Locations"
          value={formatCount(stats?.totalLocations, est)}
          link="Locations"
          loading={loading}
        />
        <StatCard
          title="Referrals"
          value={formatCount(stats?.totalReferrals, est)}
          link="Referrals"
          loading={loading}
        />
        <StatCard
          title="Utilization"
          value={formatCount(stats?.totalUtilization, est)}
          link="Utilization"
          loading={loading}
        />
        <StatCard
          title="Taxonomies"
          value={formatCount(stats?.totalTaxonomies, est)}
          loading={loading}
        />
        <StatCard
          title="Emails Found"
          value={formatCount(stats?.emailStats?.withEmail, stats?.emailStats?.isEstimated)}
          subtitle={`${emailPct}%${stats?.emailStats?.isEstimated ? '~' : ''} coverage`}
          link="EmailSearchBot"
          loading={loading}
        />
      </div>
    </div>
  );
}
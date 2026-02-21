import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Users, MapPin, GitBranch, Activity, FileText, Mail, ShieldCheck, ShieldAlert, ShieldX, AlertTriangle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

function StatCard({ title, value, subtitle, icon: Icon, iconColor, link, loading, badge }) {
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
                {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
              </>
            )}
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <div className="p-2 rounded-lg bg-slate-800/80 border border-slate-700/50">
              <Icon className={`w-4 h-4 ${iconColor}`} />
            </div>
            {badge && !loading && <Badge className={`text-[9px] ${badge.className}`}>{badge.label}</Badge>}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (link) {
    return <Link to={createPageUrl(link)}>{content}</Link>;
  }
  return content;
}

export default function DatabaseOverview({ stats, loading }) {
  const emailPct = stats?.totalProviders > 0 && stats?.emailStats
    ? Math.round((stats.emailStats.withEmail / stats.totalProviders) * 100)
    : 0;

  return (
    <div className="space-y-3">
      <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Database Records</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard
          title="Providers"
          value={stats?.totalProviders?.toLocaleString() || '0'}
          subtitle={stats?.emailStats?.needsEnrichment > 0 ? `${stats.emailStats.needsEnrichment.toLocaleString()} need enrichment` : null}
          icon={Users}
          iconColor="text-cyan-400"
          link="Providers"
          loading={loading}
        />
        <StatCard
          title="Locations"
          value={stats?.totalLocations?.toLocaleString() || '0'}
          icon={MapPin}
          iconColor="text-sky-400"
          link="Locations"
          loading={loading}
        />
        <StatCard
          title="Referrals"
          value={stats?.totalReferrals?.toLocaleString() || '0'}
          icon={GitBranch}
          iconColor="text-violet-400"
          link="Referrals"
          loading={loading}
        />
        <StatCard
          title="Utilization"
          value={stats?.totalUtilization?.toLocaleString() || '0'}
          icon={Activity}
          iconColor="text-emerald-400"
          link="Utilization"
          loading={loading}
        />
        <StatCard
          title="Taxonomies"
          value={stats?.totalTaxonomies?.toLocaleString() || '0'}
          icon={FileText}
          iconColor="text-amber-400"
          loading={loading}
        />
        <StatCard
          title="Emails Found"
          value={stats?.emailStats?.withEmail?.toLocaleString() || '0'}
          subtitle={`${emailPct}% coverage`}
          icon={Mail}
          iconColor="text-pink-400"
          link="EmailSearchBot"
          loading={loading}
          badge={stats?.emailStats?.isEstimated ? { label: '~est', className: 'bg-slate-700 text-slate-400' } : null}
        />
      </div>
    </div>
  );
}
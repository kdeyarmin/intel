import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Network, Users, MapPin, GitBranch, Activity } from 'lucide-react';
import { RadialBarChart, RadialBar, ResponsiveContainer, Tooltip } from 'recharts';

export default function NetworkHealthWidget({ providers = [], locations = [], referrals = [], utilizations = [], scores = [], campaigns = [] }) {
  const metrics = useMemo(() => {
    const totalProv = providers.length;
    const withLoc = new Set(locations.map(l => l.npi)).size;
    const withRef = new Set(referrals.map(r => r.npi)).size;
    const withUtil = new Set(utilizations.map(u => u.npi)).size;
    const withScore = scores.length;

    const coverage = totalProv > 0 ? Math.round((withLoc / totalProv) * 100) : 0;
    const refCoverage = totalProv > 0 ? Math.round((withRef / totalProv) * 100) : 0;
    const utilCoverage = totalProv > 0 ? Math.round((withUtil / totalProv) * 100) : 0;
    const scoreCoverage = totalProv > 0 ? Math.round((withScore / totalProv) * 100) : 0;

    const overall = Math.round((coverage + refCoverage + utilCoverage + scoreCoverage) / 4);

    const totalSent = campaigns.reduce((s, c) => s + (c.sent_count || 0), 0);
    const totalOpened = campaigns.reduce((s, c) => s + (c.opened_count || 0), 0);
    const totalResponded = campaigns.reduce((s, c) => s + (c.responded_count || 0), 0);

    return {
      coverage, refCoverage, utilCoverage, scoreCoverage, overall,
      totalProv, withLoc, withRef, withUtil, withScore,
      totalSent, totalOpened, totalResponded,
    };
  }, [providers, locations, referrals, utilizations, scores, campaigns]);

  const radialData = [
    { name: 'Location', value: metrics.coverage, fill: '#3b82f6' },
    { name: 'Referral', value: metrics.refCoverage, fill: '#8b5cf6' },
    { name: 'Utilization', value: metrics.utilCoverage, fill: '#10b981' },
    { name: 'Scoring', value: metrics.scoreCoverage, fill: '#f59e0b' },
  ];

  const overallColor = metrics.overall >= 70 ? 'text-emerald-600' : metrics.overall >= 40 ? 'text-amber-600' : 'text-red-600';

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Network className="w-4 h-4 text-indigo-500" /> Network Health
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4">
          {/* Radial chart */}
          <div className="flex flex-col items-center">
            <div className="h-36 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart cx="50%" cy="50%" innerRadius="30%" outerRadius="100%" data={radialData} startAngle={180} endAngle={0}>
                  <RadialBar dataKey="value" cornerRadius={4} />
                  <Tooltip formatter={(v) => `${v}%`} />
                </RadialBarChart>
              </ResponsiveContainer>
            </div>
            <p className={`text-2xl font-bold ${overallColor}`}>{metrics.overall}%</p>
            <p className="text-[9px] text-slate-400">Data Completeness</p>
          </div>

          {/* Coverage metrics */}
          <div className="space-y-2">
            <p className="text-[10px] font-medium text-slate-400 uppercase">Coverage</p>
            {[
              { label: 'Location Data', value: metrics.coverage, icon: MapPin, color: 'text-blue-500' },
              { label: 'Referral Data', value: metrics.refCoverage, icon: GitBranch, color: 'text-violet-500' },
              { label: 'Utilization Data', value: metrics.utilCoverage, icon: Activity, color: 'text-emerald-500' },
              { label: 'Lead Scoring', value: metrics.scoreCoverage, icon: Users, color: 'text-amber-500' },
            ].map(m => {
              const Icon = m.icon;
              return (
                <div key={m.label} className="flex items-center gap-2">
                  <Icon className={`w-3 h-3 ${m.color}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-600">{m.label}</span>
                      <span className="text-[10px] font-bold text-slate-700">{m.value}%</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1 mt-0.5">
                      <div className="h-1 rounded-full bg-current" style={{ width: `${m.value}%`, color: m.color.replace('text-', '').includes('blue') ? '#3b82f6' : m.color.includes('violet') ? '#8b5cf6' : m.color.includes('emerald') ? '#10b981' : '#f59e0b' }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Outreach stats */}
          <div className="space-y-2">
            <p className="text-[10px] font-medium text-slate-400 uppercase">Outreach</p>
            <div className="bg-blue-50 rounded-lg p-2">
              <p className="text-lg font-bold text-blue-700">{metrics.totalSent}</p>
              <p className="text-[9px] text-blue-500">Emails Sent</p>
            </div>
            <div className="bg-emerald-50 rounded-lg p-2">
              <p className="text-lg font-bold text-emerald-700">{metrics.totalOpened}</p>
              <p className="text-[9px] text-emerald-500">Opened</p>
            </div>
            <div className="bg-violet-50 rounded-lg p-2">
              <p className="text-lg font-bold text-violet-700">{metrics.totalResponded}</p>
              <p className="text-[9px] text-violet-500">Responded</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
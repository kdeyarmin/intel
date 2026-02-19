import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Target, ArrowUpRight, ArrowDownRight, Minus, ExternalLink } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const TIER_COLORS = { hot: '#ef4444', warm: '#f59e0b', medium: '#3b82f6', low: '#94a3b8' };

export default function LeadScoringTrendsWidget({ scores = [], providers = [] }) {
  const provMap = useMemo(() => {
    const m = {};
    providers.forEach(p => { m[p.npi] = p; });
    return m;
  }, [providers]);

  const tiers = useMemo(() => {
    const t = { hot: 0, warm: 0, medium: 0, low: 0 };
    scores.forEach(s => {
      if (s.score >= 80) t.hot++;
      else if (s.score >= 60) t.warm++;
      else if (s.score >= 40) t.medium++;
      else t.low++;
    });
    return t;
  }, [scores]);

  const pieData = Object.entries(tiers).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }));

  const topScored = useMemo(() =>
    [...scores].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 6),
  [scores]);

  const distribution = useMemo(() => {
    const buckets = {};
    scores.forEach(s => {
      const bucket = Math.floor((s.score || 0) / 10) * 10;
      const label = `${bucket}-${bucket + 9}`;
      buckets[label] = (buckets[label] || 0) + 1;
    });
    return Object.entries(buckets).sort(([a], [b]) => parseInt(a) - parseInt(b))
      .map(([range, count]) => ({ range, count }));
  }, [scores]);

  const avgScore = scores.length > 0 ? Math.round(scores.reduce((s, sc) => s + (sc.score || 0), 0) / scores.length) : 0;

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Target className="w-4 h-4 text-amber-500" /> Lead Scoring Overview
          <Badge variant="outline" className="text-[10px] ml-auto">{scores.length} scored</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {scores.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-8">No scored leads yet</p>
        ) : (
          <div className="space-y-4">
            {/* KPI chips */}
            <div className="grid grid-cols-5 gap-2">
              <div className="bg-slate-50 rounded-lg p-2 text-center">
                <p className="text-lg font-bold text-slate-700">{avgScore}</p>
                <p className="text-[9px] text-slate-400">Avg Score</p>
              </div>
              {Object.entries(tiers).map(([tier, count]) => (
                <div key={tier} className="rounded-lg p-2 text-center" style={{ backgroundColor: `${TIER_COLORS[tier]}15` }}>
                  <p className="text-lg font-bold" style={{ color: TIER_COLORS[tier] }}>{count}</p>
                  <p className="text-[9px] capitalize" style={{ color: TIER_COLORS[tier] }}>{tier}</p>
                </div>
              ))}
            </div>

            {/* Charts row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] font-medium text-slate-400 uppercase mb-1">Score Distribution</p>
                <div className="h-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={distribution}>
                      <XAxis dataKey="range" tick={{ fontSize: 8 }} />
                      <YAxis tick={{ fontSize: 8 }} />
                      <Tooltip />
                      <Area type="monotone" dataKey="count" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-medium text-slate-400 uppercase mb-1">Tier Breakdown</p>
                <div className="h-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={25} outerRadius={50}
                        label={({ name, value }) => `${name} (${value})`} labelLine={false}>
                        {pieData.map((e, i) => <Cell key={i} fill={TIER_COLORS[e.name] || '#94a3b8'} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Top leads */}
            <div>
              <p className="text-[10px] font-medium text-slate-400 uppercase mb-1.5">Top Leads</p>
              <div className="space-y-1">
                {topScored.map((s, i) => {
                  const prov = provMap[s.npi];
                  const name = prov
                    ? prov.entity_type === 'Individual' ? `${prov.first_name} ${prov.last_name}`.trim() : prov.organization_name
                    : s.npi;
                  const tier = s.score >= 80 ? 'hot' : s.score >= 60 ? 'warm' : s.score >= 40 ? 'medium' : 'low';
                  return (
                    <div key={s.id || i} className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white" style={{ backgroundColor: TIER_COLORS[tier] }}>
                          {i + 1}
                        </div>
                        <span className="text-xs font-medium text-slate-700 truncate">{name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge className="text-[10px]" style={{ backgroundColor: `${TIER_COLORS[tier]}20`, color: TIER_COLORS[tier] }}>
                          {s.score}
                        </Badge>
                        <Link to={createPageUrl(`ProviderDetail?npi=${s.npi}`)}>
                          <ExternalLink className="w-3 h-3 text-slate-300 hover:text-blue-500" />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
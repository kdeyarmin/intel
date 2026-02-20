import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';
import { Sparkles } from 'lucide-react';

const STATUS_COLORS = {
  pending_review: '#f59e0b',
  approved: '#22c55e',
  rejected: '#ef4444',
  auto_applied: '#22d3ee',
};

const CONFIDENCE_COLORS = { high: '#22c55e', medium: '#f59e0b', low: '#ef4444' };

export default function EnrichmentStats() {
  const { data: records = [] } = useQuery({
    queryKey: ['enrichmentStats'],
    queryFn: () => base44.entities.EnrichmentRecord.list('-created_date', 500),
    staleTime: 30000,
  });

  const statusData = Object.entries(
    records.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {})
  ).map(([name, value]) => ({ name: name.replace('_', ' '), value, fill: STATUS_COLORS[name] || '#64748b' }));

  const confidenceData = Object.entries(
    records.reduce((acc, r) => { acc[r.confidence || 'unknown'] = (acc[r.confidence || 'unknown'] || 0) + 1; return acc; }, {})
  ).map(([name, value]) => ({ name, value, fill: CONFIDENCE_COLORS[name] || '#64748b' }));

  const sourceData = Object.entries(
    records.reduce((acc, r) => { acc[r.source || 'unknown'] = (acc[r.source || 'unknown'] || 0) + 1; return acc; }, {})
  ).map(([source, count]) => ({ source: source.replace('_', ' '), count })).sort((a, b) => b.count - a.count);

  if (records.length === 0) return null;

  const tooltipStyle = { background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12, color: '#e2e8f0' };

  return (
    <Card className="bg-[#141d30] border-slate-700/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-violet-400" />
          Enrichment Overview ({records.length} records)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Status pie */}
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-2 text-center">By Status</p>
            <div className="h-36">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusData} cx="50%" cy="50%" innerRadius={30} outerRadius={55} dataKey="value" strokeWidth={0}>
                    {statusData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap justify-center gap-2 mt-1">
              {statusData.map(d => (
                <div key={d.name} className="flex items-center gap-1 text-[9px] text-slate-400">
                  <div className="w-2 h-2 rounded-full" style={{ background: d.fill }} />
                  {d.name} ({d.value})
                </div>
              ))}
            </div>
          </div>

          {/* Confidence pie */}
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-2 text-center">By Confidence</p>
            <div className="h-36">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={confidenceData} cx="50%" cy="50%" innerRadius={30} outerRadius={55} dataKey="value" strokeWidth={0}>
                    {confidenceData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap justify-center gap-2 mt-1">
              {confidenceData.map(d => (
                <div key={d.name} className="flex items-center gap-1 text-[9px] text-slate-400">
                  <div className="w-2 h-2 rounded-full" style={{ background: d.fill }} />
                  {d.name} ({d.value})
                </div>
              ))}
            </div>
          </div>

          {/* Source bar */}
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-2 text-center">By Source</p>
            <div className="h-36">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sourceData} margin={{ left: 60, right: 10 }} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#64748b' }} />
                  <YAxis type="category" dataKey="source" tick={{ fontSize: 10, fill: '#94a3b8' }} width={55} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
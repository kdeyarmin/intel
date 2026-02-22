import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Clock } from 'lucide-react';

const TOOLTIP_STYLE = { background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12, color: '#e2e8f0' };

const IMPORT_TYPE_LABELS = {
  'nppes_monthly': 'NPPES Monthly', 'nppes_registry': 'NPPES Registry',
  'cms_utilization': 'CMS Util', 'cms_part_d': 'Part D',
  'cms_order_referring': 'Order/Ref', 'hospice_enrollments': 'Hospice Enr',
  'home_health_enrollments': 'HH Enr', 'home_health_cost_reports': 'HH Cost',
  'nursing_home_chains': 'NH Chains', 'provider_service_utilization': 'Prov Svc',
  'home_health_pdgm': 'HH PDGM', 'inpatient_drg': 'DRG',
  'provider_ownership': 'Ownership', 'medicare_hha_stats': 'HHA Stats',
  'medicare_ma_inpatient': 'MA Inp', 'medicare_part_d_stats': 'Part D Stats',
  'medicare_snf_stats': 'SNF Stats',
};

export default function ProcessingTimeChart({ batches = [] }) {
  const data = useMemo(() => {
    const byType = {};
    for (const b of batches) {
      if (!b.completed_at || !b.created_date) continue;
      const dur = (new Date(b.completed_at) - new Date(b.created_date)) / 1000;
      if (dur <= 0 || dur > 86400) continue;
      const t = b.import_type || 'unknown';
      if (!byType[t]) byType[t] = { durations: [] };
      byType[t].durations.push(dur);
    }
    return Object.entries(byType)
      .map(([type, d]) => ({
        type: IMPORT_TYPE_LABELS[type] || type,
        'Avg Time (s)': Math.round(d.durations.reduce((s, v) => s + v, 0) / d.durations.length),
        count: d.durations.length,
      }))
      .sort((a, b) => b['Avg Time (s)'] - a['Avg Time (s)']);
  }, [batches]);

  if (data.length === 0) return null;

  return (
    <Card className="bg-[#141d30] border-slate-700/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          <Clock className="w-4 h-4 text-amber-400" />
          Avg Processing Time by Import Type
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 70, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis type="number" tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={v => `${v}s`} />
              <YAxis type="category" dataKey="type" tick={{ fontSize: 10, fill: '#94a3b8' }} width={65} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, name, props) => [`${v}s (${props.payload.count} imports)`, 'Avg Time']} />
              <Bar dataKey="Avg Time (s)" fill="#fbbf24" radius={[0, 4, 4, 0]} barSize={16} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { Database } from 'lucide-react';
import { buildImportTypeLabels } from '@/lib/cmsImportTypes';

const TOOLTIP_STYLE = { background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12, color: '#e2e8f0' };

const IMPORT_TYPE_LABELS = buildImportTypeLabels({
  cms_utilization: 'CMS Util',
  cms_part_d: 'Part D',
  cms_order_referring: 'Order/Ref',
  hospice_enrollments: 'Hospice Enr',
  home_health_enrollments: 'HH Enr',
  home_health_cost_reports: 'HH Cost',
  nursing_home_chains: 'NH Chains',
  provider_service_utilization: 'Prov Svc',
  home_health_pdgm: 'HH PDGM',
  inpatient_drg: 'DRG',
  provider_ownership: 'Ownership',
  medicare_hha_stats: 'HHA Stats',
  medicare_ma_inpatient: 'MA Inp',
  medicare_part_d_stats: 'Part D Stats',
  medicare_snf_stats: 'SNF Stats',
});

export default function ImportTypeBreakdownChart({ batches = [] }) {
  const data = useMemo(() => {
    const byType = {};
    for (const b of batches) {
      const t = b.import_type || 'unknown';
      if (!byType[t]) byType[t] = { completed: 0, failed: 0, other: 0 };
      if (b.status === 'completed') byType[t].completed++;
      else if (b.status === 'failed') byType[t].failed++;
      else byType[t].other++;
    }
    return Object.entries(byType)
      .map(([type, d]) => ({
        type: IMPORT_TYPE_LABELS[type] || type,
        ...d,
        total: d.completed + d.failed + d.other,
      }))
      .sort((a, b) => b.total - a.total);
  }, [batches]);

  if (data.length === 0) return null;

  return (
    <Card className="bg-[#141d30] border-slate-700/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          <Database className="w-4 h-4 text-violet-400" />
          Imports by Type
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 75, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis type="number" tick={{ fontSize: 10, fill: '#64748b' }} allowDecimals={false} />
              <YAxis type="category" dataKey="type" tick={{ fontSize: 10, fill: '#94a3b8' }} width={70} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="completed" stackId="a" fill="#34d399" name="Completed" />
              <Bar dataKey="failed" stackId="a" fill="#f87171" name="Failed" />
              <Bar dataKey="other" stackId="a" fill="#94a3b8" name="Other" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

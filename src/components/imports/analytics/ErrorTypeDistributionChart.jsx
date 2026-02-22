import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { AlertTriangle } from 'lucide-react';
import { categorizeError, ERROR_CATEGORIES } from '../errorCategories';

const COLORS = {
  invalid_npi: '#f87171',
  missing_required: '#fbbf24',
  formatting_error: '#fb923c',
  out_of_range: '#f472b6',
  duplicate_record: '#a78bfa',
  timeout_stall: '#60a5fa',
  network_api: '#22d3ee',
  manual_action: '#94a3b8',
  other: '#64748b',
};

const TOOLTIP_STYLE = { background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12, color: '#e2e8f0' };

export default function ErrorTypeDistributionChart({ batches = [] }) {
  const data = useMemo(() => {
    const counts = {};
    for (const b of batches) {
      if (!b.error_samples) continue;
      for (const err of b.error_samples) {
        const cat = categorizeError(err.message);
        counts[cat] = (counts[cat] || 0) + 1;
      }
    }
    return Object.entries(counts)
      .map(([key, count]) => ({
        name: ERROR_CATEGORIES[key]?.label || key,
        value: count,
        key,
      }))
      .sort((a, b) => b.value - a.value);
  }, [batches]);

  if (data.length === 0) return null;

  return (
    <Card className="bg-[#141d30] border-slate-700/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          Error Distribution Across All Imports
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={90}
                paddingAngle={2}
                dataKey="value"
              >
                {data.map((entry) => (
                  <Cell key={entry.key} fill={COLORS[entry.key] || '#64748b'} />
                ))}
              </Pie>
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
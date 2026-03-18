import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { ERROR_CATEGORIES, groupErrors } from './errorCategories';

const CHART_COLORS = {
  invalid_npi: '#f87171',
  missing_required: '#fbbf24',
  formatting_error: '#fb923c',
  duplicate_record: '#a78bfa',
  timeout_stall: '#60a5fa',
  network_api: '#22d3ee',
  manual_action: '#94a3b8',
  other: '#64748b',
};

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-slate-200">{d.label}</p>
      <p className="text-slate-400">{d.count} error{d.count !== 1 ? 's' : ''} ({d.pct}%)</p>
    </div>
  );
};

const renderLabel = ({ label, pct, cx, x }) => {
  if (pct < 5) return null;
  return (
    <text x={x} y={0} fill="#cbd5e1" fontSize={10} textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central">
      {label} ({pct}%)
    </text>
  );
};

export default function ErrorDistributionChart({ errors }) {
  const data = useMemo(() => {
    const { grouped, sortedCategories, totalErrors } = groupErrors(errors);
    if (totalErrors === 0) return [];
    return sortedCategories.map(cat => ({
      name: cat,
      label: ERROR_CATEGORIES[cat]?.label || cat,
      count: grouped[cat].length,
      pct: Math.round((grouped[cat].length / totalErrors) * 100),
      fill: CHART_COLORS[cat] || '#64748b',
    }));
  }, [errors]);

  if (!data.length) return null;

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
      <p className="text-xs font-semibold text-slate-400 mb-3">Error Type Distribution</p>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={45}
            outerRadius={80}
            paddingAngle={2}
            dataKey="count"
            label={renderLabel}
            labelLine={{ stroke: '#475569', strokeWidth: 1 }}
          >
            {data.map(d => (
              <Cell key={d.name} fill={d.fill} stroke="transparent" />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      {/* Legend below chart */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 justify-center">
        {data.map(d => (
          <div key={d.name} className="flex items-center gap-1.5 text-[10px]">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.fill }} />
            <span className="text-slate-400">{d.label}</span>
            <span className="text-slate-500">({d.count})</span>
          </div>
        ))}
      </div>
    </div>
  );
}
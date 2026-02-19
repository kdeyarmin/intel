import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

const COLORS = {
  high: '#16a34a',
  medium: '#ca8a04',
  low: '#dc2626',
};

function getColor(value) {
  if (value >= 80) return COLORS.high;
  if (value >= 50) return COLORS.medium;
  return COLORS.low;
}

export default function QualityRadialChart({ score, label, size = 80 }) {
  const color = getColor(score);
  const data = [
    { value: score },
    { value: 100 - score },
  ];

  return (
    <div className="flex flex-col items-center">
      <div style={{ width: size, height: size, minWidth: size, minHeight: size }} className="relative">
        <ResponsiveContainer width={size} height={size} minWidth={size} minHeight={size}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={size * 0.33}
              outerRadius={size * 0.45}
              startAngle={90}
              endAngle={-270}
              dataKey="value"
              strokeWidth={0}
            >
              <Cell fill={color} />
              <Cell fill="#f1f5f9" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold" style={{ color }}>{score}%</span>
        </div>
      </div>
      <span className="text-[10px] text-gray-500 mt-1 text-center leading-tight">{label}</span>
    </div>
  );
}
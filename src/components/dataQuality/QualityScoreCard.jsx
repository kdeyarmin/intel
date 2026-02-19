import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

const COLORS = { high: '#16a34a', medium: '#ca8a04', low: '#dc2626' };
function getColor(v) { return v >= 80 ? COLORS.high : v >= 50 ? COLORS.medium : COLORS.low; }

export default function QualityScoreCard({ label, score, icon: Icon }) {
  const color = getColor(score);
  const data = [{ value: score }, { value: 100 - score }];

  return (
    <Card className="bg-white">
      <CardContent className="p-4 flex items-center gap-4">
        <div className="relative" style={{ width: 64, height: 64, minWidth: 64 }}>
          <ResponsiveContainer width={64} height={64}>
            <PieChart>
              <Pie data={data} cx="50%" cy="50%" innerRadius={22} outerRadius={30} startAngle={90} endAngle={-270} dataKey="value" strokeWidth={0}>
                <Cell fill={color} />
                <Cell fill="#f1f5f9" />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm font-bold" style={{ color }}>{score}%</span>
          </div>
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            {Icon && <Icon className="w-3.5 h-3.5 text-slate-400" />}
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</span>
          </div>
          <p className="text-lg font-bold text-slate-800 mt-0.5">{score}%</p>
        </div>
      </CardContent>
    </Card>
  );
}
import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts';

/** Medicare beneficiaries served and providers in a market by year (one post-acute setting). */
export default function MarketShareTrendChart({ trend = [], label }) {
  if (!trend || trend.length < 2) return null;
  return (
    <div>
      <p className="text-xs text-slate-400 mb-1">{label}: beneficiaries served and providers by year</p>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={trend}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="data_year" tick={{ fontSize: 11 }} />
          <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
          <Bar yAxisId="left" dataKey="benes" fill="#06b6d4" name="Beneficiaries" />
          <Bar yAxisId="right" dataKey="providers" fill="#a78bfa" name="Providers" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

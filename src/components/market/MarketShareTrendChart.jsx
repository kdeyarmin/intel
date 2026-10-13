import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts';
import { fmtCount } from '@/lib/marketFormat';
import { recordRows } from './marketData';

/** Medicare beneficiaries served and providers in a market by year (one post-acute setting). */
export default function MarketShareTrendChart({ trend = [], label }) {
  trend = recordRows(trend);
  if (!trend || trend.length < 2) return null;
  return (
    <div>
      <p className="text-xs text-slate-400 mb-1">{label}: beneficiaries served and providers by year</p>
      {/* The bars say it visually; this says it to a screen reader, with the numbers. */}
      <table className="sr-only">
        <caption>{label}: Medicare beneficiaries served and providers by year</caption>
        <thead>
          <tr><th scope="col">Year</th><th scope="col">Beneficiaries</th><th scope="col">Providers</th></tr>
        </thead>
        <tbody>
          {trend.map((t) => (
            <tr key={t.data_year}>
              <th scope="row">{t.data_year}</th>
              <td>{fmtCount(t.benes)}</td>
              <td>{fmtCount(t.providers)}</td>
            </tr>
          ))}
        </tbody>
      </table>
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

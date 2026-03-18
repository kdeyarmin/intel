import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, LineChart, Line, CartesianGrid } from 'recharts';
import { TrendingUp } from 'lucide-react';

export default function UtilizationTrendChart({ utilizations = [] }) {
  const chartData = useMemo(() => {
    if (!utilizations.length) return [];
    return [...utilizations]
      .sort((a, b) => (a.year || 0) - (b.year || 0))
      .map(u => ({
        year: u.year,
        beneficiaries: u.total_medicare_beneficiaries || 0,
        services: u.total_services || 0,
        payments: Math.round((u.total_medicare_payment || 0) / 1000),
      }));
  }, [utilizations]);

  if (chartData.length < 2) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-blue-600" />
          Utilization Trends
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="year" tick={{ fontSize: 12 }} />
            <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(val, name) => {
                if (name === 'payments') return [`$${val}K`, 'Medicare Payments'];
                if (name === 'beneficiaries') return [val.toLocaleString(), 'Beneficiaries'];
                return [val.toLocaleString(), 'Services'];
              }}
            />
            <Legend />
            <Line yAxisId="left" type="monotone" dataKey="beneficiaries" stroke="#3b82f6" strokeWidth={2} name="Beneficiaries" dot={{ r: 3 }} />
            <Line yAxisId="left" type="monotone" dataKey="services" stroke="#14b8a6" strokeWidth={2} name="Services" dot={{ r: 3 }} />
            <Line yAxisId="right" type="monotone" dataKey="payments" stroke="#f59e0b" strokeWidth={2} name="Payments ($K)" dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
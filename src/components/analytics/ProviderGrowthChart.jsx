import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { format } from 'date-fns';

export default function ProviderGrowthChart({ metrics }) {
  const chartData = metrics
    .sort((a, b) => new Date(a.snapshot_date) - new Date(b.snapshot_date))
    .map(m => ({
      date: format(new Date(m.snapshot_date), 'MMM d'),
      providers: m.total_providers || 0,
      locations: m.total_locations || 0,
      utilization: m.total_utilization_records || 0,
      referrals: m.total_referral_records || 0,
    }));

  const latest = chartData[chartData.length - 1];
  const previous = chartData.length > 1 ? chartData[chartData.length - 2] : null;
  const growth = previous && previous.providers > 0
    ? ((latest?.providers - previous.providers) / previous.providers * 100).toFixed(1)
    : 0;

  const TrendIcon = growth > 0 ? TrendingUp : growth < 0 ? TrendingDown : Minus;
  const trendColor = growth > 0 ? 'text-green-600' : growth < 0 ? 'text-red-600' : 'text-gray-500';

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Provider Growth</CardTitle>
          <div className={`flex items-center gap-1 text-sm font-medium ${trendColor}`}>
            <TrendIcon className="w-4 h-4" />
            {growth > 0 ? '+' : ''}{growth}%
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {chartData.length < 2 ? (
          <p className="text-sm text-gray-500 text-center py-8">
            Metrics data is collected daily. More data points will appear over time.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="provGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0d9488" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#0d9488" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Area type="monotone" dataKey="providers" stroke="#0d9488" fill="url(#provGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
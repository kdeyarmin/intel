import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export default function ApiUsageChart({ nppesImports, loading }) {
  if (loading) return <Card className="h-[350px] animate-pulse bg-slate-100" />;

  const data = (nppesImports || [])
    .filter(b => b.import_type === 'nppes_registry' && b.created_date)
    .slice(0, 20)
    .reverse()
    .map(b => {
      // Estimate requests: total_rows / 200 (batch size)
      // This is an approximation as we don't strictly track request counts yet
      const successfulRequests = Math.ceil((b.total_rows || 0) / 200);
      
      // Estimate rate limits from error samples or retry count
      // If we had explicit rate_limit_count, use it. Otherwise guess from errors.
      const rateLimits = (b.rate_limit_count || 0) + (b.error_samples || []).filter(e => JSON.stringify(e).includes('429') || JSON.stringify(e).includes('rate limit')).length;
      
      return {
        name: b.file_name?.split('_')[1] || 'Batch',
        date: new Date(b.created_date).toLocaleDateString(),
        requests: successfulRequests || 0,
        rateLimits: rateLimits || 0,
      };
    });

  if (data.length === 0) return (
    <Card>
      <CardHeader>
        <CardTitle>API Usage & Rate Limits</CardTitle>
        <CardDescription>Estimated API requests and rate limit events</CardDescription>
      </CardHeader>
      <CardContent className="h-[300px] flex items-center justify-center text-slate-400">
        No API usage data available
      </CardContent>
    </Card>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>API Usage Statistics</CardTitle>
        <CardDescription>Requests vs Rate Limits (Last 20 Runs)</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis yAxisId="left" orientation="left" stroke="#64748b" tick={{ fontSize: 12 }} />
              <YAxis yAxisId="right" orientation="right" stroke="#ef4444" tick={{ fontSize: 12 }} />
              <Tooltip 
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                cursor={{ fill: '#f1f5f9' }}
              />
              <Legend />
              <Bar yAxisId="left" dataKey="requests" name="API Requests" fill="#0f766e" radius={[4, 4, 0, 0]} barSize={20} />
              <Bar yAxisId="right" dataKey="rateLimits" name="Rate Limits" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
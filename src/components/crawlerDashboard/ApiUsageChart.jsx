import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export default function ApiUsageChart({ nppesImports, loading }) {
  if (loading) return <Card className="h-[350px] animate-pulse bg-slate-800/50" />;

  const data = (nppesImports || [])
    .filter(b => b.import_type === 'nppes_registry' && b.created_date && b.file_name?.includes('crawler_'))
    .slice(0, 20)
    .reverse()
    .map(b => {
      // Use actual api_requests_count if available, otherwise estimate from total_rows
      const totalRows = b.total_rows || ((b.imported_rows || 0) + (b.updated_rows || 0) + (b.skipped_rows || 0) + (b.invalid_rows || 0));
      const successfulRequests = b.api_requests_count || Math.ceil(totalRows / 200);
      
      // Estimate rate limits from error samples or retry count
      // If we had explicit rate_limit_count, use it. Otherwise guess from errors.
      const rateLimits = (b.rate_limit_count || 0) + (b.error_samples || []).filter(e => JSON.stringify(e).includes('429') || JSON.stringify(e).includes('rate limit')).length;
      
      return {
        name: (b.file_name?.match(/crawler_([A-Z]{2})/) || [null, 'Batch'])[1],
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
                contentStyle={{ borderRadius: '8px', border: '1px solid #334155', background: '#1e293b', color: '#e2e8f0' }}
                cursor={{ fill: '#1e293b' }}
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
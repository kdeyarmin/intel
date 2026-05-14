import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, parseISO } from 'date-fns';
import { MailSearch } from 'lucide-react';

export default function EmailTrendChart({ data = [], loading }) {
  if (loading) {
    return (
      <Card className="col-span-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <MailSearch className="w-5 h-5 text-indigo-500" />
            Email Discovery Trend
          </CardTitle>
        </CardHeader>
        <CardContent className="h-[250px] flex items-center justify-center">
          <div className="animate-pulse flex space-x-4">
            <div className="h-4 w-48 bg-slate-700 rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Handle case where data might be undefined initially
  const safeData = Array.isArray(data) ? data : [];
  
  const chartData = safeData.map(d => ({
    ...d,
    displayDate: d.date ? format(parseISO(d.date), 'MMM d') : ''
  }));

  const totalFound = safeData.reduce((sum, day) => sum + day.count, 0);

  return (
    <Card className="col-span-full">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <MailSearch className="w-5 h-5 text-indigo-500" />
              Email Discovery Trend
            </CardTitle>
            <CardDescription>Emails successfully found by the Search Bot over the last 30 days</CardDescription>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-white">{totalFound}</div>
            <div className="text-sm text-slate-500">Total in 30 days</div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[250px] mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
              <XAxis 
                dataKey="displayDate" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 12, fill: '#64748b' }}
                dy={10}
                minTickGap={20}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 12, fill: '#64748b' }}
                allowDecimals={false}
              />
              <Tooltip
                cursor={{ fill: '#1e293b' }}
                contentStyle={{ borderRadius: '8px', border: 'none', background: '#1e293b', color: '#e2e8f0' }}
                labelStyle={{ fontWeight: 'bold', color: '#f8fafc', marginBottom: '4px' }}
              />
              <Bar 
                dataKey="count" 
                name="Emails Found" 
                fill="#6366f1" 
                radius={[4, 4, 0, 0]} 
                maxBarSize={40}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
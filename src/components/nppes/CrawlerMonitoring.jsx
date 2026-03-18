import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { AlertCircle, Clock, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function CrawlerMonitoring({ status }) {
  if (!status) return null;

  // Transform granular_metrics into an array for charts
  const metricsData = Object.entries(status.granular_metrics || {}).map(([state, data]) => ({
    state,
    avgTime: data.avg_prefix_time_ms / 1000, // convert to seconds
    rateLimits: data.rate_limit_hits,
    pendingItems: data.pending_items,
    completedItems: data.completed_items
  })).sort((a, b) => b.avgTime - a.avgTime);

  // Transform errors into an array for charts
  const errorData = (status.errors || []).map(err => ({
    message: err.original_message.length > 30 ? err.original_message.substring(0, 30) + '...' : err.original_message,
    count: err.count,
    statesCount: err.affected_states.length
  })).slice(0, 5);

  const hasHighErrorRate = status.failed > (status.completed * 0.2) && status.failed > 5;
  const hasLongProcessing = metricsData.some(m => m.avgTime > 120);

  return (
    <div className="space-y-6 mt-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Real-Time Telemetry</h2>
          <p className="text-sm text-slate-500">Live performance & error monitoring</p>
        </div>
        <div className="flex gap-2">
          {hasHighErrorRate && (
            <Badge className="bg-red-100 text-red-800 border-red-200 gap-1.5 py-1">
              <AlertCircle className="w-3.5 h-3.5" /> High Error Rate Detected
            </Badge>
          )}
          {hasLongProcessing && (
            <Badge className="bg-amber-100 text-amber-800 border-amber-200 gap-1.5 py-1">
              <Clock className="w-3.5 h-3.5" /> Slow Processing Detected
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-[#141d30] border-slate-700/50 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-200 flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-500" />
              Avg Processing Time (sec/prefix)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px] w-full">
              {metricsData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={metricsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="state" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#f8fafc' }}
                      itemStyle={{ color: '#38bdf8' }}
                    />
                    <Bar dataKey="avgTime" name="Seconds/Prefix" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-slate-400 text-sm">No active processing data</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#141d30] border-slate-700/50 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-200 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" />
              Rate Limits & Throttling
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px] w-full">
              {metricsData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={metricsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorRate" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="state" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#f8fafc' }}
                    />
                    <Area type="monotone" dataKey="rateLimits" name="Rate Limit Hits" stroke="#f59e0b" fillOpacity={1} fill="url(#colorRate)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-slate-400 text-sm">No active rate limiting data</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#141d30] border-slate-700/50 shadow-sm lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-500" />
              Top Error Frequencies
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px] w-full">
              {errorData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={errorData} layout="vertical" margin={{ top: 10, right: 30, left: 30, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                    <XAxis type="number" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis dataKey="message" type="category" tick={{ fontSize: 11, fill: '#64748b' }} width={180} axisLine={false} tickLine={false} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#f8fafc' }}
                    />
                    <Bar dataKey="count" name="Error Count" fill="#ef4444" radius={[0, 4, 4, 0]} maxBarSize={30} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-slate-400 text-sm">No active errors detected</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
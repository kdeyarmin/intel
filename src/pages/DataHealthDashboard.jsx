import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import PageHeader from '../components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Loader2, AlertTriangle, CheckCircle, Database, Clock } from 'lucide-react';

const COLORS = ['#ef4444', '#10b981', '#f59e0b', '#0ea5e9'];

export default function DataHealthDashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['data-health-metrics'],
    queryFn: async () => {
      const res = await base44.functions.invoke('getDataHealthMetrics', {});
      return res.data;
    },
    refetchInterval: 300000,
  });

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-100px)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="bg-destructive/10 text-destructive p-4 rounded-lg flex items-center gap-3">
          <AlertTriangle className="h-5 w-5" />
          <p>Error loading health metrics. Please try again later.</p>
        </div>
      </div>
    );
  }

  const freshPercentage = data?.staleData && data.staleData[1] && (data.staleData[0].value + data.staleData[1].value) > 0 
    ? Math.round((data.staleData[1].value / (data.staleData[0].value + data.staleData[1].value)) * 100)
    : 0;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <PageHeader 
        title="Data Health Dashboard" 
        subtitle={`Analyzing a sample of ${data?.totalSampled || 0} recent provider records and recent import batches`}
        icon={<Database className="w-6 h-6 text-primary" />}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        
        {/* Missing Fields Chart */}
        <Card className="col-span-1 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Missing Profile Fields
            </CardTitle>
            <CardDescription>Percentage of missing essential data across provider profiles</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.missingFieldsData || []} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={true} className="stroke-muted" />
                  <XAxis type="number" domain={[0, 100]} tickFormatter={(val) => `${val}%`} />
                  <YAxis dataKey="name" type="category" width={80} tick={{fill: 'currentColor'}} />
                  <Tooltip formatter={(val) => [`${val}%`, 'Missing']} cursor={{fill: 'var(--accent)'}} contentStyle={{ borderRadius: '8px', backgroundColor: 'var(--card)', color: 'var(--card-foreground)', borderColor: 'var(--border)' }} />
                  <Bar dataKey="missing" fill="#f59e0b" radius={[0, 4, 4, 0]} barSize={32} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Stale Providers Chart */}
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-500" />
              Data Freshness
            </CardTitle>
            <CardDescription>Providers updated in the last 6 months</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] flex flex-col items-center justify-center relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data?.staleData || []}
                    cx="50%"
                    cy="50%"
                    innerRadius={75}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {(data?.staleData || []).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '8px', backgroundColor: 'var(--card)', color: 'var(--card-foreground)', borderColor: 'var(--border)' }} />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
              
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-8">
                <span className="text-4xl font-bold text-foreground">
                  {freshPercentage}%
                </span>
                <span className="text-sm text-muted-foreground">Fresh</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Import Error Rates Chart */}
        <Card className="col-span-1 md:col-span-2 lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              Recent Import Error Rates
            </CardTitle>
            <CardDescription>Percentage of invalid rows by dataset type (top 10 highest errors)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[350px]">
              {data?.errorRates && data.errorRates.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.errorRates} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
                    <XAxis 
                      dataKey="name" 
                      angle={-45} 
                      textAnchor="end" 
                      height={80} 
                      tick={{fontSize: 12, fill: 'currentColor'}} 
                      interval={0}
                    />
                    <YAxis tickFormatter={(val) => `${val}%`} tick={{fill: 'currentColor'}} />
                    <Tooltip formatter={(val) => [`${val}%`, 'Error Rate']} cursor={{fill: 'var(--accent)'}} contentStyle={{ borderRadius: '8px', backgroundColor: 'var(--card)', color: 'var(--card-foreground)', borderColor: 'var(--border)' }} />
                    <Bar dataKey="errorRate" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={60}>
                      {data.errorRates.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.errorRate > 5 ? '#ef4444' : '#f59e0b'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center flex-col text-muted-foreground gap-2">
                  <CheckCircle className="w-12 h-12 text-emerald-500 mb-2" />
                  <p>No significant errors found in recent imports.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
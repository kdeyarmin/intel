import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import { AlertCircle, TrendingDown, CheckCircle, Clock } from 'lucide-react';

export default function DataQualityReportDashboard() {
  const [timeframe, setTimeframe] = useState('30'); // days

  const { data: scans = [], isLoading: loadingScans } = useQuery({
    queryKey: ['dataQualityScans', timeframe],
    queryFn: () => base44.entities.DataQualityScan.list('-created_date', 50),
    staleTime: 300000,
  });

  const { data: alerts = [], isLoading: loadingAlerts } = useQuery({
    queryKey: ['dataQualityAlerts'],
    queryFn: () => base44.entities.DataQualityAlert.filter({ status: 'new' }),
    staleTime: 300000,
  });

  const currentScan = scans[0];
  const latestScans = scans.slice(0, 10);

  // Chart data for trend
  const trendData = latestScans.reverse().map(s => ({
    date: new Date(s.created_date).toLocaleDateString(),
    score: s.completeness_score,
  }));

  // Radar chart for detailed metrics
  const radarData = currentScan?.quality_details ? [
    {
      metric: 'Provider Fields',
      value: Math.round(currentScan.quality_details.provider_metrics.field_completeness),
    },
    {
      metric: 'Locations',
      value: Math.round(currentScan.quality_details.location_metrics.field_completeness),
    },
    {
      metric: 'Email Coverage',
      value: currentScan.quality_details.email_quality.completeness_percent,
    },
    {
      metric: 'Referral Data',
      value: currentScan.quality_details.referral_coverage.coverage_percent,
    },
    {
      metric: 'Utilization Data',
      value: currentScan.quality_details.utilization_coverage.coverage_percent,
    },
  ] : [];

  const getSeverityColor = (severity) => {
    const colors = {
      high: 'bg-red-100 text-red-800',
      medium: 'bg-yellow-100 text-yellow-800',
      low: 'bg-blue-100 text-blue-800',
    };
    return colors[severity] || colors.low;
  };

  const getSeverityIcon = (severity) => {
    if (severity === 'high') return <AlertCircle className="w-4 h-4" />;
    if (severity === 'medium') return <TrendingDown className="w-4 h-4" />;
    return <Clock className="w-4 h-4" />;
  };

  return (
    <div className="space-y-6">
      {/* Overall Score Card */}
      {currentScan && (
        <Card className="bg-gradient-to-br from-slate-900 to-slate-800 border-slate-700">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Overall Data Quality Score</p>
                <div className="mt-2">
                  <span className="text-5xl font-bold text-white">{currentScan.completeness_score}%</span>
                  <p className="text-slate-400 text-sm mt-1">Last updated {new Date(currentScan.created_date).toLocaleString()}</p>
                </div>
              </div>
              <div className={`rounded-full w-32 h-32 flex items-center justify-center ${
                currentScan.completeness_score >= 80 ? 'bg-green-500/20' :
                currentScan.completeness_score >= 60 ? 'bg-yellow-500/20' : 'bg-red-500/20'
              }`}>
                <div className="text-center">
                  <CheckCircle className={`w-12 h-12 mx-auto ${
                    currentScan.completeness_score >= 80 ? 'text-green-400' :
                    currentScan.completeness_score >= 60 ? 'text-yellow-400' : 'text-red-400'
                  }`} />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Alerts Section */}
      {alerts.length > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600" />
              <CardTitle className="text-red-900">Active Quality Alerts ({alerts.length})</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {alerts.slice(0, 5).map(alert => (
              <div key={alert.id} className={`p-3 rounded border ${getSeverityColor(alert.severity)}`}>
                <div className="flex items-start gap-2">
                  {getSeverityIcon(alert.severity)}
                  <div className="flex-1">
                    <p className="font-medium text-sm">{alert.title}</p>
                    <p className="text-xs mt-0.5 opacity-90">{alert.description}</p>
                  </div>
                  <Badge variant="outline" className="text-xs capitalize">{alert.severity}</Badge>
                </div>
              </div>
            ))}
            {alerts.length > 5 && (
              <p className="text-xs text-red-700 text-center py-2">+{alerts.length - 5} more alerts</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Metrics Grid */}
      {currentScan?.quality_details && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-slate-900 border-slate-700">
            <CardContent className="p-4">
              <p className="text-slate-400 text-sm">Email Coverage</p>
              <p className="text-3xl font-bold text-white mt-2">
                {currentScan.quality_details.email_quality.completeness_percent}%
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {currentScan.quality_details.email_quality.with_email}/{currentScan.quality_details.email_quality.total} providers
              </p>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-700">
            <CardContent className="p-4">
              <p className="text-slate-400 text-sm">Email Validation</p>
              <p className="text-3xl font-bold text-white mt-2">
                {currentScan.quality_details.email_quality.valid_percent}%
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {currentScan.quality_details.email_quality.valid_emails} valid addresses
              </p>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-700">
            <CardContent className="p-4">
              <p className="text-slate-400 text-sm">Referral Coverage</p>
              <p className="text-3xl font-bold text-white mt-2">
                {currentScan.quality_details.referral_coverage.coverage_percent}%
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {currentScan.quality_details.referral_coverage.with_referrals}/{currentScan.quality_details.referral_coverage.total_providers}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trend Chart */}
        {trendData.length > 1 && (
          <Card className="bg-slate-900 border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-base">Quality Score Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="date" stroke="#9CA3AF" />
                  <YAxis stroke="#9CA3AF" domain={[0, 100]} />
                  <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: 'none' }} />
                  <Line type="monotone" dataKey="score" stroke="#06B6D4" strokeWidth={2} dot={{ fill: '#06B6D4', r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Radar Chart */}
        {radarData.length > 0 && (
          <Card className="bg-slate-900 border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-base">Data Quality Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#374151" />
                  <PolarAngleAxis dataKey="metric" stroke="#9CA3AF" tick={{ fontSize: 12 }} />
                  <PolarRadiusAxis stroke="#9CA3AF" domain={[0, 100]} />
                  <Radar name="Completeness" dataKey="value" stroke="#06B6D4" fill="#06B6D4" fillOpacity={0.6} />
                  <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: 'none' }} />
                </RadarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Detailed Metrics */}
      {currentScan?.quality_details && (
        <Card className="bg-slate-900 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white text-base">Field Completeness Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(currentScan.quality_details.provider_metrics.fields || {}).map(([field, stats]) => (
                <div key={field} className="flex items-center justify-between">
                  <span className="text-sm text-slate-400 capitalize">{field.replace(/_/g, ' ')}</span>
                  <div className="flex items-center gap-2">
                    <div className="h-2 bg-slate-700 rounded-full w-32">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${stats.percent}%` }} />
                    </div>
                    <span className="text-sm font-medium text-white w-12 text-right">{stats.percent}%</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, AlertTriangle, Target } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function NetworkGapAnalysis() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);

  const handleAnalyze = async () => {
    setLoading(true);
    try {
      const response = await base44.functions.invoke('analyzeProviderNetwork', {
        analysis_type: 'gaps'
      });
      setData(response.data.analysis);
    } catch (error) {
      console.error('Failed to analyze gaps:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            Network Gap Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600 mb-4">
            Identify underutilized specialties and referral opportunities.
          </p>
          <Button onClick={handleAnalyze} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Target className="w-4 h-4" />}
            Analyze Gaps
          </Button>
        </CardContent>
      </Card>
    );
  }

  const gaps = data.network_gaps || [];
  const gapData = gaps.map(g => ({
    specialty: g.specialty.substring(0, 15) + '...',
    active: g.active_referrers,
    total: g.total_providers,
    utilization: g.utilization_percent
  }));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              Underutilized Specialties
            </CardTitle>
            <Button variant="outline" size="sm" onClick={handleAnalyze} disabled={loading}>
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {gaps.length === 0 ? (
            <p className="text-sm text-slate-600">No significant gaps detected in your network.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={gapData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="specialty" tick={{ fontSize: 10 }} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="active" fill="#10b981" name="Active Referrers" />
                  <Bar dataKey="total" fill="#d1d5db" name="Total Providers" />
                </BarChart>
              </ResponsiveContainer>

              <div className="mt-6 space-y-3">
                {gaps.map((gap) => (
                  <div key={gap.specialty} className="p-4 border rounded-lg bg-orange-50">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-sm">{gap.specialty}</h4>
                      <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-300">
                        {gap.utilization_percent}% utilized
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-600 mb-2">
                      {gap.active_referrers} of {gap.total_providers} providers are active in your network
                    </p>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-slate-700">Underutilized providers:</p>
                      <div className="flex flex-wrap gap-1">
                        {gap.underutilized?.map((provider) => (
                          <Badge key={provider.npi} variant="outline" className="text-xs">
                            {provider.npi}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Crown, TrendingUp, Users } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';

export default function NetworkInfluencerAnalysis({ onInfluencerSelect }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);

  const handleAnalyze = async () => {
    setLoading(true);
    try {
      const response = await base44.functions.invoke('analyzeProviderNetwork', {
        analysis_type: 'influencers'
      });
      setData(response.data.analysis);
    } catch (error) {
      console.error('Failed to analyze network:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-amber-500" />
            Network Influencer Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600 mb-4">
            Identify key influencers and decision-makers in your provider network.
          </p>
          <Button onClick={handleAnalyze} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crown className="w-4 h-4" />}
            Analyze Influencers
          </Button>
        </CardContent>
      </Card>
    );
  }

  const topInfluencers = data.influencers?.slice(0, 10) || [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Crown className="w-5 h-5 text-amber-500" />
              Top Network Influencers
            </CardTitle>
            <Button variant="outline" size="sm" onClick={handleAnalyze} disabled={loading}>
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={topInfluencers}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="npi" tick={{ fontSize: 12 }} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="outbound_referrals" fill="#8b5cf6" name="Referrals Sent" />
              <Bar dataKey="network_size" fill="#06b6d4" name="Partners" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Influencer Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {topInfluencers.map((influencer, idx) => (
            <div 
              key={influencer.npi} 
              className="p-3 border rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
              onClick={() => onInfluencerSelect?.(influencer.npi)}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-lg text-amber-600 w-6">#{idx + 1}</span>
                  <div>
                    <p className="font-semibold text-sm">{influencer.npi}</p>
                    <p className="text-xs text-slate-500">Influence Score: {influencer.influence_score.toFixed(0)}</p>
                  </div>
                </div>
                <Badge variant="default" className="bg-amber-600">
                  {influencer.network_size} Partners
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 bg-slate-50 rounded flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-blue-500" />
                  <span>{influencer.outbound_referrals} referrals sent</span>
                </div>
                <div className="p-2 bg-slate-50 rounded flex items-center gap-2">
                  <Users className="w-4 h-4 text-purple-500" />
                  <span>{influencer.network_size} active partners</span>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Network Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 bg-slate-50 rounded">
              <p className="text-xs text-slate-600">Total Providers</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">
                {data.network_metrics?.total_providers || 0}
              </p>
            </div>
            <div className="p-3 bg-slate-50 rounded">
              <p className="text-xs text-slate-600">Relationships</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">
                {data.network_metrics?.total_relationships || 0}
              </p>
            </div>
            <div className="p-3 bg-slate-50 rounded">
              <p className="text-xs text-slate-600">Reciprocal Ties</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">
                {data.network_metrics?.reciprocal_relationships || 0}
              </p>
            </div>
            <div className="p-3 bg-slate-50 rounded">
              <p className="text-xs text-slate-600">Network Density</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">
                {(data.network_metrics?.density * 100).toFixed(1)}%
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
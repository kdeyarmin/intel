import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Lightbulb, ArrowRight } from 'lucide-react';

export default function AINetworkRecommendations() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);

  const handleGetRecommendations = async () => {
    setLoading(true);
    try {
      const response = await base44.functions.invoke('analyzeProviderNetwork', {
        analysis_type: 'full'
      });
      setData(response.data.analysis);
    } catch (error) {
      console.error('Failed to get recommendations:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!data) {
    return (
      <Card className="bg-gradient-to-br from-violet-50 to-purple-50 border-violet-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-violet-900">
            <Lightbulb className="w-5 h-5" />
            AI Network Optimization
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-violet-800 mb-4">
            Get AI-powered recommendations for strategic network expansion and optimization.
          </p>
          <Button onClick={handleGetRecommendations} disabled={loading} className="gap-2 bg-violet-600 hover:bg-violet-700">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lightbulb className="w-4 h-4" />}
            Generate Recommendations
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { recommendations = {} } = data;

  return (
    <div className="space-y-4">
      {/* Expansion Opportunities */}
      {recommendations.expansion_opportunities?.length > 0 && (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardHeader>
            <CardTitle className="text-base text-emerald-900">🚀 Expansion Opportunities</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recommendations.expansion_opportunities.map((opp, i) => (
              <div key={i} className="p-3 bg-white rounded-lg border border-emerald-200">
                <div className="flex items-start gap-2 mb-1">
                  <ArrowRight className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                  <h4 className="font-semibold text-sm text-emerald-900">{opp.opportunity}</h4>
                </div>
                <p className="text-xs text-slate-600 ml-6 mb-2">{opp.rationale}</p>
                <Badge variant="outline" className="text-xs bg-emerald-100 text-emerald-800 border-emerald-300">
                  Impact: {opp.expected_impact}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Partnership Recommendations */}
      {recommendations.partnership_recommendations?.length > 0 && (
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="text-base text-blue-900">🤝 Partnership Recommendations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recommendations.partnership_recommendations.map((rec, i) => (
              <div key={i} className="p-3 bg-white rounded-lg border border-blue-200">
                <div className="flex items-start justify-between mb-2">
                  <h4 className="font-semibold text-sm text-blue-900">{rec.focus_area}</h4>
                  <Badge 
                    variant="outline" 
                    className={`text-xs ${
                      rec.priority === 'High' ? 'bg-red-100 text-red-800 border-red-300' :
                      rec.priority === 'Medium' ? 'bg-yellow-100 text-yellow-800 border-yellow-300' :
                      'bg-green-100 text-green-800 border-green-300'
                    }`}
                  >
                    {rec.priority} Priority
                  </Badge>
                </div>
                <p className="text-xs text-slate-600">{rec.action}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Gap Filling Strategies */}
      {recommendations.gap_filling_strategies?.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <CardTitle className="text-base text-amber-900">🎯 Gap Filling Strategies</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recommendations.gap_filling_strategies.map((strategy, i) => (
              <div key={i} className="p-3 bg-white rounded-lg border border-amber-200">
                <div className="flex items-start gap-2 mb-1">
                  <span className="font-bold text-amber-600">{strategy.specialty}</span>
                </div>
                <p className="text-xs text-slate-600 mb-2">{strategy.strategy}</p>
                <Badge variant="outline" className="text-xs bg-amber-100 text-amber-800 border-amber-300">
                  Timeline: {strategy.timeline}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Overall Influence Strategy */}
      {recommendations.influence_strategy && (
        <Card className="border-purple-200 bg-gradient-to-r from-purple-50 to-violet-50">
          <CardHeader>
            <CardTitle className="text-base text-purple-900">📊 Influence Strategy</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-700 leading-relaxed">{recommendations.influence_strategy}</p>
          </CardContent>
        </Card>
      )}

      <Button 
        onClick={handleGetRecommendations} 
        disabled={loading} 
        variant="outline" 
        className="w-full gap-2"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        Refresh Recommendations
      </Button>
    </div>
  );
}
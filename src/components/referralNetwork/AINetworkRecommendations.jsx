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
      <Card className="bg-gradient-to-br from-violet-50 to-purple-50 border-violet-500/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-violet-400">
            <Lightbulb className="w-5 h-5" />
            AI Network Optimization
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-violet-400 mb-4">
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
        <Card className="border-emerald-500/30 bg-emerald-900/20">
          <CardHeader>
            <CardTitle className="text-base text-emerald-400">🚀 Expansion Opportunities</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recommendations.expansion_opportunities.map((opp, i) => (
              <div key={i} className="p-3 bg-slate-800/60 rounded-lg border border-emerald-500/30">
                <div className="flex items-start gap-2 mb-1">
                  <ArrowRight className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                  <h4 className="font-semibold text-sm text-emerald-400">{opp.opportunity}</h4>
                </div>
                <p className="text-xs text-slate-400 ml-6 mb-2">{opp.rationale}</p>
                <Badge variant="outline" className="text-xs bg-emerald-900/30 text-emerald-300 border-emerald-300">
                  Impact: {opp.expected_impact}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Partnership Recommendations */}
      {recommendations.partnership_recommendations?.length > 0 && (
        <Card className="border-blue-500/30 bg-blue-900/20">
          <CardHeader>
            <CardTitle className="text-base text-blue-400">🤝 Partnership Recommendations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recommendations.partnership_recommendations.map((rec, i) => (
              <div key={i} className="p-3 bg-slate-800/60 rounded-lg border border-blue-500/30">
                <div className="flex items-start justify-between mb-2">
                  <h4 className="font-semibold text-sm text-blue-300">{rec.focus_area}</h4>
                  <Badge 
                    variant="outline" 
                    className={`text-xs ${
                      rec.priority === 'High' ? 'bg-red-900/30 text-red-400 border-red-500/30' :
                      rec.priority === 'Medium' ? 'bg-yellow-900/30 text-yellow-400 border-yellow-500/30' :
                      'bg-green-900/30 text-green-400 border-green-500/30'
                    }`}
                  >
                    {rec.priority} Priority
                  </Badge>
                </div>
                <p className="text-xs text-slate-400">{rec.action}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Gap Filling Strategies */}
      {recommendations.gap_filling_strategies?.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-900/20">
          <CardHeader>
            <CardTitle className="text-base text-amber-400">🎯 Gap Filling Strategies</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recommendations.gap_filling_strategies.map((strategy, i) => (
              <div key={i} className="p-3 bg-slate-800/60 rounded-lg border border-amber-500/30">
                <div className="flex items-start gap-2 mb-1">
                  <span className="font-bold text-amber-600">{strategy.specialty}</span>
                </div>
                <p className="text-xs text-slate-400 mb-2">{strategy.strategy}</p>
                <Badge variant="outline" className="text-xs bg-amber-900/30 text-amber-400 border-amber-500/30">
                  Timeline: {strategy.timeline}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Overall Influence Strategy */}
      {recommendations.influence_strategy && (
        <Card className="border-purple-500/30 bg-purple-900/20">
          <CardHeader>
            <CardTitle className="text-base text-purple-400">📊 Influence Strategy</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-400 leading-relaxed">{recommendations.influence_strategy}</p>
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
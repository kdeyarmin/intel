import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BrainCircuit, Target, Zap, Loader2, TrendingUp } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';

export default function AIPredictiveOutreachCard({ provider, onUpdate }) {
  const [loading, setLoading] = useState(false);

  const calculateScore = async () => {
    setLoading(true);
    try {
      await base44.functions.invoke('calculateOutreachScore', { npi: provider.npi });
      toast.success('Outreach score updated');
      if (onUpdate) onUpdate();
    } catch (error) {
      toast.error('Failed to calculate score');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const hasScore = provider.ai_outreach_score !== undefined && provider.ai_outreach_score !== null;

  return (
    <Card className="bg-gradient-to-br from-slate-50 to-white border-indigo-100">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2 text-indigo-700">
            <BrainCircuit className="w-5 h-5" />
            AI Outreach Prioritization
          </CardTitle>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={calculateScore} 
            disabled={loading}
            className="h-8 text-xs bg-white"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 mr-1.5 text-amber-500" />}
            {hasScore ? 'Recalculate' : 'Analyze'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!hasScore ? (
          <div className="text-center py-6 text-slate-500 text-sm">
            <Target className="w-8 h-8 mx-auto mb-2 opacity-20" />
            <p>Run AI analysis to predict engagement likelihood and optimal strategy based on enriched data.</p>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              <div className="flex flex-col items-center justify-center bg-white rounded-full w-16 h-16 shadow-sm border border-indigo-50">
                <span className="text-2xl font-bold text-indigo-600">{provider.ai_outreach_score}</span>
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-medium">Engagement Likelihood</span>
                  <Badge variant={provider.ai_outreach_score > 75 ? "default" : provider.ai_outreach_score > 40 ? "secondary" : "destructive"} className={provider.ai_outreach_score > 75 ? "bg-emerald-500 hover:bg-emerald-600" : ""}>
                    {provider.ai_outreach_score > 75 ? 'High' : provider.ai_outreach_score > 40 ? 'Medium' : 'Low'}
                  </Badge>
                </div>
                <Progress value={provider.ai_outreach_score} className="h-2 bg-slate-100" />
              </div>
            </div>

            {provider.ai_outreach_strategy && (
              <div className="bg-indigo-50/50 p-3 rounded-md border border-indigo-100/50">
                <p className="text-xs font-semibold text-indigo-800 mb-1 flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5" /> Optimal Strategy
                </p>
                <p className="text-sm text-slate-700 leading-relaxed">
                  {provider.ai_outreach_strategy}
                </p>
              </div>
            )}

            {provider.ai_engagement_factors && provider.ai_engagement_factors.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5" /> Key Factors
                </p>
                <ul className="space-y-1.5">
                  {provider.ai_engagement_factors.map((factor, idx) => (
                    <li key={idx} className="text-sm text-slate-600 flex items-start gap-2">
                      <span className="text-indigo-400 mt-0.5">•</span>
                      <span className="flex-1">{factor}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
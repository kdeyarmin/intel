import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BrainCircuit, Target, Zap, Loader2, TrendingUp } from 'lucide-react';
import { invokeOrThrow, toastFunctionError } from '@/api/functionResult';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';

const COMPONENT_LABELS = {
  reachability: ['Reachability', 35],
  volume: ['Medicare volume', 25],
  network: ['Referral network', 20],
  engagement: ['Past engagement', 10],
  completeness: ['Profile completeness', 10],
};

export default function AIPredictiveOutreachCard({ provider, onUpdate }) {
  const [loading, setLoading] = useState(false);
  // The latest calculation, shown immediately (the provider prop refreshes via onUpdate).
  const [lastResult, setResult] = useState(null);
  // Only for this provider: the card stays mounted when the profile switches to
  // another NPI, and a response can arrive after that.
  const result = lastResult?.npi === provider.npi ? lastResult : null;

  const stored = provider.ai_engagement_factors;
  const score = result?.score ?? provider.ai_outreach_score;
  const strategy = result?.strategy ?? provider.ai_outreach_strategy;
  const factors = result?.factors ?? (Array.isArray(stored) ? stored : stored?.factors) ?? [];
  const components = result?.components ?? stored?.components ?? null;

  const calculateScore = async () => {
    setLoading(true);
    try {
      const data = await invokeOrThrow('calculateOutreachScore', { npi: provider.npi, with_ai: true });
      setResult(data);
      toast.success('Outreach score updated');
      if (onUpdate) onUpdate();
    } catch (error) {
      toastFunctionError(error, 'Failed to calculate score');
    } finally {
      setLoading(false);
    }
  };

  const hasScore = score !== undefined && score !== null;

  return (
    <Card className="bg-gradient-to-br from-slate-800/40 to-slate-900 border-indigo-500/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2 text-indigo-400">
            <BrainCircuit className="w-5 h-5" />
            AI Outreach Prioritization
          </CardTitle>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={calculateScore} 
            disabled={loading}
            className="h-8 text-xs bg-slate-800/60"
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
            <p>Score how reachable and valuable this provider is to contact, from their contact details, Medicare volume, referral network and past outreach.</p>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              <div className="flex flex-col items-center justify-center bg-slate-800/60 rounded-full w-16 h-16 shadow-sm border border-indigo-50">
                <span className="text-2xl font-bold text-indigo-600">{Math.round(score)}</span>
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-medium">Engagement Likelihood</span>
                  <Badge variant={score > 75 ? "default" : score > 40 ? "secondary" : "destructive"} className={score > 75 ? "bg-emerald-900/20 hover:bg-emerald-600" : ""}>
                    {score > 75 ? 'High' : score > 40 ? 'Medium' : 'Low'}
                  </Badge>
                </div>
                <Progress value={score} className="h-2 bg-slate-700" />
              </div>
            </div>

            {components && (
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {Object.entries(COMPONENT_LABELS).map(([key, [label, max]]) => (
                  <div key={key} className="flex items-center justify-between rounded bg-slate-800/50 px-2.5 py-1.5 text-xs">
                    <span className="text-slate-400">{label}</span>
                    <span className="font-medium text-slate-200">{components[key] ?? 0}/{max}</span>
                  </div>
                ))}
              </div>
            )}

            {strategy && (
              <div className="bg-indigo-900/20 p-3 rounded-md border border-indigo-500/30">
                <p className="text-xs font-semibold text-indigo-300 mb-1 flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5" /> Optimal Strategy
                </p>
                <p className="text-sm text-slate-300 leading-relaxed">
                  {strategy}
                </p>
              </div>
            )}

            {factors.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5" /> Key Factors
                </p>
                <ul className="space-y-1.5">
                  {factors.map((factor, idx) => (
                    <li key={idx} className="text-sm text-slate-400 flex items-start gap-2">
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
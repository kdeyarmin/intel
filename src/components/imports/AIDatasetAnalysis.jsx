import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2, AlertTriangle, TrendingUp, BarChart, CheckCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

export default function AIDatasetAnalysis({ batch }) {
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  const handleAnalyze = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('analyzeImportedDataset', { batch_id: batch.id });
      if (res.data.success) {
        toast.success('Analysis complete');
        queryClient.invalidateQueries();
      } else {
        toast.error(res.data.error || 'Analysis failed');
      }
    } catch (e) {
      toast.error(e.response?.data?.error || e.message || 'Error running analysis');
    } finally {
      setLoading(false);
    }
  };

  const analysis = batch.ai_analysis;

  if (!analysis && !loading) {
    return (
      <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-5 text-center space-y-3 mt-4">
        <Sparkles className="w-8 h-8 text-cyan-400 mx-auto opacity-50" />
        <div>
          <h4 className="text-sm font-semibold text-slate-200">AI Dataset Analysis</h4>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            Analyze the imported data to identify quality issues, anomalies, and summarize key metrics.
          </p>
        </div>
        <Button onClick={handleAnalyze} className="bg-cyan-600 hover:bg-cyan-700 text-white h-8 text-xs">
          Generate Analysis
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-8 text-center space-y-3 mt-4">
        <Loader2 className="w-8 h-8 text-cyan-400 mx-auto animate-spin" />
        <p className="text-sm text-slate-300 animate-pulse">Analyzing dataset with AI...</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4 space-y-4 mt-4">
      <div className="flex items-center gap-2 mb-2 pb-3 border-b border-slate-700/50">
        <Sparkles className="w-5 h-5 text-cyan-400" />
        <h4 className="text-sm font-semibold text-slate-200">AI Dataset Analysis</h4>
      </div>
      
      <div className="space-y-4">
        <div>
          <h5 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 mb-2">
            <BarChart className="w-3.5 h-3.5 text-blue-400" /> Key Metrics Summary
          </h5>
          <p className="text-xs text-slate-400 leading-relaxed bg-slate-900/50 p-3 rounded-md">
            {analysis.key_metrics_summary}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h5 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 mb-2">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> Trends & Anomalies
            </h5>
            <ul className="space-y-1.5">
              {analysis.trends_anomalies?.map((item, i) => (
                <li key={i} className="text-xs text-slate-400 flex items-start gap-2 bg-slate-900/50 p-2 rounded-md">
                  <span className="text-emerald-500 mt-0.5">•</span>
                  <span>{item}</span>
                </li>
              ))}
              {(!analysis.trends_anomalies || analysis.trends_anomalies.length === 0) && (
                <li className="text-xs text-slate-500 italic">No significant trends or anomalies identified.</li>
              )}
            </ul>
          </div>
          
          <div>
            <h5 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 mb-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" /> Data Quality Issues
            </h5>
            <ul className="space-y-1.5">
              {analysis.quality_issues?.map((item, i) => (
                <li key={i} className="text-xs text-slate-400 flex items-start gap-2 bg-slate-900/50 p-2 rounded-md">
                  <span className="text-amber-500 mt-0.5">•</span>
                  <span>{item}</span>
                </li>
              ))}
              {(!analysis.quality_issues || analysis.quality_issues.length === 0) && (
                <li className="text-xs text-slate-500 italic flex items-center gap-1">
                  <CheckCircle className="w-3 h-3 text-emerald-500" /> No obvious data quality issues.
                </li>
              )}
            </ul>
          </div>
        </div>
        
        {analysis.overall_assessment && (
          <div className="pt-3 border-t border-slate-700/50">
            <h5 className="text-xs font-semibold text-slate-300 mb-1">Overall Assessment</h5>
            <p className="text-xs text-slate-400">{analysis.overall_assessment}</p>
          </div>
        )}
      </div>
    </div>
  );
}
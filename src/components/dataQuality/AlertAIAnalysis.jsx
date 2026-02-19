import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles, Lightbulb, AlertTriangle, Wrench } from 'lucide-react';

export default function AlertAIAnalysis({ alert }) {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(
    alert.ai_root_cause ? {
      root_cause: alert.ai_root_cause,
      solutions: alert.ai_solutions || [],
      impact_assessment: alert.ai_impact_assessment || '',
    } : null
  );
  const queryClient = useQueryClient();

  const runAnalysis = async () => {
    setLoading(true);
    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a healthcare data quality expert. Analyze this data quality alert and provide root cause analysis and actionable solutions.

ALERT DETAILS:
- Summary: ${alert.summary}
- Category: ${alert.category}
- Severity: ${alert.severity}
- Entity Type: ${alert.entity_type || 'N/A'}
- NPI: ${alert.npi || 'N/A'}
- Field: ${alert.field_name || 'N/A'}
- Current Value: ${alert.current_value || 'N/A'}
- Suggested Value: ${alert.suggested_value || 'N/A'}
- Rule: ${alert.rule_name}
- Affected Records: ${alert.affected_count || 1}

Provide:
1. The most likely root cause of this data quality issue (be specific to healthcare/provider data)
2. 3-5 actionable solutions, ordered from quickest fix to most comprehensive
3. An impact assessment: what downstream effects this issue has on outreach campaigns, lead scoring, and analytics`,
      response_json_schema: {
        type: "object",
        properties: {
          root_cause: { type: "string" },
          solutions: { type: "array", items: { type: "string" } },
          impact_assessment: { type: "string" }
        }
      }
    });

    setAnalysis(res);

    await base44.entities.DataQualityAlert.update(alert.id, {
      ai_root_cause: res.root_cause,
      ai_solutions: res.solutions,
      ai_impact_assessment: res.impact_assessment,
      ai_analyzed_at: new Date().toISOString(),
    });
    queryClient.invalidateQueries({ queryKey: ['dqAlerts'] });
    setLoading(false);
  };

  if (!analysis) {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={(e) => { e.stopPropagation(); runAnalysis(); }}
        disabled={loading}
        className="text-xs h-7 gap-1 border-violet-200 text-violet-600 hover:bg-violet-50"
      >
        {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
        {loading ? 'Analyzing...' : 'AI Analyze'}
      </Button>
    );
  }

  return (
    <div className="space-y-2.5 mt-2">
      {/* Root Cause */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 mb-1">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
          <span className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide">Root Cause</span>
        </div>
        <p className="text-xs text-amber-900 leading-relaxed">{analysis.root_cause}</p>
      </div>

      {/* Solutions */}
      {analysis.solutions?.length > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Wrench className="w-3.5 h-3.5 text-emerald-600" />
            <span className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wide">Solutions</span>
          </div>
          <div className="space-y-1">
            {analysis.solutions.map((s, i) => (
              <div key={i} className="flex items-start gap-2">
                <Badge className="bg-emerald-200 text-emerald-800 text-[8px] shrink-0 mt-0.5 h-4 w-4 flex items-center justify-center p-0 rounded-full">{i + 1}</Badge>
                <p className="text-xs text-emerald-900">{s}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Impact */}
      {analysis.impact_assessment && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <Lightbulb className="w-3.5 h-3.5 text-blue-600" />
            <span className="text-[10px] font-semibold text-blue-700 uppercase tracking-wide">Impact Assessment</span>
          </div>
          <p className="text-xs text-blue-900 leading-relaxed">{analysis.impact_assessment}</p>
        </div>
      )}

      <Button
        size="sm"
        variant="ghost"
        onClick={(e) => { e.stopPropagation(); runAnalysis(); }}
        disabled={loading}
        className="text-[10px] h-6 gap-1 text-violet-500"
      >
        {loading ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Sparkles className="w-2.5 h-2.5" />}
        Re-analyze
      </Button>
    </div>
  );
}
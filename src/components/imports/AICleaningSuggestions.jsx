import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Loader2, AlertTriangle, CheckCircle2, Wrench, ChevronDown, ChevronUp } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function AICleaningSuggestions({ importType, fileName, invalidRows, duplicateRows, totalRows, errorSamples = [] }) {
  const [suggestions, setSuggestions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const hasIssues = (invalidRows > 0 || duplicateRows > 0 || errorSamples.length > 0);
  if (!hasIssues) return null;

  const analyze = async () => {
    setLoading(true);
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `You are a data quality expert for healthcare imports (NPPES, CMS Medicare datasets).

Import type: ${importType}
File: ${fileName}
Total rows: ${totalRows}
Invalid rows: ${invalidRows}
Duplicate rows: ${duplicateRows}

Sample errors:
${errorSamples.slice(0, 10).map((e, i) => `${i + 1}. Row ${e.row || '?'}: ${e.message || e.detail || JSON.stringify(e)}`).join('\n')}

Analyze these import errors and provide:
1. A brief root cause summary (1-2 sentences)
2. 3-5 specific, actionable data cleaning steps the user should take before re-importing
3. Whether the file can likely be fixed without re-downloading from the source

Be specific to healthcare/CMS data patterns. Use plain language.`,
        response_json_schema: {
          type: 'object',
          properties: {
            root_cause: { type: 'string', description: 'Brief root cause summary' },
            steps: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  action: { type: 'string', description: 'What to do' },
                  detail: { type: 'string', description: 'How to do it' },
                  impact: { type: 'string', enum: ['high', 'medium', 'low'], description: 'Expected impact' },
                },
              },
            },
            fixable_locally: { type: 'boolean', description: 'Can be fixed without re-downloading' },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          },
        },
      });
      setSuggestions(result);
    } catch (err) {
      setSuggestions({ root_cause: 'Unable to analyze errors.', steps: [], fixable_locally: false, confidence: 'low' });
    } finally {
      setLoading(false);
    }
  };

  const impactColors = {
    high: 'bg-emerald-900/30 text-emerald-300 border-emerald-700',
    medium: 'bg-yellow-900/30 text-yellow-300 border-yellow-700',
    low: 'bg-slate-700 text-slate-300 border-slate-600',
  };

  return (
    <Card className="border-amber-500/20 bg-amber-500/5">
      <CardHeader className="pb-2">
        <button className="flex items-center justify-between w-full text-left" onClick={() => setExpanded(!expanded)}>
          <CardTitle className="text-sm flex items-center gap-2 text-amber-300">
            <Wrench className="w-4 h-4" />
            AI Data Cleaning Suggestions
          </CardTitle>
          {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>
      </CardHeader>
      {expanded && (
        <CardContent className="pt-0 space-y-3">
          {/* Issue summary */}
          <div className="flex gap-3 flex-wrap text-xs">
            {invalidRows > 0 && (
              <div className="flex items-center gap-1 text-red-400">
                <AlertTriangle className="w-3 h-3" /> {invalidRows.toLocaleString()} invalid rows
              </div>
            )}
            {duplicateRows > 0 && (
              <div className="flex items-center gap-1 text-yellow-400">
                <AlertTriangle className="w-3 h-3" /> {duplicateRows.toLocaleString()} duplicates
              </div>
            )}
          </div>

          {!suggestions && !loading && (
            <Button
              onClick={analyze}
              size="sm"
              variant="outline"
              className="bg-transparent border-amber-500/30 text-amber-300 hover:bg-amber-500/10 gap-2"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Analyze & Suggest Fixes
            </Button>
          )}

          {loading && (
            <div className="flex items-center gap-2 text-sm text-amber-300/70 py-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Analyzing errors with AI...
            </div>
          )}

          {suggestions && (
            <div className="space-y-3">
              {/* Root cause */}
              <div className="p-2.5 rounded-lg bg-slate-800/50 border border-slate-700/30">
                <p className="text-xs font-medium text-slate-400 mb-1">Root Cause</p>
                <p className="text-sm text-slate-200">{suggestions.root_cause}</p>
              </div>

              {/* Fixability */}
              <div className="flex items-center gap-2 text-xs">
                {suggestions.fixable_locally ? (
                  <Badge variant="outline" className="bg-emerald-900/30 text-emerald-300 border-emerald-700 gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Fixable locally
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-red-900/30 text-red-300 border-red-700 gap-1">
                    <AlertTriangle className="w-3 h-3" /> May need re-download
                  </Badge>
                )}
                <Badge variant="outline" className="bg-slate-700 text-slate-300 border-slate-600">
                  AI confidence: {suggestions.confidence}
                </Badge>
              </div>

              {/* Steps */}
              {suggestions.steps?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-slate-400">Recommended Steps</p>
                  {suggestions.steps.map((step, i) => (
                    <div key={i} className="flex gap-3 p-2.5 rounded-lg bg-slate-800/40 border border-slate-700/20">
                      <div className="flex-shrink-0 w-5 h-5 rounded-full bg-cyan-500/20 flex items-center justify-center text-[10px] font-bold text-cyan-400 mt-0.5">
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-sm font-medium text-slate-200">{step.action}</p>
                          <Badge variant="outline" className={`text-[9px] ${impactColors[step.impact] || impactColors.low}`}>
                            {step.impact} impact
                          </Badge>
                        </div>
                        <p className="text-xs text-slate-400">{step.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <Button
                onClick={analyze}
                size="sm"
                variant="ghost"
                className="text-xs text-slate-500 hover:text-slate-300"
              >
                Re-analyze
              </Button>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
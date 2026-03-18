import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sparkles, Loader2, AlertTriangle, CheckCircle2, Lightbulb,
  ChevronDown, ChevronRight, RotateCcw, SkipForward, Zap, Shield, Clock
} from 'lucide-react';
import { categorizeError, ERROR_CATEGORIES, getErrorMessage } from './errorCategories';

const PRIORITY_CONFIG = {
  critical: { label: 'Critical', color: 'bg-red-500/15 text-red-400 border-red-500/20', icon: AlertTriangle, sort: 0 },
  high: { label: 'High', color: 'bg-orange-500/15 text-orange-400 border-orange-500/20', icon: AlertTriangle, sort: 1 },
  medium: { label: 'Medium', color: 'bg-amber-500/15 text-amber-400 border-amber-500/20', icon: Clock, sort: 2 },
  low: { label: 'Low', color: 'bg-slate-500/15 text-slate-400 border-slate-500/20', icon: Shield, sort: 3 },
};

export default function AIErrorTriage({ errors, batch, onBulkAction }) {
  const [analysis, setAnalysis] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState(new Set());

  const errorSummary = useMemo(() => {
    if (!errors?.length) return null;
    const cats = {};
    for (const err of errors) {
      const msg = getErrorMessage(err);
      const cat = categorizeError(msg);
      if (!cats[cat]) cats[cat] = { count: 0, samples: [], fields: new Set(), sheets: new Set(), phases: new Set() };
      cats[cat].count++;
      if (cats[cat].samples.length < 3) cats[cat].samples.push(msg);
      if (err.field) cats[cat].fields.add(err.field);
      if (err.sheet) cats[cat].sheets.add(err.sheet);
      if (err.phase) cats[cat].phases.add(err.phase);
    }
    return cats;
  }, [errors]);

  const runAnalysis = async () => {
    if (!errors?.length) return;
    setIsAnalyzing(true);
    const summaryForAI = Object.entries(errorSummary).map(([cat, info]) => ({
      category: ERROR_CATEGORIES[cat]?.label || cat,
      count: info.count,
      samples: info.samples,
      fields: Array.from(info.fields),
      sheets: Array.from(info.sheets),
      phases: Array.from(info.phases),
    }));

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `You are an expert data import error analyst for a Medicare/CMS healthcare data platform.

Analyze these import errors and provide:
1. Priority ranking for each error group (critical/high/medium/low)
2. Root cause analysis
3. Specific actionable fix for each group
4. Recommended bulk action (retry, skip, or fix_data)
5. Whether errors are safe to ignore

Import type: ${batch?.import_type || 'unknown'}
File: ${batch?.file_name || 'unknown'}
Total errors: ${errors.length}
Total rows in batch: ${batch?.total_rows || 'unknown'}

Error groups:
${JSON.stringify(summaryForAI, null, 2)}`,
      response_json_schema: {
        type: "object",
        properties: {
          overall_assessment: { type: "string" },
          data_quality_score: { type: "number" },
          groups: {
            type: "array",
            items: {
              type: "object",
              properties: {
                category: { type: "string" },
                priority: { type: "string", enum: ["critical", "high", "medium", "low"] },
                root_cause: { type: "string" },
                fix_description: { type: "string" },
                recommended_action: { type: "string", enum: ["retry", "skip", "fix_data", "ignore"] },
                safe_to_ignore: { type: "boolean" },
                fix_steps: { type: "array", items: { type: "string" } },
                estimated_impact: { type: "string" }
              }
            }
          },
          batch_recommendation: { type: "string" },
          can_auto_resolve: { type: "boolean" }
        }
      }
    });
    setAnalysis(result);
    setIsAnalyzing(false);
    // auto-expand the first critical/high group
    const firstImportant = result.groups?.findIndex(g => g.priority === 'critical' || g.priority === 'high');
    if (firstImportant >= 0) setExpandedGroups(new Set([firstImportant]));
  };

  const toggleGroup = (idx) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  const sortedGroups = useMemo(() => {
    if (!analysis?.groups) return [];
    return [...analysis.groups].sort((a, b) =>
      (PRIORITY_CONFIG[a.priority]?.sort ?? 9) - (PRIORITY_CONFIG[b.priority]?.sort ?? 9)
    );
  }, [analysis]);

  if (!errors?.length) return null;

  return (
    <Card className="bg-gradient-to-br from-violet-500/5 to-cyan-500/5 border-violet-500/20">
      <CardContent className="py-4 px-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-400" />
            <span className="text-sm font-semibold text-slate-200">AI Error Triage</span>
            {analysis && (
              <Badge className="bg-violet-500/15 text-violet-400 text-[10px]">
                Score: {analysis.data_quality_score}/100
              </Badge>
            )}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs bg-transparent border-violet-500/30 text-violet-400 hover:bg-violet-500/10"
            onClick={runAnalysis}
            disabled={isAnalyzing}
          >
            {isAnalyzing ? (
              <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Analyzing...</>
            ) : analysis ? (
              <><RotateCcw className="w-3 h-3 mr-1" /> Re-analyze</>
            ) : (
              <><Zap className="w-3 h-3 mr-1" /> Analyze Errors</>
            )}
          </Button>
        </div>

        {!analysis && !isAnalyzing && (
          <p className="text-[11px] text-slate-500">
            AI will prioritize errors, identify root causes, and suggest bulk fixes across {errors.length} errors.
          </p>
        )}

        {isAnalyzing && (
          <div className="flex items-center justify-center py-6 gap-2">
            <Loader2 className="w-5 h-5 text-violet-400 animate-spin" />
            <span className="text-sm text-slate-400">Analyzing {errors.length} errors with AI...</span>
          </div>
        )}

        {analysis && (
          <div className="space-y-3">
            {/* Overall assessment */}
            <div className="bg-slate-800/40 rounded-lg p-3 border border-slate-700/30">
              <p className="text-[11px] text-slate-400 leading-relaxed">{analysis.overall_assessment}</p>
              {analysis.batch_recommendation && (
                <div className="flex items-start gap-2 mt-2 bg-cyan-500/5 border border-cyan-500/15 rounded-md p-2">
                  <Lightbulb className="w-3.5 h-3.5 text-yellow-400 mt-0.5 flex-shrink-0" />
                  <p className="text-[11px] text-cyan-400">{analysis.batch_recommendation}</p>
                </div>
              )}
            </div>

            {/* Priority-sorted error groups */}
            <ScrollArea className="max-h-[400px]">
              <div className="space-y-2">
                {sortedGroups.map((group, idx) => {
                  const pCfg = PRIORITY_CONFIG[group.priority] || PRIORITY_CONFIG.medium;
                  const PIcon = pCfg.icon;
                  const isExpanded = expandedGroups.has(idx);
                  const catKey = Object.keys(errorSummary).find(k =>
                    (ERROR_CATEGORIES[k]?.label || k) === group.category
                  );
                  const errorCount = catKey ? errorSummary[catKey]?.count : 0;

                  return (
                    <div key={idx} className="border border-slate-700/40 rounded-lg overflow-hidden bg-slate-800/20">
                      <button
                        onClick={() => toggleGroup(idx)}
                        className="w-full flex items-center gap-2.5 p-3 text-left hover:bg-slate-700/15 transition-colors"
                      >
                        <PIcon className={`w-4 h-4 flex-shrink-0 ${pCfg.color.split(' ')[1]}`} />
                        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                          <Badge className={`${pCfg.color} text-[9px]`}>{pCfg.label}</Badge>
                          <span className="text-xs font-medium text-slate-300">{group.category}</span>
                          <Badge className="bg-slate-700/50 text-slate-400 text-[9px]">{errorCount} errors</Badge>
                          {group.safe_to_ignore && (
                            <Badge className="bg-emerald-500/15 text-emerald-400 text-[9px]">Safe to ignore</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {group.recommended_action && onBulkAction && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className={`h-6 text-[10px] px-2 ${
                                group.recommended_action === 'retry' ? 'text-cyan-400 hover:text-cyan-300' :
                                group.recommended_action === 'skip' || group.recommended_action === 'ignore' ? 'text-amber-400 hover:text-amber-300' :
                                'text-violet-400 hover:text-violet-300'
                              }`}
                              onClick={(e) => {
                                e.stopPropagation();
                                onBulkAction(group.recommended_action, group.category, catKey);
                              }}
                            >
                              {group.recommended_action === 'retry' && <><RotateCcw className="w-3 h-3 mr-0.5" /> Retry</>}
                              {group.recommended_action === 'skip' && <><SkipForward className="w-3 h-3 mr-0.5" /> Skip</>}
                              {group.recommended_action === 'ignore' && <><CheckCircle2 className="w-3 h-3 mr-0.5" /> Dismiss</>}
                              {group.recommended_action === 'fix_data' && <><Lightbulb className="w-3 h-3 mr-0.5" /> Fix</>}
                            </Button>
                          )}
                          {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="border-t border-slate-700/30 p-3 space-y-2.5">
                          <div>
                            <p className="text-[10px] font-semibold text-slate-500 mb-1">Root Cause</p>
                            <p className="text-[11px] text-slate-400">{group.root_cause}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold text-slate-500 mb-1">Impact</p>
                            <p className="text-[11px] text-slate-400">{group.estimated_impact}</p>
                          </div>
                          {group.fix_steps?.length > 0 && (
                            <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-md p-2.5">
                              <p className="text-[10px] font-semibold text-emerald-400 mb-1 flex items-center gap-1">
                                <Lightbulb className="w-3 h-3" /> How to Fix
                              </p>
                              <ol className="space-y-0.5">
                                {group.fix_steps.map((step, i) => (
                                  <li key={i} className="text-[11px] text-slate-400 flex gap-1.5">
                                    <span className="text-slate-500 flex-shrink-0">{i + 1}.</span>
                                    {step}
                                  </li>
                                ))}
                              </ol>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
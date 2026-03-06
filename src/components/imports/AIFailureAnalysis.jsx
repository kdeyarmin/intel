import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2, AlertTriangle, CheckCircle2, RefreshCw, ChevronDown, ChevronUp, Wrench, Zap, FileEdit, Download, Settings } from 'lucide-react';

function classifyErrorPhase(errorSamples) {
  if (!errorSamples?.length) return 'unknown';
  const phases = errorSamples.map(e => e.phase || '');
  if (phases.includes('download') || phases.includes('rate_limit')) return 'network';
  if (phases.includes('extraction') || phases.includes('parsing')) return 'format';
  if (phases.includes('validation')) return 'validation';
  if (phases.includes('import')) return 'import';
  return 'unknown';
}

export default function AIFailureAnalysis({ batch, onRetryWithSettings, compact = false }) {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(!compact);
  const [autoAnalyzed, setAutoAnalyzed] = useState(false);

  // Auto-trigger analysis for failed batches
  useEffect(() => {
    if (batch?.status === 'failed' && !analysis && !autoAnalyzed) {
      setAutoAnalyzed(true);
      runAnalysis();
    }
  }, [batch?.id, batch?.status]);

  const runAnalysis = async () => {
    if (!batch) return;
    setLoading(true);
    try {
      const errorPhase = classifyErrorPhase(batch.error_samples);
      const errorDetails = (batch.error_samples || []).slice(0, 10).map(e => 
        `[${e.phase || 'unknown'}] ${e.detail || e.message || 'No detail'} (row: ${e.row || 'N/A'}, sheet: ${e.sheet || 'N/A'})`
      ).join('\n');

      const dedupSummary = batch.dedup_summary ? JSON.stringify(batch.dedup_summary) : 'N/A';
      const sheetInfo = batch.column_mapping?.sheets 
        ? batch.column_mapping.sheets.map(s => `${s.sheet}: ${s.valid} valid, ${s.invalid} invalid`).join('; ')
        : 'N/A';
        
      let retryPolicyInfo = '';
      try {
        const configs = await base44.entities.NPPESCrawlerConfig.filter({ config_key: 'default' });
        const config = configs[0] || {};
        if (config.auto_retry_enabled) {
           retryPolicyInfo = `\nRETRY POLICY:\n- Auto Retry: Enabled\n- Delay: ${config.retry_delay_minutes} mins\n- Max Retries before escalation: ${config.retry_escalation_threshold || 3}`;
        }
      } catch(e) {}

      const res = await base44.integrations.Core.InvokeLLM({
        prompt: `You are a data import failure analyst. Analyze this failed import batch and provide a structured diagnosis.

BATCH DETAILS:
- Import type: ${batch.import_type}
- File: ${batch.file_name}
- File URL: ${batch.file_url || 'N/A'}
- Status: ${batch.status}
- Total rows: ${batch.total_rows || 0}
- Valid rows: ${batch.valid_rows || 0}
- Invalid rows: ${batch.invalid_rows || 0}
- Imported rows: ${batch.imported_rows || 0}
- Retry count: ${batch.retry_count || 0}
- Error phase classification: ${errorPhase}

SHEET BREAKDOWN: ${sheetInfo}
VALIDATION SUMMARY: ${dedupSummary}
${retryPolicyInfo}

ERROR SAMPLES (up to 10):
${errorDetails || 'No error samples available'}

${batch.cancel_reason ? `CANCEL/PAUSE REASON: ${batch.cancel_reason}` : ''}

Analyze the root cause and provide actionable recommendations. Consider:
1. Is this a data format/schema issue, network/rate-limit issue, or data quality issue?
2. What specific fields or rows are problematic?
3. Are there common data formatting issues (e.g., incorrect date formats, invalid zip codes, phone number patterns)?
4. Suggest specific data cleaning steps or source file corrections if applicable.
5. Can this be fixed by retrying with different settings, or what retry mode would be most effective?
6. Determine the best resolution path: 'retry_as_is' for transient errors, 'schema_change' for mapping/schema issues, or 'manual_file_cleanup' for bad data.

Be specific and actionable. Reference actual error details from the samples.`,
        response_json_schema: {
          type: "object",
          properties: {
            root_cause: { type: "string", description: "Brief root cause summary (1-2 sentences)" },
            error_category: { type: "string", enum: ["network_error", "rate_limit", "data_format", "schema_mismatch", "missing_fields", "data_quality", "timeout", "configuration", "unknown"] },
            resolution_path: { type: "string", enum: ["retry_as_is", "schema_change", "manual_file_cleanup"] },
            resolution_explanation: { type: "string" },
            severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
            affected_area: { type: "string", description: "Which part of the data/process is affected" },
            data_cleaning_suggestions: { type: "string", description: "Specific steps to clean source data, e.g. date formats or zip codes" },
            recommendations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  action: { type: "string" },
                  priority: { type: "string", enum: ["high", "medium", "low"] },
                  automated: { type: "boolean", description: "Can this be fixed automatically via retry settings?" }
                }
              }
            },
            suggested_retry: {
              type: "object",
              properties: {
                mode: { type: "string", enum: ["full", "row_range", "resume", "criteria", "none"] },
                dry_run_first: { type: "boolean" },
                row_offset: { type: "number" },
                row_limit: { type: "number" },
                sheet_filter: { type: "string" },
                skip_validation: { type: "boolean" },
                explanation: { type: "string" }
              }
            },
            can_auto_fix: { type: "boolean", description: "Whether the issue can likely be resolved by retrying with suggested settings" },
            confidence: { type: "string", enum: ["high", "medium", "low"] }
          }
        }
      });
      setAnalysis(res);
    } catch (err) {
      console.error('AI analysis failed:', err);
      setAnalysis({ error: true, root_cause: 'AI analysis could not complete. Please review error samples manually.' });
    } finally {
      setLoading(false);
    }
  };

  if (!batch || batch.status !== 'failed') return null;

  const severityColors = {
    low: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
    medium: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
    high: 'bg-orange-500/15 text-orange-400 border-orange-500/20',
    critical: 'bg-red-500/15 text-red-400 border-red-500/20',
  };

  const categoryLabels = {
    network_error: 'Network Error',
    rate_limit: 'Rate Limit',
    data_format: 'Data Format',
    schema_mismatch: 'Schema Mismatch',
    missing_fields: 'Missing Fields',
    data_quality: 'Data Quality',
    timeout: 'Timeout',
    configuration: 'Configuration',
    unknown: 'Unknown',
  };

  const priorityColors = {
    high: 'text-red-400',
    medium: 'text-amber-400',
    low: 'text-blue-400',
  };

  const handleSmartRetry = () => {
    if (analysis?.suggested_retry && onRetryWithSettings) {
      onRetryWithSettings(analysis.suggested_retry);
    }
  };

  return (
    <Card className="bg-[#141d30] border-purple-500/20">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2 text-slate-200">
            <Sparkles className="w-4 h-4 text-purple-400" />
            AI Failure Analysis
            {analysis && !analysis.error && (
              <Badge className={`text-[10px] border ${severityColors[analysis.severity] || severityColors.medium}`}>
                {analysis.severity}
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            {analysis && !loading && (
              <Button variant="ghost" size="sm" onClick={runAnalysis} className="h-6 text-[10px] text-slate-500 hover:text-slate-300 px-2">
                <RefreshCw className="w-3 h-3 mr-1" /> Re-analyze
              </Button>
            )}
            {compact && (
              <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)} className="h-6 w-6 p-0 text-slate-500">
                {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      {(expanded || !compact) && (
        <CardContent className="space-y-3">
          {loading && (
            <div className="flex items-center gap-3 p-4 bg-purple-500/5 rounded-lg border border-purple-500/10">
              <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
              <div>
                <p className="text-sm text-purple-300">Analyzing failure...</p>
                <p className="text-[11px] text-purple-400/60">Reviewing error patterns and suggesting fixes</p>
              </div>
            </div>
          )}

          {analysis && !analysis.error && !loading && (
            <>
              {/* Root Cause */}
              <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/40">
                <div className="flex items-start gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-slate-300">Root Cause</span>
                      <Badge className={`text-[9px] border ${severityColors[analysis.severity] || severityColors.medium}`}>
                        {categoryLabels[analysis.error_category] || analysis.error_category}
                      </Badge>
                      <Badge className="text-[9px] bg-slate-700/50 text-slate-400 border-slate-600">
                        {analysis.confidence} confidence
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">{analysis.root_cause}</p>
                    {analysis.affected_area && (
                      <p className="text-[11px] text-slate-500 mt-1">Affected: {analysis.affected_area}</p>
                    )}
                    {analysis.data_cleaning_suggestions && (
                      <div className="mt-2 p-2 bg-slate-900/50 rounded border border-slate-700/50">
                        <p className="text-[10px] font-semibold text-cyan-400 mb-1">Data Cleaning Suggestion</p>
                        <p className="text-[11px] text-slate-400 leading-relaxed">{analysis.data_cleaning_suggestions}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Recommendations */}
              {analysis.recommendations?.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                    <Wrench className="w-3 h-3" /> Recommendations
                  </p>
                  {analysis.recommendations.map((rec, idx) => (
                    <div key={idx} className="flex items-start gap-2 p-2 bg-slate-800/30 rounded border border-slate-700/30">
                      <CheckCircle2 className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${priorityColors[rec.priority]}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-slate-300">{rec.action}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-[9px] ${priorityColors[rec.priority]}`}>{rec.priority} priority</span>
                          {rec.automated && (
                            <Badge className="text-[8px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">auto-fixable</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Resolution Path */}
              {analysis.resolution_path && (
                <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/40">
                  <p className="text-xs font-semibold text-slate-300 mb-2">Recommended Resolution</p>
                  
                  {analysis.resolution_path === 'retry_as_is' && (
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-emerald-400 flex items-center gap-1.5"><RefreshCw className="w-4 h-4"/> Retry As-Is</p>
                        <p className="text-[11px] text-slate-400 mt-1">{analysis.resolution_explanation || 'This appears to be a transient error. A direct retry is recommended.'}</p>
                        
                        {analysis.suggested_retry?.mode && analysis.suggested_retry.mode !== 'none' && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            <Badge className="text-[9px] bg-slate-900/50 text-slate-400 border-slate-700">Mode: {analysis.suggested_retry.mode}</Badge>
                            {analysis.suggested_retry.row_offset > 0 && <Badge className="text-[9px] bg-amber-500/10 text-amber-400 border-amber-500/20">offset: {analysis.suggested_retry.row_offset}</Badge>}
                          </div>
                        )}
                      </div>
                      <Button onClick={handleSmartRetry} size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0 h-8 text-xs">
                        <Zap className="w-3.5 h-3.5 mr-1.5"/> Execute Retry
                      </Button>
                    </div>
                  )}

                  {analysis.resolution_path === 'schema_change' && (
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-amber-400 flex items-center gap-1.5"><Settings className="w-4 h-4"/> Schema / Mapping Change</p>
                        <p className="text-[11px] text-slate-400 mt-1">{analysis.resolution_explanation || 'The data structure does not match expectations. Adjust validation rules or mapping.'}</p>
                      </div>
                      <Button onClick={() => window.location.href = '/import-monitoring?tab=rules'} size="sm" variant="outline" className="shrink-0 h-8 text-xs border-amber-500/30 text-amber-400 hover:bg-amber-500/10">
                        <Settings className="w-3.5 h-3.5 mr-1.5"/> Adjust Rules
                      </Button>
                    </div>
                  )}

                  {analysis.resolution_path === 'manual_file_cleanup' && (
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-blue-400 flex items-center gap-1.5"><FileEdit className="w-4 h-4"/> Manual File Cleanup</p>
                        <p className="text-[11px] text-slate-400 mt-1">{analysis.resolution_explanation || 'Source file contains malformed data. Download, fix the errors, and re-upload.'}</p>
                      </div>
                      <Button onClick={() => window.open(batch.file_url, '_blank')} size="sm" variant="outline" className="shrink-0 h-8 text-xs border-blue-500/30 text-blue-400 hover:bg-blue-500/10">
                        <Download className="w-3.5 h-3.5 mr-1.5"/> Source File
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {!analysis.resolution_path && (
                <>
                  {/* Fallback Smart Retry Button */}
                  {analysis.can_auto_fix && analysis.suggested_retry?.mode !== 'none' && (
                    <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-lg p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-cyan-300 flex items-center gap-1.5 mb-1">
                            <Zap className="w-3.5 h-3.5" /> Smart Retry Available
                          </p>
                          <p className="text-[11px] text-cyan-400/70">{analysis.suggested_retry.explanation}</p>
                          <div className="flex flex-wrap gap-2 mt-1.5">
                            <Badge className="text-[9px] bg-slate-800/50 text-slate-400 border-slate-700">
                              Mode: {analysis.suggested_retry.mode}
                            </Badge>
                            {analysis.suggested_retry.dry_run_first && (
                              <Badge className="text-[9px] bg-blue-500/10 text-blue-400 border-blue-500/20">dry run first</Badge>
                            )}
                            {analysis.suggested_retry.sheet_filter && (
                              <Badge className="text-[9px] bg-violet-500/10 text-violet-400 border-violet-500/20">
                                sheet: {analysis.suggested_retry.sheet_filter}
                              </Badge>
                            )}
                            {analysis.suggested_retry.row_offset > 0 && (
                              <Badge className="text-[9px] bg-amber-500/10 text-amber-400 border-amber-500/20">
                                offset: {analysis.suggested_retry.row_offset}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          onClick={handleSmartRetry}
                          className="bg-cyan-600 hover:bg-cyan-700 text-white h-8 text-xs gap-1.5 shrink-0"
                        >
                          <Zap className="w-3.5 h-3.5" /> Smart Retry
                        </Button>
                      </div>
                    </div>
                  )}

                  {!analysis.can_auto_fix && (
                    <div className="bg-amber-500/5 border border-amber-500/15 rounded-lg p-2.5 text-[11px] text-amber-400/80 flex items-start gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span>This issue may require manual intervention (e.g., fixing the source file or updating the import configuration) before retrying.</span>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {analysis?.error && !loading && (
            <div className="text-xs text-slate-500 p-3 bg-slate-800/30 rounded-lg">
              {analysis.root_cause}
              <Button variant="ghost" size="sm" onClick={runAnalysis} className="h-6 text-[10px] text-cyan-500 hover:text-cyan-400 px-2 mt-2">
                <RefreshCw className="w-3 h-3 mr-1" /> Try Again
              </Button>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
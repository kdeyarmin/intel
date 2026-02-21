import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, Loader2, Clock, ExternalLink, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { DATA_DESTINATION_MAP, IMPORT_TYPE_LABELS } from './DataDestinationMap';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

function AIInsightBadge({ batch }) {
  const [insight, setInsight] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleAnalyze = async (e) => {
    e.stopPropagation();
    setLoading(true);
    try {
      const res = await base44.integrations.Core.InvokeLLM({
        prompt: `Analyze this data import and give a 1-2 sentence quality recommendation:
Import type: ${batch.import_type}
File: ${batch.file_name}
Total rows: ${batch.total_rows || 0}
Valid: ${batch.valid_rows || 0}
Invalid: ${batch.invalid_rows || 0}
Duplicates: ${batch.duplicate_rows || 0}
Imported: ${batch.imported_rows || 0}
Status: ${batch.status}
${batch.error_samples?.length ? 'Sample errors: ' + JSON.stringify(batch.error_samples.slice(0, 3)) : ''}

Provide a brief actionable recommendation about data quality.`,
        response_json_schema: {
          type: "object",
          properties: {
            quality_grade: { type: "string", enum: ["excellent", "good", "fair", "poor"] },
            recommendation: { type: "string" },
          }
        }
      });
      setInsight(res);
    } catch {
      toast.error('Could not analyze import');
    } finally {
      setLoading(false);
    }
  };

  if (insight) {
    const gradeColors = {
      excellent: 'text-emerald-400',
      good: 'text-cyan-400',
      fair: 'text-amber-400',
      poor: 'text-red-400'
    };
    return (
      <div className="mt-2 p-2 bg-slate-800/50 rounded-lg border border-slate-700/30">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-3 h-3 text-cyan-400" />
          <span className={`text-xs font-semibold capitalize ${gradeColors[insight.quality_grade] || 'text-slate-400'}`}>
            {insight.quality_grade}
          </span>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">{insight.recommendation}</p>
      </div>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleAnalyze}
      disabled={loading}
      className="h-6 text-[10px] text-cyan-500 hover:text-cyan-400 px-2 mt-1"
    >
      {loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Sparkles className="w-3 h-3 mr-1" />}
      AI Quality Check
    </Button>
  );
}

export default function RecentImportsList({ batches = [], showLimit = 10 }) {
  const [expanded, setExpanded] = useState(false);
  const displayBatches = expanded ? batches : batches.slice(0, showLimit);

  const statusIcon = (status) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
      case 'failed': return <XCircle className="w-4 h-4 text-red-400" />;
      case 'processing': case 'validating': return <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />;
      default: return <Clock className="w-4 h-4 text-slate-500" />;
    }
  };

  const statusColor = {
    completed: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    failed: 'bg-red-500/15 text-red-400 border-red-500/20',
    processing: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
    validating: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
    paused: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  };

  if (batches.length === 0) {
    return (
      <Card className="bg-[#141d30] border-slate-700/50">
        <CardContent className="py-12 text-center">
          <p className="text-slate-500">No imports yet — upload your first file above</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-[#141d30] border-slate-700/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg text-slate-200">Recent Imports</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {displayBatches.map(batch => {
          const dest = DATA_DESTINATION_MAP[batch.import_type];
          const label = IMPORT_TYPE_LABELS[batch.import_type] || batch.import_type?.replace(/_/g, ' ');

          return (
            <div key={batch.id} className="p-3 border border-slate-700/40 rounded-lg hover:bg-slate-800/20 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  {statusIcon(batch.status)}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-slate-200">{label}</span>
                      <Badge className={`text-[10px] border ${statusColor[batch.status] || 'bg-slate-700 text-slate-400'}`}>
                        {batch.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500 truncate mt-0.5">{batch.file_name}</p>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-500 flex-wrap">
                      {batch.total_rows > 0 && <span>{batch.total_rows.toLocaleString()} rows</span>}
                      {batch.imported_rows > 0 && <span className="text-emerald-400">{batch.imported_rows.toLocaleString()} imported</span>}
                      {batch.invalid_rows > 0 && <span className="text-red-400">{batch.invalid_rows.toLocaleString()} invalid</span>}
                      <span>{new Date(batch.created_date).toLocaleDateString()}</span>
                    </div>
                    {batch.status === 'completed' && <AIInsightBadge batch={batch} />}
                  </div>
                </div>
                {dest && (
                  <Link to={createPageUrl(dest.page)}>
                    <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1 bg-transparent border-slate-700 text-slate-400 hover:text-cyan-400 hover:border-cyan-500/30 shrink-0">
                      View {dest.label} <ExternalLink className="w-3 h-3" />
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          );
        })}

        {batches.length > showLimit && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="w-full text-xs text-slate-500 hover:text-slate-300"
          >
            {expanded ? <><ChevronUp className="w-3 h-3 mr-1" /> Show Less</> : <><ChevronDown className="w-3 h-3 mr-1" /> Show All ({batches.length})</>}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
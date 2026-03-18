import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { Sparkles, Loader2, CheckCircle2, ChevronDown } from 'lucide-react';

const IMPORT_TYPE_OPTIONS = [
  { id: 'nppes_monthly', label: 'NPPES Monthly', category: 'nppes' },
  { id: 'nppes_registry', label: 'NPPES Registry', category: 'nppes' },
  { id: 'cms_utilization', label: 'CMS Utilization', category: 'cms_claims' },
  { id: 'cms_part_d', label: 'CMS Part D', category: 'cms_claims' },
  { id: 'cms_order_referring', label: 'Order & Referring', category: 'cms_claims' },
  { id: 'hospice_enrollments', label: 'Hospice Enrollments', category: 'cms_enrollment' },
  { id: 'home_health_enrollments', label: 'Home Health Enrollments', category: 'cms_enrollment' },
  { id: 'home_health_cost_reports', label: 'HH Cost Reports', category: 'provider_data' },
  { id: 'nursing_home_chains', label: 'Nursing Home Chains', category: 'provider_data' },
  { id: 'provider_service_utilization', label: 'Provider Service Util', category: 'cms_claims' },
  { id: 'home_health_pdgm', label: 'Home Health PDGM', category: 'cms_claims' },
  { id: 'inpatient_drg', label: 'Inpatient DRG', category: 'cms_claims' },
  { id: 'provider_ownership', label: 'Provider Ownership', category: 'provider_data' },
  { id: 'medicare_hha_stats', label: 'Medicare HHA Stats', category: 'cms_statistics' },
  { id: 'medicare_ma_inpatient', label: 'Medicare MA Inpatient', category: 'cms_statistics' },
  { id: 'medicare_part_d_stats', label: 'Medicare Part D Stats', category: 'cms_statistics' },
  { id: 'medicare_snf_stats', label: 'Medicare SNF Stats', category: 'cms_statistics' },
];

const CATEGORY_OPTIONS = [
  { id: 'nppes', label: 'NPPES' },
  { id: 'cms_claims', label: 'CMS Claims' },
  { id: 'cms_enrollment', label: 'CMS Enrollment' },
  { id: 'cms_statistics', label: 'CMS Statistics' },
  { id: 'provider_data', label: 'Provider Data' },
  { id: 'other', label: 'Other' },
];

export default function AIBatchCategorizer({ fileName, fileHeaders, onSuggestionApplied }) {
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState(null);
  const [accepted, setAccepted] = useState(false);
  const [showOverride, setShowOverride] = useState(false);

  useEffect(() => {
    if (fileName && fileHeaders?.length > 0) {
      runAICategorization();
    }
  }, [fileName, fileHeaders]);

  const runAICategorization = async () => {
    setLoading(true);
    setSuggestion(null);
    setAccepted(false);

    const headersSample = (fileHeaders || []).slice(0, 30).join(', ');

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `Analyze this data import file and suggest the best import type and category.

File name: "${fileName}"
Column headers (first 30): ${headersSample}

Available import types: ${IMPORT_TYPE_OPTIONS.map(t => `${t.id} (${t.label})`).join(', ')}
Available categories: ${CATEGORY_OPTIONS.map(c => `${c.id} (${c.label})`).join(', ')}

Based on the file name and column headers, determine:
1. The most likely import_type
2. The category
3. A confidence score (0-100)
4. A brief reason for your suggestion`,
      response_json_schema: {
        type: 'object',
        properties: {
          import_type: { type: 'string' },
          category: { type: 'string' },
          confidence: { type: 'number' },
          reason: { type: 'string' },
        },
        required: ['import_type', 'category', 'confidence', 'reason'],
      },
    });

    setSuggestion(result);
    setLoading(false);
  };

  const handleAccept = () => {
    setAccepted(true);
    if (onSuggestionApplied && suggestion) {
      onSuggestionApplied({
        import_type: suggestion.import_type,
        category: suggestion.category,
      });
    }
  };

  const handleOverride = (importType, category) => {
    setAccepted(true);
    setShowOverride(false);
    setSuggestion(prev => ({ ...prev, import_type: importType, category, overridden: true }));
    if (onSuggestionApplied) {
      onSuggestionApplied({ import_type: importType, category });
    }
  };

  if (!fileName) return null;

  const typeLabel = IMPORT_TYPE_OPTIONS.find(t => t.id === suggestion?.import_type)?.label || suggestion?.import_type;
  const catLabel = CATEGORY_OPTIONS.find(c => c.id === suggestion?.category)?.label || suggestion?.category;
  const confidence = suggestion?.confidence || 0;

  return (
    <Card className="bg-gradient-to-r from-violet-500/5 to-cyan-500/5 border-violet-500/20">
      <CardContent className="py-3 px-4 space-y-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-violet-400" />
          <span className="text-xs font-semibold text-slate-200">AI Auto-Categorization</span>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-400" />
            Analyzing file name and headers...
          </div>
        )}

        {suggestion && !loading && (
          <div className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-slate-500">Type:</span>
                <Badge className="bg-cyan-500/15 text-cyan-400 text-[10px]">{typeLabel}</Badge>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-slate-500">Category:</span>
                <Badge className="bg-violet-500/15 text-violet-400 text-[10px]">{catLabel}</Badge>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-slate-500">Confidence:</span>
                <Badge className={`text-[10px] ${
                  confidence >= 80 ? 'bg-emerald-500/15 text-emerald-400' :
                  confidence >= 50 ? 'bg-amber-500/15 text-amber-400' :
                  'bg-red-500/15 text-red-400'
                }`}>{confidence}%</Badge>
              </div>
            </div>

            <p className="text-[11px] text-slate-500">{suggestion.reason}</p>

            {!accepted ? (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                  onClick={handleAccept}
                >
                  <CheckCircle2 className="w-3 h-3" /> Accept
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs bg-transparent border-slate-700 text-slate-400 hover:text-slate-200 gap-1"
                  onClick={() => setShowOverride(!showOverride)}
                >
                  <ChevronDown className="w-3 h-3" /> Choose Different
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {suggestion.overridden ? 'Manually set' : 'AI suggestion accepted'}
              </div>
            )}

            {showOverride && (
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3 space-y-2">
                <p className="text-[10px] text-slate-500 font-semibold">Select import type:</p>
                <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto">
                  {IMPORT_TYPE_OPTIONS.map(t => (
                    <button
                      key={t.id}
                      onClick={() => handleOverride(t.id, t.category)}
                      className="text-left text-[11px] px-2 py-1.5 rounded-md border border-slate-700/40 text-slate-300 hover:bg-cyan-500/10 hover:border-cyan-500/30 hover:text-cyan-400 transition-colors"
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
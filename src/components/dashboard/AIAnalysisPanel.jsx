import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, AlertTriangle, CheckCircle2, Info } from 'lucide-react';

const findings = [
  { type: 'critical', label: 'Missing Gender Info', detail: '53% of provider records have no gender information', icon: AlertTriangle },
  { type: 'warning', label: 'No Location Linked', detail: '50% of providers lack at least one associated location record', icon: AlertTriangle },
  { type: 'warning', label: 'No Taxonomy Linked', detail: '40% of providers have no taxonomy/specialty classification', icon: AlertTriangle },
  { type: 'info', label: 'Invalid ZIP Formats', detail: '9% of location records contain non-standard ZIP code formats', icon: Info },
  { type: 'success', label: 'Timeliness', detail: '100% — all records are from the most recent available data period', icon: CheckCircle2 },
  { type: 'success', label: 'Consistency', detail: '100% — no cross-entity conflicts or contradictory data detected', icon: CheckCircle2 },
];

const typeStyles = {
  critical: 'bg-red-50 border-red-200 text-red-700',
  warning: 'bg-amber-50 border-amber-200 text-amber-700',
  info: 'bg-blue-50 border-blue-200 text-blue-700',
  success: 'bg-emerald-50 border-emerald-200 text-emerald-700',
};

const iconStyles = {
  critical: 'text-red-500',
  warning: 'text-amber-500',
  info: 'text-blue-500',
  success: 'text-emerald-500',
};

export default function AIAnalysisPanel() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-500" />
            AI Analysis
          </CardTitle>
          <Badge className="bg-violet-100 text-violet-700 text-[10px]">Auto-generated</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Score summary */}
        <div className="flex items-center gap-4 p-3 rounded-lg bg-slate-50 border border-slate-200">
          <div className="text-center">
            <p className="text-2xl font-bold text-slate-900">88%</p>
            <p className="text-[10px] text-slate-500 font-medium">Overall Score</p>
          </div>
          <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="text-center">
              <p className="text-sm font-semibold text-emerald-600">100%</p>
              <p className="text-[10px] text-slate-500">Timeliness</p>
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-emerald-600">100%</p>
              <p className="text-[10px] text-slate-500">Consistency</p>
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-amber-600">80%</p>
              <p className="text-[10px] text-slate-500">Completeness</p>
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-red-600">70%</p>
              <p className="text-[10px] text-slate-500">Accuracy</p>
            </div>
          </div>
        </div>

        {/* Summary text */}
        <p className="text-xs text-slate-600 leading-relaxed">
          The data quality scan reveals an overall score of <strong>88%</strong>, with high timeliness and consistency (100%) but lower scores for completeness (80%) and accuracy (70%). Key issues identified include significant missing gender information (53%), a high percentage of providers lacking a location (50%) and taxonomy (40%), as well as a notable number of invalid ZIP code formats (9%). A total of <strong>20 alerts</strong> were generated from the scan of 200 providers, locations, and taxonomies.
        </p>

        {/* Findings */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-700">Key Findings</p>
          {findings.map((f, i) => {
            const Icon = f.icon;
            return (
              <div key={i} className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-xs ${typeStyles[f.type]}`}>
                <Icon className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${iconStyles[f.type]}`} />
                <div>
                  <span className="font-semibold">{f.label}:</span>{' '}
                  <span className="opacity-90">{f.detail}</span>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
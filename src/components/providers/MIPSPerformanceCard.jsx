import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Award, ChevronDown, ChevronUp, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';

function extractMIPSMetrics(perfRow) {
  const raw = perfRow?.raw_data || {};
  return {
    finalScore: raw.final_mips_score ?? raw.final_score ?? perfRow?.quality_rating,
    qualityScore: raw.quality_category_score ?? raw.quality_score,
    piScore: raw.pi_category_score ?? raw.promoting_interoperability_score,
    iaScore: raw.ia_category_score ?? raw.improvement_activities_score,
    costScore: raw.cost_category_score ?? raw.cost_score,
    orgName: raw.org_name ?? raw.practice_name ?? raw.group_name,
    practiceSize: raw.practice_size ?? raw.org_size,
    specialtyDesc: raw.provider_specialty ?? raw.clinician_specialty,
  };
}

export default function MIPSPerformanceCard({ mipsData }) {
  const [expanded, setExpanded] = useState(false);

  if (!mipsData?.has_data || !mipsData.by_year) return null;

  const years = Object.keys(mipsData.by_year).sort((a, b) => Number(b) - Number(a));
  if (years.length === 0) return null;

  const latestYear = years[0];
  const latestData = mipsData.by_year[latestYear];
  const perfRow = latestData?.performance?.[0];
  const metrics = extractMIPSMetrics(perfRow);

  const scoreColor = (score) => {
    if (score == null) return 'text-slate-400';
    if (score >= 80) return 'text-emerald-400';
    if (score >= 60) return 'text-amber-400';
    return 'text-red-400';
  };

  return (
    <Card className="bg-slate-800/50 border-slate-700/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2 text-slate-200">
            <Award className="w-4 h-4 text-violet-400" />
            MIPS Performance
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge className="bg-violet-900/30 text-violet-400 border-violet-500/30 text-xs">
              {years.length} year{years.length !== 1 ? 's' : ''}
            </Badge>
            <Badge className="bg-slate-800/50 text-slate-400 border-slate-500/30 text-xs">
              {mipsData.total_records} records
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="bg-slate-900/50 rounded-lg p-3 text-center col-span-2 sm:col-span-1">
            <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">Final Score</p>
            <p className={`text-2xl font-bold ${scoreColor(metrics.finalScore)}`}>
              {metrics.finalScore ?? '—'}
            </p>
            <p className="text-[10px] text-slate-400">{latestYear}</p>
          </div>
          {[
            { label: 'Quality', value: metrics.qualityScore },
            { label: 'Cost', value: metrics.costScore },
            { label: 'PI', value: metrics.piScore },
            { label: 'IA', value: metrics.iaScore },
          ].map(({ label, value }) => (
            <div key={label} className="bg-slate-900/50 rounded-lg p-3 text-center">
              <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">{label}</p>
              <p className={`text-lg font-semibold ${scoreColor(value)}`}>
                {value ?? '—'}
              </p>
            </div>
          ))}
        </div>

        {metrics.orgName && (
          <p className="text-xs text-slate-400">
            Practice: <span className="text-slate-300">{metrics.orgName}</span>
            {metrics.practiceSize && <span className="ml-2 text-slate-400">({metrics.practiceSize} clinicians)</span>}
          </p>
        )}

        {years.length > 1 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="w-full text-xs text-slate-400 hover:text-slate-300 hover:bg-slate-800"
          >
            {expanded ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
            {expanded ? 'Hide' : 'Show'} historical data ({years.length - 1} more year{years.length > 2 ? 's' : ''})
          </Button>
        )}

        {expanded && years.slice(1).map(year => {
          const yearData = mipsData.by_year[year];
          const yearPerf = yearData?.performance?.[0];
          const yearMetrics = extractMIPSMetrics(yearPerf);
          return (
            <div key={year} className="bg-slate-900/30 rounded-lg p-3 border border-slate-700/30">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-300">{year}</span>
                <span className={`text-sm font-bold ${scoreColor(yearMetrics.finalScore)}`}>
                  {yearMetrics.finalScore ?? '—'}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                {[
                  { label: 'Quality', value: yearMetrics.qualityScore },
                  { label: 'Cost', value: yearMetrics.costScore },
                  { label: 'PI', value: yearMetrics.piScore },
                  { label: 'IA', value: yearMetrics.iaScore },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-[9px] text-slate-400">{label}</p>
                    <p className={`text-xs font-medium ${scoreColor(value)}`}>{value ?? '—'}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {latestData?.measures?.length > 0 && (
          <div className="border-t border-slate-700/30 pt-3">
            <p className="text-xs text-slate-400 mb-2 flex items-center gap-1">
              <BarChart3 className="w-3 h-3" /> {latestData.measures.length} measure{latestData.measures.length !== 1 ? 's' : ''} reported ({latestYear})
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

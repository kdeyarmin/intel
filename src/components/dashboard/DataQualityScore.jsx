import React, { useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle2, AlertCircle, Zap } from 'lucide-react';

export default function DataQualityScore() {
  const { data: scans, isLoading } = useQuery({
    queryKey: ['dataQualityScanLatest'],
    queryFn: () => base44.entities.DataQualityScan.list('-created_date', 1),
    staleTime: 300000,
    refetchInterval: 600000,
  });

  const latestScan = scans?.[0];
  const scores = latestScan?.scores;

  const scoreColor = useMemo(() => {
    if (!scores?.overall && scores?.overall !== 0) return 'text-gray-400';
    const score = scores.overall;
    if (score >= 90) return 'text-emerald-400';
    if (score >= 70) return 'text-amber-400';
    return 'text-red-400';
  }, [scores]);

  const scoreBackgroundColor = useMemo(() => {
    if (!scores?.overall && scores?.overall !== 0) return 'from-gray-600 to-gray-700';
    const score = scores.overall;
    if (score >= 90) return 'from-emerald-600 to-emerald-700';
    if (score >= 70) return 'from-amber-600 to-amber-700';
    return 'from-red-600 to-red-700';
  }, [scores]);

  if (isLoading) {
    return (
      <Card className="bg-[#141d30] border-slate-700/50 shadow-lg shadow-black/10">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
            <Zap className="w-4 h-4 text-cyan-400" />
            Data Quality Score
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-24 bg-slate-700/20 rounded-lg animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  if (!scores) {
    return null;
  }

  const ruleResults = latestScan?.rule_results || [];
  const issuesList = ruleResults
    .filter(r => r.failing > 0)
    .map(r => ({
      label: r.rule_name,
      count: r.failing,
      type: r.category === 'accuracy' || r.category === 'duplicate' ? 'error' : 'warning',
    }));

  return (
    <Card className="bg-[#141d30] border-slate-700/50 shadow-lg shadow-black/10">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
          <Zap className="w-4 h-4 text-cyan-400" />
          Data Quality Score
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={`bg-gradient-to-r ${scoreBackgroundColor} rounded-lg p-6 text-center`}>
          <div className={`text-5xl font-bold ${scoreColor} mb-1`}>
            {scores.overall}%
          </div>
          <p className="text-sm text-slate-300">
            {latestScan.total_records_scanned || 0} records scanned
          </p>
        </div>

        {issuesList.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs text-slate-400 font-semibold">Areas Needing Attention:</p>
            {issuesList.map((issue, idx) => (
              <div key={idx} className="flex items-center justify-between p-2 rounded bg-slate-800/50">
                <div className="flex items-center gap-2">
                  {issue.type === 'error' ? (
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                  )}
                  <span className="text-sm text-slate-300">{issue.label}</span>
                </div>
                <Badge variant="outline" className="text-xs border-slate-600 text-slate-400">
                  {issue.count}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 p-3 bg-emerald-500/10 rounded border border-emerald-500/20">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <p className="text-sm text-emerald-300">All data validation checks passed</p>
          </div>
        )}

        <div className="text-xs text-slate-400 pt-2 border-t border-slate-700">
          <p>Alerts Generated: <span className="font-semibold text-slate-300">{latestScan.alerts_generated || 0}</span></p>
        </div>
      </CardContent>
    </Card>
  );
}
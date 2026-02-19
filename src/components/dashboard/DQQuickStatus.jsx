import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { ShieldCheck, AlertTriangle, Sparkles, ArrowRight } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function DQQuickStatus() {
  const { data: scans = [], isLoading: sl } = useQuery({
    queryKey: ['dqScans'],
    queryFn: () => base44.entities.DataQualityScan.list('-created_date', 1),
    staleTime: 60000,
  });
  const { data: alerts = [], isLoading: al } = useQuery({
    queryKey: ['dqAlerts'],
    queryFn: () => base44.entities.DataQualityAlert.filter({ status: 'open' }, '-created_date', 50),
    staleTime: 60000,
  });

  const isLoading = sl || al;
  const latest = scans[0];
  const scores = latest?.scores || {};
  const openCount = alerts.length;
  const critical = alerts.filter(a => a.severity === 'critical' || a.severity === 'high').length;
  const suggestions = alerts.filter(a => a.suggested_value).length;

  if (isLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  const overallColor = (scores.overall || 0) >= 80 ? 'text-green-600' : (scores.overall || 0) >= 50 ? 'text-amber-600' : 'text-red-600';

  return (
    <Card className="bg-white border-slate-200/80 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-teal-500" />
            Quality Monitor
          </CardTitle>
          <Link to={createPageUrl('DataQuality')}>
            <Button variant="ghost" size="sm" className="text-xs h-7 text-teal-600">
              View Details <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {latest ? (
          <>
            <div className="flex items-center gap-6">
              <div className="text-center">
                <p className={`text-3xl font-bold ${overallColor}`}>{scores.overall || 0}%</p>
                <p className="text-[10px] text-slate-400">Overall</p>
              </div>
              <div className="flex-1 grid grid-cols-2 gap-2 text-xs">
                <div className="flex justify-between"><span className="text-slate-500">Completeness</span><span className="font-semibold">{scores.completeness || 0}%</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Accuracy</span><span className="font-semibold">{scores.accuracy || 0}%</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Timeliness</span><span className="font-semibold">{scores.timeliness || 0}%</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Consistency</span><span className="font-semibold">{scores.consistency || 0}%</span></div>
              </div>
            </div>
            <div className="flex gap-3 pt-2 border-t text-xs">
              {openCount > 0 && (
                <span className="flex items-center gap-1 text-amber-600">
                  <AlertTriangle className="w-3 h-3" />{openCount} open alerts
                </span>
              )}
              {critical > 0 && (
                <span className="flex items-center gap-1 text-red-600">
                  <AlertTriangle className="w-3 h-3" />{critical} critical
                </span>
              )}
              {suggestions > 0 && (
                <span className="flex items-center gap-1 text-violet-600">
                  <Sparkles className="w-3 h-3" />{suggestions} AI fixes
                </span>
              )}
              {openCount === 0 && (
                <span className="text-green-600 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> All clear
                </span>
              )}
            </div>
          </>
        ) : (
          <div className="text-center py-4">
            <p className="text-sm text-slate-400">No quality scans run yet</p>
            <Link to={createPageUrl('DataQuality')}>
              <Button size="sm" variant="outline" className="mt-2 text-xs">Run First Scan</Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
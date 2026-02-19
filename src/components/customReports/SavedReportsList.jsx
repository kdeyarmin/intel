import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Play, Trash2, Star, BarChart3, TrendingUp, PieChart } from 'lucide-react';
import { DATASET_CONFIG } from './reportConfig';

const chartIcons = { bar: BarChart3, line: TrendingUp, pie: PieChart };

export default function SavedReportsList({ reports, loading, onLoad, onDelete, onToggleFavorite }) {
  if (loading) {
    return (
      <Card>
        <CardContent className="p-4 space-y-2">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  const sorted = [...(reports || [])].sort((a, b) => {
    if (a.is_favorite && !b.is_favorite) return -1;
    if (!a.is_favorite && b.is_favorite) return 1;
    return new Date(b.created_date) - new Date(a.created_date);
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Saved Reports ({sorted.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5 max-h-96 overflow-y-auto">
        {sorted.length === 0 && (
          <p className="text-xs text-slate-400 py-4 text-center">No saved reports yet. Build and save your first report!</p>
        )}
        {sorted.map(report => {
          const ChartIcon = chartIcons[report.chart_type] || BarChart3;
          const dsLabel = DATASET_CONFIG[report.dataset]?.label || report.dataset;
          return (
            <div key={report.id} className="flex items-center gap-2 p-2 rounded-lg border hover:bg-slate-50 transition-colors group">
              <ChartIcon className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-800 truncate">{report.name}</p>
                <p className="text-[10px] text-slate-400 truncate">{dsLabel} · {report.metrics?.length || 0} metrics</p>
              </div>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onToggleFavorite(report)}>
                  <Star className={`w-3 h-3 ${report.is_favorite ? 'fill-yellow-400 text-yellow-400' : 'text-slate-300'}`} />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onLoad(report)}>
                  <Play className="w-3 h-3 text-blue-500" />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onDelete(report)}>
                  <Trash2 className="w-3 h-3 text-red-400" />
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
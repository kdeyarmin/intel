import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPin } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function TopStatesCard({ topStates, loading }) {
  const maxCount = topStates[0]?.[1] || 1;

  return (
    <Card className="bg-white border-slate-200/80 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-blue-500" />
          Top States by Provider Count
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : topStates.length === 0 ? (
          <p className="text-slate-400 text-center py-8 text-sm">No location data available</p>
        ) : (
          <div className="space-y-2.5">
            {topStates.map(([state, count], index) => {
              const pct = (count / maxCount) * 100;
              const colors = [
                'bg-blue-500', 'bg-blue-400', 'bg-blue-300', 'bg-sky-300', 'bg-sky-200'
              ];
              return (
                <div key={state} className="group">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2.5">
                      <span className="w-5 h-5 rounded-md bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500">
                        {index + 1}
                      </span>
                      <span className="text-sm font-semibold text-slate-800">{state}</span>
                    </div>
                    <span className="text-xs font-medium text-slate-500">{count.toLocaleString()}</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${colors[index] || 'bg-slate-300'} transition-all duration-500`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
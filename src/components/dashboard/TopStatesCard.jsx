import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPin } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function TopStatesCard({ topStates, loading }) {
  const maxCount = topStates[0]?.[1] || 1;

  return (
    <Card className="bg-[#141d30] border-slate-700/50 shadow-lg shadow-black/10">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-cyan-400" />
          Top States by Provider Count
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-10 w-full bg-slate-700/50" />)}
          </div>
        ) : topStates.length === 0 ? (
          <p className="text-slate-500 text-center py-8 text-sm">No location data available</p>
        ) : (
          <div className="space-y-3">
            {topStates.map(([state, count], index) => {
              const pct = (count / maxCount) * 100;
              const colors = [
                'bg-cyan-500', 'bg-cyan-400', 'bg-cyan-300/80', 'bg-sky-400/60', 'bg-sky-300/40'
              ];
              return (
                <div key={state} className="group">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2.5">
                      <span className="w-5 h-5 rounded-md bg-slate-800 border border-slate-700/50 flex items-center justify-center text-[10px] font-bold text-slate-400">
                        {index + 1}
                      </span>
                      <span className="text-sm font-semibold text-white">{state}</span>
                    </div>
                    <span className="text-xs font-medium text-slate-400">{count.toLocaleString()}</span>
                  </div>
                  <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${colors[index] || 'bg-slate-600'} transition-all duration-500`}
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
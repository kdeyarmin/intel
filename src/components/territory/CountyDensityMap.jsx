import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin } from 'lucide-react';

export default function CountyDensityMap({ countyStats }) {
  const getDensityColor = (count) => {
    if (count >= 50) return 'bg-teal-600';
    if (count >= 20) return 'bg-teal-900/20';
    if (count >= 10) return 'bg-teal-400';
    if (count >= 5) return 'bg-teal-300';
    return 'bg-teal-200';
  };

  const topCounties = countyStats.slice(0, 15);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-teal-600" />
          Provider Density by County
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {topCounties.map((county, idx) => (
            <div
              key={idx}
              className="flex items-center gap-3 p-3 bg-slate-800/40 rounded-lg hover:bg-slate-700/40 transition-colors"
            >
              <div className={`h-12 w-12 rounded-lg ${getDensityColor(county.count)} flex items-center justify-center text-white font-bold`}>
                {county.count}
              </div>
              <div className="flex-1">
                <div className="font-medium text-white">{county.county}</div>
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <span>Avg Score: {county.avgScore}</span>
                  <span>•</span>
                  <span>High: {county.highScore}</span>
                </div>
              </div>
              <Badge variant="outline" className="text-xs">
                {Math.round((county.count / countyStats.reduce((sum, c) => sum + c.count, 0)) * 100)}%
              </Badge>
            </div>
          ))}
        </div>
        
        {countyStats.length > 15 && (
          <div className="mt-3 text-sm text-slate-400 text-center">
            +{countyStats.length - 15} more counties
          </div>
        )}

        <div className="mt-4 pt-4 border-t">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">Total PA Providers</span>
            <span className="font-semibold text-white">
              {countyStats.reduce((sum, c) => sum + c.count, 0)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
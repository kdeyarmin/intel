import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin } from 'lucide-react';

export default function TerritoryIntelligence({ location }) {
  if (!location) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Territory Intelligence
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-400">Location data not available</p>
        </CardContent>
      </Card>
    );
  }

  // PA counties for distance reference
  const paCounties = [
    'Philadelphia', 'Allegheny', 'Montgomery', 'Bucks', 'Delaware',
    'Chester', 'Lancaster', 'York', 'Berks', 'Westmoreland'
  ];

  // Determine if provider is in PA
  const isInPA = location.state === 'PA';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          Territory Intelligence
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-3 bg-slate-800/40 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium">Provider Location</span>
            <Badge variant={isInPA ? 'default' : 'outline'}>
              {location.state}
            </Badge>
          </div>
          <p className="text-sm text-slate-400">
            {location.city}, {location.state}
          </p>
        </div>

        {isInPA ? (
          <>
            <div>
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Pennsylvania Coverage
              </h4>
              <p className="text-sm text-slate-400 mb-2">
                Located in {location.city}, {location.state}
              </p>
              <div className="flex flex-wrap gap-1">
                {paCounties.slice(0, 5).map(county => (
                  <Badge key={county} variant="outline" className="text-xs">
                    {county}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="pt-3 border-t">
              <p className="text-xs text-slate-400">
                Provider is well-positioned for Pennsylvania-focused partnerships
              </p>
            </div>
          </>
        ) : (
          <div className="p-3 bg-yellow-900/20 rounded-lg border border-yellow-500/30">
            <p className="text-sm text-yellow-400">
              Provider is located outside of Pennsylvania. Territory analysis limited to PA-focused partnerships.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
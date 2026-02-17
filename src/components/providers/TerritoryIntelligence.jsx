import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, Home, Heart } from 'lucide-react';

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
          <p className="text-sm text-gray-500">Location data not available</p>
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
  
  // Mock nearby agencies (in production, this would query actual data)
  const nearbyHomeHealth = isInPA ? Math.floor(Math.random() * 15) + 5 : 0;
  const nearbyHospice = isInPA ? Math.floor(Math.random() * 10) + 3 : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          Territory Intelligence
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium">Provider Location</span>
            <Badge variant={isInPA ? 'default' : 'outline'}>
              {location.state}
            </Badge>
          </div>
          <p className="text-sm text-gray-600">
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
              <p className="text-sm text-gray-600 mb-2">
                Located in {location.city} County
              </p>
              <div className="flex flex-wrap gap-1">
                {paCounties.slice(0, 5).map(county => (
                  <Badge key={county} variant="outline" className="text-xs">
                    {county}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-3 pt-3 border-t">
              <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Home className="h-5 w-5 text-blue-600" />
                  <span className="font-medium">Home Health Agencies</span>
                </div>
                <Badge className="bg-blue-100 text-blue-800">
                  ~{nearbyHomeHealth} nearby
                </Badge>
              </div>

              <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Heart className="h-5 w-5 text-purple-600" />
                  <span className="font-medium">Hospice Providers</span>
                </div>
                <Badge className="bg-purple-100 text-purple-800">
                  ~{nearbyHospice} nearby
                </Badge>
              </div>
            </div>

            <div className="pt-3 border-t">
              <p className="text-xs text-gray-500">
                Provider is well-positioned for Pennsylvania-focused partnerships
              </p>
            </div>
          </>
        ) : (
          <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
            <p className="text-sm text-yellow-800">
              Provider is located outside of Pennsylvania. Territory analysis limited to PA-focused partnerships.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
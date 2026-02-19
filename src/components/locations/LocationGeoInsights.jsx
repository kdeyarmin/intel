import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, Users, Building2, Navigation } from 'lucide-react';

export default function LocationGeoInsights({ location, coProviders = [], allLocations = [] }) {
  const insights = useMemo(() => {
    if (!location) return null;

    const sameState = allLocations.filter(l => l.state === location.state);
    const sameCity = sameState.filter(l => l.city === location.city);
    const sameZip = sameState.filter(l => l.zip === location.zip);

    const uniqueNPIsSameCity = new Set(sameCity.map(l => l.npi)).size;
    const uniqueNPIsSameZip = new Set(sameZip.map(l => l.npi)).size;

    const individualCount = coProviders.filter(p => p.entity_type === 'Individual').length;
    const orgCount = coProviders.filter(p => p.entity_type === 'Organization').length;

    const credentials = {};
    coProviders.forEach(p => {
      if (p.credential) credentials[p.credential] = (credentials[p.credential] || 0) + 1;
    });
    const topCredentials = Object.entries(credentials).sort((a, b) => b[1] - a[1]).slice(0, 5);

    return { sameCity: sameCity.length, sameZip: sameZip.length, uniqueNPIsSameCity, uniqueNPIsSameZip, individualCount, orgCount, topCredentials };
  }, [location, coProviders, allLocations]);

  if (!insights) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Navigation className="w-4 h-4 text-sky-500" />
          Geographic Insights
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-sky-50 rounded-lg">
            <p className="text-[10px] text-sky-600 font-medium">Same City</p>
            <p className="text-lg font-bold text-sky-900">{insights.uniqueNPIsSameCity}</p>
            <p className="text-[10px] text-sky-500">providers in {location.city}</p>
          </div>
          <div className="p-3 bg-indigo-50 rounded-lg">
            <p className="text-[10px] text-indigo-600 font-medium">Same ZIP</p>
            <p className="text-lg font-bold text-indigo-900">{insights.uniqueNPIsSameZip}</p>
            <p className="text-[10px] text-indigo-500">providers in {location.zip}</p>
          </div>
        </div>

        {coProviders.length > 0 && (
          <div>
            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide mb-1.5">At This Address</p>
            <div className="flex gap-2">
              <div className="flex items-center gap-1.5 text-xs bg-slate-50 rounded px-2.5 py-1.5">
                <Users className="w-3 h-3 text-blue-500" />
                <span className="text-slate-600">{insights.individualCount} Individual{insights.individualCount !== 1 ? 's' : ''}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs bg-slate-50 rounded px-2.5 py-1.5">
                <Building2 className="w-3 h-3 text-indigo-500" />
                <span className="text-slate-600">{insights.orgCount} Organization{insights.orgCount !== 1 ? 's' : ''}</span>
              </div>
            </div>
          </div>
        )}

        {insights.topCredentials.length > 0 && (
          <div>
            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide mb-1.5">Top Credentials at Site</p>
            <div className="flex flex-wrap gap-1.5">
              {insights.topCredentials.map(([cred, count]) => (
                <Badge key={cred} variant="outline" className="text-[10px]">{cred} ({count})</Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
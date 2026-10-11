import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPin } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';

/** The provider's county (from Census ZIP areas) and how crowded it is. */
export default function TerritoryIntelligence({ location }) {
  const zip = location?.zip || '';
  const { data, isLoading } = useQuery({
    queryKey: ['geoContext', zip.slice(0, 5)],
    queryFn: async () => (await base44.functions.invoke('getGeoContext', { zip })).data,
    enabled: zip.length >= 5,
    staleTime: 60 * 60 * 1000,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5" aria-hidden="true" />
          Territory
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!location ? (
          <p className="text-sm text-slate-400">No address on file.</p>
        ) : (
          <>
            <div className="p-3 bg-slate-800/40 rounded-lg">
              <p className="font-medium text-slate-200">{[location.city, location.state].filter(Boolean).join(', ')} {zip}</p>
              {isLoading ? (
                <p className="text-sm text-slate-400">Looking up the county…</p>
              ) : data?.county ? (
                <p className="text-sm text-slate-300">{data.county.name}, {data.county.state}</p>
              ) : (
                <p className="text-sm text-slate-400">County unknown for this ZIP.</p>
              )}
            </div>
            {data?.county && (
              <>
                {data.county_practice_locations != null && (
                  <p className="text-sm text-slate-300">
                    {data.county_practice_locations.toLocaleString()} provider practice locations in {data.county.name}
                    {data.zip_practice_locations != null && `, ${data.zip_practice_locations.toLocaleString()} in ZIP ${zip.slice(0, 5)}`}.
                  </p>
                )}
                <div className="flex flex-wrap gap-3 text-xs">
                  <Link to={createPageUrl(`CountyIntelligence?state=${data.county.state}&county=${data.county.fips}`)} className="text-cyan-400 hover:text-cyan-300">
                    County Intel for {data.county.name}
                  </Link>
                  <Link to={createPageUrl(`TerritoryIntelligence?state=${data.county.state}`)} className="text-cyan-400 hover:text-cyan-300">
                    {data.county.state} territory map
                  </Link>
                </div>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

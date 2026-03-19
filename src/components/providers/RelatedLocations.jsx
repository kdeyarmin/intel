import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { MapPin, Check, X, Clock, RotateCcw } from 'lucide-react';

const STATUS_CONFIG = {
  suggested: { label: 'Suggested', className: 'bg-yellow-100 text-yellow-800', icon: Clock },
  approved: { label: 'Approved', className: 'bg-green-100 text-green-800', icon: Check },
  rejected: { label: 'Rejected', className: 'bg-red-100 text-red-800', icon: X },
  override: { label: 'Override', className: 'bg-blue-100 text-blue-800', icon: RotateCcw },
};

export default function RelatedLocations({ npi }) {
  const { data: matches = [], isLoading } = useQuery({
    queryKey: ['providerMatches', npi],
    queryFn: () => base44.entities.ProviderLocationMatch.filter({ npi }),
    enabled: !!npi,
  });

  const sorted = [...matches].sort((a, b) => (b.confidence_score || 0) - (a.confidence_score || 0));

  return (
    <Card className="bg-gray-100">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <MapPin className="w-4 h-4 text-indigo-600" />
          AI-Matched Locations
          {sorted.length > 0 && (
            <Badge variant="outline" className="text-xs ml-auto">{sorted.length} match{sorted.length !== 1 ? 'es' : ''}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map(i => <Skeleton key={i} className="h-16" />)}
          </div>
        ) : sorted.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">
            No AI-matched locations for this provider yet
          </p>
        ) : (
          <div className="space-y-2">
            {sorted.map(match => {
              const status = STATUS_CONFIG[match.status] || STATUS_CONFIG.suggested;
              const confColor = match.confidence_score >= 75 ? 'text-green-600' : match.confidence_score >= 50 ? 'text-yellow-600' : 'text-red-600';
              return (
                <div key={match.id} className="bg-slate-800/40 rounded-lg border border-slate-700/50 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {match.location_display || match.location_id}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge className={status.className + ' text-xs'}>{status.label}</Badge>
                        <span className={`text-sm font-bold ${confColor}`}>{match.confidence_score}%</span>
                      </div>
                    </div>
                  </div>
                  {match.match_reasons?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {match.match_reasons.slice(0, 2).map((r, i) => (
                        <span key={i} className="text-xs text-gray-500 bg-gray-50 rounded px-1.5 py-0.5">{r}</span>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 flex gap-3 text-xs text-gray-400">
                    <span>Spec: {match.specialization_score || 0}</span>
                    <span>Prox: {match.proximity_score || 0}</span>
                    <span>Ref: {match.referral_score || 0}</span>
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
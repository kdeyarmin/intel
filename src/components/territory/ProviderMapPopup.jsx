import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MapPin, Users, Activity, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function ProviderMapPopup({ item }) {
  const navigate = useNavigate();
  const { provider, location, taxonomy, score, utilization } = item;

  const name = provider.entity_type === 'Organization'
    ? provider.organization_name
    : `${provider.first_name || ''} ${provider.last_name || ''}`.trim();

  const getScoreColor = (s) => {
    if (s >= 80) return 'bg-green-100 text-green-800';
    if (s >= 60) return 'bg-teal-100 text-teal-800';
    if (s >= 40) return 'bg-yellow-100 text-yellow-800';
    return 'bg-slate-100 text-slate-700';
  };

  return (
    <div className="min-w-[220px] max-w-[280px]">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="font-semibold text-sm text-slate-900 leading-tight">{name || 'Unknown'}</div>
        <Badge className={`shrink-0 text-[10px] ${getScoreColor(score)}`}>{score}</Badge>
      </div>

      <div className="space-y-1 text-xs text-slate-600">
        {taxonomy?.taxonomy_description && (
          <div className="flex items-center gap-1">
            <Activity className="w-3 h-3 shrink-0" />
            <span className="truncate">{taxonomy.taxonomy_description}</span>
          </div>
        )}
        {location && (
          <div className="flex items-center gap-1">
            <MapPin className="w-3 h-3 shrink-0" />
            <span>{location.city}{location.state ? `, ${location.state}` : ''} {location.zip || ''}</span>
          </div>
        )}
        {utilization && (
          <div className="flex items-center gap-1">
            <Users className="w-3 h-3 shrink-0" />
            <span>{(utilization.total_medicare_beneficiaries || 0).toLocaleString()} beneficiaries</span>
          </div>
        )}
      </div>

      <div className="mt-2 pt-2 border-t flex items-center justify-between">
        <span className="text-[10px] text-slate-400 font-mono">{provider.npi}</span>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 text-[10px] px-2 text-teal-600 hover:text-teal-700"
          onClick={() => navigate(createPageUrl('ProviderDetail') + '?npi=' + provider.npi)}
        >
          View <ExternalLink className="w-3 h-3 ml-1" />
        </Button>
      </div>
    </div>
  );
}
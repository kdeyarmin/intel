import React from 'react';
import { Badge } from '@/components/ui/badge';
import { MapPin } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function ProviderClusterList({ providers }) {
  const navigate = useNavigate();

  if (providers.length === 0) {
    return (
      <div className="text-sm text-slate-400 text-center py-4">
        No providers match criteria
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {providers.map((item) => {
        const name = item.provider.name
          || (item.provider.entity_type === 'Organization'
            ? item.provider.organization_name
            : [item.provider.first_name, item.provider.last_name].filter(Boolean).join(' '))
          || item.provider.npi;

        return (
          <button
            key={item.provider.npi}
            type="button"
            onClick={() => navigate(createPageUrl('ProviderDetail') + '?npi=' + item.provider.npi)}
            className="w-full text-left p-3 bg-slate-800/60 border border-slate-700/50 rounded-lg hover:border-teal-400 hover:bg-teal-900/20 transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-white truncate text-sm">
                  {name}
                </div>
                <div className="flex items-center gap-1 text-xs text-slate-400 mt-1">
                  <MapPin className="h-3 w-3" />
                  <span>{[item.location?.city, item.county].filter(Boolean).join(' · ')}</span>
                </div>
                {item.taxonomy && (
                  <div className="text-xs text-slate-400 mt-1 truncate">
                    {item.taxonomy.taxonomy_description}
                  </div>
                )}
              </div>
              <Badge className={`shrink-0 ${item.score == null ? 'bg-slate-700 text-slate-300' : 'bg-teal-900/30 text-teal-400'}`}>
                {item.score == null ? 'Unscored' : item.score}
              </Badge>
            </div>
          </button>
        );
      })}
    </div>
  );
}
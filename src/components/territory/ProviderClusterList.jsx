import React from 'react';
import { Badge } from '@/components/ui/badge';
import { MapPin } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function ProviderClusterList({ providers }) {
  const navigate = useNavigate();

  if (providers.length === 0) {
    return (
      <div className="text-sm text-gray-500 text-center py-4">
        No providers match criteria
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {providers.map((item, idx) => {
        const name = item.provider.entity_type === 'Organization'
          ? item.provider.organization_name
          : `${item.provider.first_name} ${item.provider.last_name}`;

        return (
          <button
            key={idx}
            onClick={() => navigate(createPageUrl('ProviderDetail') + '?npi=' + item.provider.npi)}
            className="w-full text-left p-3 bg-white border border-gray-200 rounded-lg hover:border-teal-400 hover:bg-teal-50 transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 truncate text-sm">
                  {name}
                </div>
                <div className="flex items-center gap-1 text-xs text-gray-600 mt-1">
                  <MapPin className="h-3 w-3" />
                  <span>{item.location?.city}</span>
                </div>
                {item.taxonomy && (
                  <div className="text-xs text-gray-500 mt-1 truncate">
                    {item.taxonomy.taxonomy_description}
                  </div>
                )}
              </div>
              <Badge className="bg-teal-100 text-teal-800 shrink-0">
                {item.score}
              </Badge>
            </div>
          </button>
        );
      })}
    </div>
  );
}
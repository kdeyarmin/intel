import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Users, ArrowRight, ChevronDown, Stethoscope } from 'lucide-react';

export default function AffiliatedProvidersCard({ providerId, facilityNpi, facilityName }) {
  const [showAll, setShowAll] = useState(false);

  const { data: affiliatedProviders = [], isLoading } = useQuery({
    queryKey: ['affiliatedProviders', facilityNpi, providerId],
    queryFn: async () => {
      if (!facilityNpi) return [];
      try {
        const affs = await base44.entities.ProviderAffiliation.filter({
          organization_npi: facilityNpi,
        });
        return affs || [];
      } catch {
        return [];
      }
    },
    enabled: !!facilityNpi,
    staleTime: 120000,
  });

  if (isLoading) {
    return (
      <Card className="bg-slate-800/50 border-slate-700/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-slate-200 flex items-center gap-2">
            <Users className="w-4 h-4 text-cyan-400" />
            Affiliated Providers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <div className="w-3 h-3 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            Loading...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (affiliatedProviders.length === 0) return null;

  const displayList = showAll ? affiliatedProviders : affiliatedProviders.slice(0, 8);

  return (
    <Card className="bg-slate-800/50 border-slate-700/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm text-slate-200 flex items-center gap-2">
          <Users className="w-4 h-4 text-cyan-400" />
          Affiliated Providers
          <Badge className="bg-slate-700/50 text-slate-400 border-slate-600/50 text-[10px] ml-auto">
            {affiliatedProviders.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {displayList.map((aff, i) => (
            <Link
              key={i}
              to={createPageUrl('ProviderDetail') + `?npi=${aff.npi}`}
              className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/30 border border-slate-700/30 hover:border-cyan-500/30 transition-colors group block"
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-200 group-hover:text-cyan-300 truncate">
                  NPI: {aff.npi}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  {aff.affiliation_type && (
                    <Badge className="bg-emerald-900/30 text-emerald-400 border-emerald-500/30 text-[9px]">
                      {aff.affiliation_type}
                    </Badge>
                  )}
                  {aff.taxonomy_code && (
                    <span className="text-[10px] text-slate-500 flex items-center gap-1">
                      <Stethoscope className="w-2.5 h-2.5" />
                      {aff.taxonomy_description || aff.taxonomy_code}
                    </span>
                  )}
                </div>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-cyan-400 flex-shrink-0 ml-2" />
            </Link>
          ))}
          {affiliatedProviders.length > 8 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-cyan-400 hover:text-cyan-300 w-full mt-1"
              onClick={(e) => { e.preventDefault(); setShowAll(!showAll); }}
            >
              <ChevronDown className={`w-3.5 h-3.5 mr-1 transition-transform ${showAll ? 'rotate-180' : ''}`} />
              {showAll ? 'Show less' : `Show all ${affiliatedProviders.length}`}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

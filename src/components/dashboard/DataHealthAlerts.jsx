import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Mail, Phone, Stethoscope, ChevronRight, Activity } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function DataHealthAlerts() {
  const { data: leadScores = [], isLoading: lsLoading } = useQuery({
    queryKey: ['dh_leadScores'],
    queryFn: () => base44.entities.LeadScore.list('-score', 500),
    staleTime: 60000,
  });

  const { data: providers = [], isLoading: pLoading } = useQuery({
    queryKey: ['dh_providers'],
    queryFn: () => base44.entities.Provider.list('-created_date', 1000),
    staleTime: 60000,
  });

  const { data: locations = [], isLoading: lLoading } = useQuery({
    queryKey: ['dh_locations'],
    queryFn: () => base44.entities.ProviderLocation.list('-created_date', 1000),
    staleTime: 60000,
  });

  const { data: taxonomies = [], isLoading: tLoading } = useQuery({
    queryKey: ['dh_taxonomies'],
    queryFn: () => base44.entities.ProviderTaxonomy.list('-created_date', 1000),
    staleTime: 60000,
  });

  const isLoading = lsLoading || pLoading || lLoading || tLoading;

  const alerts = useMemo(() => {
    if (leadScores.length === 0 || providers.length === 0) return [];

    const issues = [];
    const highScoringScores = leadScores.filter(s => s.score >= 80);

    highScoringScores.forEach(scoreItem => {
      const npi = scoreItem.npi;
      const prov = providers.find(p => p.npi === npi);
      if (!prov) return;

      const locs = locations.filter(l => l.npi === npi);
      const tax = taxonomies.filter(t => t.npi === npi);

      const hasEmail = !!prov.email;
      const hasPhone = locs.some(l => !!l.phone) || !!prov.cell_phone;
      const hasSpecialty = tax.some(t => !!t.taxonomy_description);

      const missing = [];
      if (!hasEmail) missing.push('Email');
      if (!hasPhone) missing.push('Phone');
      if (!hasSpecialty) missing.push('Specialty');

      if (missing.length > 0) {
        issues.push({
          npi: prov.npi,
          name: prov.entity_type === 'Individual' ? `${prov.first_name || ''} ${prov.last_name || ''}`.trim() : prov.organization_name || prov.npi,
          score: scoreItem.score,
          missing,
        });
      }
    });

    return issues.sort((a, b) => b.score - a.score);
  }, [providers, locations, taxonomies, leadScores]);

  if (isLoading) {
    return (
      <Card className="bg-[#141d30] border-slate-700/50">
        <CardHeader className="pb-2 border-b border-slate-800">
          <CardTitle className="text-base flex items-center gap-2 text-white font-semibold">
            <Activity className="w-4 h-4 text-rose-400" />
            Critical Data Health Alerts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-20 flex items-center justify-center text-sm text-slate-500">Scanning data health...</div>
        </CardContent>
      </Card>
    );
  }

  if (alerts.length === 0) return null;

  return (
    <Card className="bg-[#141d30] border-slate-700/50 shadow-lg shadow-black/10">
      <CardHeader className="pb-3 border-b border-slate-800">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2 text-white font-semibold">
            <Activity className="w-4 h-4 text-rose-400" />
            Critical Data Health Alerts
            <Badge variant="outline" className="ml-2 bg-rose-500/10 text-rose-400 border-rose-500/20">{alerts.length} High-Value Records</Badge>
          </CardTitle>
          <Link to={createPageUrl('DataQuality')}>
            <Button variant="ghost" size="sm" className="h-7 text-xs text-slate-400 hover:text-white">
              View All <ChevronRight className="w-3 h-3 ml-1" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-slate-800/50 max-h-[350px] overflow-y-auto">
          {alerts.map(alert => (
            <div key={alert.npi} className="p-3 hover:bg-slate-800/30 transition-colors flex items-center justify-between group">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-slate-200 text-sm">{alert.name}</span>
                  <Badge className="bg-slate-800 text-slate-300 text-[10px] h-5 border-slate-700">Score: {alert.score}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">Missing:</span>
                  {alert.missing.map(m => (
                    <span key={m} className="flex items-center gap-1 text-[10px] text-amber-400/90 bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/20">
                      {m === 'Email' && <Mail className="w-3 h-3" />}
                      {m === 'Phone' && <Phone className="w-3 h-3" />}
                      {m === 'Specialty' && <Stethoscope className="w-3 h-3" />}
                      {m}
                    </span>
                  ))}
                </div>
              </div>
              <Link to={`${createPageUrl('ProviderDetail')}?npi=${alert.npi}`}>
                <Button variant="outline" size="sm" className="h-7 text-xs opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 border-slate-700 text-white hover:bg-slate-700">
                  Enrich
                </Button>
              </Link>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
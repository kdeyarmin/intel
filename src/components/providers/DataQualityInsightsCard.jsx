import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, AlertTriangle, CheckCircle, Sparkles } from 'lucide-react';

export default function DataQualityInsightsCard({ npi, provider }) {
  const { data: alerts = [] } = useQuery({
    queryKey: ['dqAlertsForNPI', npi],
    queryFn: () => base44.entities.DataQualityAlert.filter({ npi }),
    enabled: !!npi,
    staleTime: 60000,
  });

  const openAlerts = alerts.filter(a => a.status === 'open');
  const fixedAlerts = alerts.filter(a => a.status === 'accepted' || a.status === 'auto_fixed');
  const hasSuggestions = openAlerts.some(a => a.suggested_value);

  // Check completeness
  const completeness = [];
  if (!provider?.credential) completeness.push('Credential missing');
  if (!provider?.gender) completeness.push('Gender missing');
  if (!provider?.enumeration_date) completeness.push('Enumeration date missing');
  if (provider?.needs_nppes_enrichment) completeness.push('Needs NPPES enrichment');

  const isClean = openAlerts.length === 0 && completeness.length === 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="w-4 h-4 text-slate-500" />
          Data Quality
          {isClean ? (
            <Badge className="bg-green-100 text-green-700 text-[10px] ml-auto gap-1">
              <CheckCircle className="w-3 h-3" /> Clean
            </Badge>
          ) : (
            <Badge className="bg-amber-100 text-amber-700 text-[10px] ml-auto gap-1">
              <AlertTriangle className="w-3 h-3" /> {openAlerts.length + completeness.length} issue{openAlerts.length + completeness.length > 1 ? 's' : ''}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {completeness.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Completeness</p>
            {completeness.map(c => (
              <div key={c} className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 rounded px-2.5 py-1.5">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                {c}
              </div>
            ))}
          </div>
        )}

        {openAlerts.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Open Alerts</p>
            {openAlerts.slice(0, 5).map(a => (
              <div key={a.id} className="flex items-center gap-2 text-xs bg-slate-50 rounded px-2.5 py-1.5">
                {a.suggested_value ? <Sparkles className="w-3 h-3 text-violet-500 shrink-0" /> : <AlertTriangle className="w-3 h-3 text-slate-400 shrink-0" />}
                <span className="flex-1 truncate text-slate-600">{a.summary}</span>
                <Badge variant="secondary" className={`text-[9px] ${a.severity === 'critical' ? 'bg-red-100 text-red-700' : a.severity === 'high' ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-600'}`}>
                  {a.severity}
                </Badge>
              </div>
            ))}
            {openAlerts.length > 5 && <p className="text-[10px] text-slate-400 pl-2">+{openAlerts.length - 5} more</p>}
          </div>
        )}

        {fixedAlerts.length > 0 && (
          <div className="flex items-center gap-1.5 text-[10px] text-green-600">
            <CheckCircle className="w-3 h-3" />
            {fixedAlerts.length} issue{fixedAlerts.length > 1 ? 's' : ''} previously resolved
          </div>
        )}

        {isClean && (
          <div className="flex items-center gap-2 text-xs text-green-600 bg-green-50 rounded-lg px-3 py-3">
            <CheckCircle className="w-4 h-4" />
            <span>All data quality checks pass. Record is complete and accurate.</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
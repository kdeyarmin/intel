import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Globe, Linkedin, Stethoscope, MapPin, Sparkles, Loader2, ExternalLink } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import EmailValidationBadge from './EmailValidationBadge';

export default function EnrichedProviderCard({ provider, location, taxonomy, onEnriched }) {
  const [enriching, setEnriching] = useState(false);

  const name = provider.entity_type === 'Individual'
    ? `${provider.first_name || ''} ${provider.last_name || ''}`.trim()
    : provider.organization_name || provider.npi;

  const handleEnrich = async () => {
    setEnriching(true);
    const res = await base44.functions.invoke('enrichProviderWithAI', { provider_id: provider.id });
    const data = res.data;
    if (data.success) {
      toast.success(`Enriched ${data.enriched_fields.length} fields for ${name}`);
      onEnriched?.();
    } else {
      toast.error(data.error || 'Enrichment failed');
    }
    setEnriching(false);
  };

  const enrichmentStatus = provider.ai_enrichment_status;
  const hasWebsite = !!provider.website;
  const hasLinkedIn = !!provider.linkedin_url;
  const hasSpecialty = !!taxonomy?.taxonomy_description;

  return (
    <Card className="bg-slate-800/40 border-slate-700/30">
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium text-slate-200 truncate">{name}</span>
              {provider.credential && (
                <Badge className="bg-violet-500/15 text-violet-400 border border-violet-500/20 text-[9px]">{provider.credential}</Badge>
              )}
            </div>
            <div className="text-xs text-slate-500 font-mono mb-2">{provider.npi}</div>

            {/* Enriched data display */}
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
              {hasSpecialty && (
                <span className="flex items-center gap-1 text-slate-400">
                  <Stethoscope className="w-3 h-3 text-cyan-400" /> {taxonomy.taxonomy_description}
                </span>
              )}
              {location && (
                <span className="flex items-center gap-1 text-slate-400">
                  <MapPin className="w-3 h-3 text-amber-400" /> {location.city}{location.state ? `, ${location.state}` : ''}
                </span>
              )}
              {hasWebsite && (
                <a href={provider.website} target="_blank" rel="noopener noreferrer"
                   className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300">
                  <Globe className="w-3 h-3" /> Website <ExternalLink className="w-2.5 h-2.5" />
                </a>
              )}
              {hasLinkedIn && (
                <a href={provider.linkedin_url} target="_blank" rel="noopener noreferrer"
                   className="flex items-center gap-1 text-blue-400 hover:text-blue-300">
                  <Linkedin className="w-3 h-3" /> LinkedIn <ExternalLink className="w-2.5 h-2.5" />
                </a>
              )}
            </div>

            {/* Email info */}
            {provider.email && (
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-xs text-slate-300">{provider.email}</span>
                {provider.email_validation_status && provider.email_validation_status !== '' && (
                  <EmailValidationBadge status={provider.email_validation_status} reason={provider.email_validation_reason} size="sm" />
                )}
                {provider.email_confidence && (
                  <Badge className={`text-[9px] ${
                    provider.email_confidence === 'high' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' :
                    provider.email_confidence === 'medium' ? 'bg-amber-500/15 text-amber-400 border-amber-500/20' :
                    'bg-red-500/15 text-red-400 border-red-500/20'
                  } border`}>{provider.email_confidence}</Badge>
                )}
              </div>
            )}
          </div>

          {/* Enrichment button */}
          <div className="shrink-0">
            {enrichmentStatus === 'enriched' ? (
              <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 text-[9px]">
                Enriched
              </Badge>
            ) : (
              <Button onClick={handleEnrich} disabled={enriching} variant="ghost" size="sm" className="h-7 text-xs gap-1 text-violet-400 hover:text-violet-300">
                {enriching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                Enrich
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
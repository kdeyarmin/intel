import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import { Globe, Loader2, Check, Building2, GraduationCap, Languages, Shield, AlertTriangle, Info, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

function ProfileCard({ profile, applying, applied, onApply }) {
  const hasData = profile.website || profile.affiliations?.length || profile.board_certifications?.length || profile.education || profile.languages?.length;
  if (!hasData) return null;

  const dataPoints = [
    profile.website && 'Website',
    profile.affiliations?.length && `${profile.affiliations.length} Affiliation(s)`,
    profile.board_certifications?.length && `${profile.board_certifications.length} Certification(s)`,
    profile.education && 'Education',
    profile.languages?.length && `${profile.languages.length} Language(s)`,
  ].filter(Boolean);

  return (
    <div className="p-4 bg-white rounded-xl border border-slate-200 hover:border-teal-200 hover:shadow-sm transition-all">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-900">{profile.name}</span>
            <span className="text-[10px] text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded">{profile.npi}</span>
          </div>
          <div className="flex flex-wrap gap-1 mt-1">
            {dataPoints.map((dp, i) => (
              <Badge key={i} variant="outline" className="text-[9px] bg-teal-50 text-teal-700 border-teal-200">{dp}</Badge>
            ))}
          </div>
        </div>
        <Button
          size="sm"
          variant={applied.has(profile.npi) ? "default" : "outline"}
          className={`h-7 text-xs shrink-0 ${applied.has(profile.npi) ? 'bg-green-600 hover:bg-green-700' : ''}`}
          disabled={applying.has(profile.npi) || applied.has(profile.npi)}
          onClick={() => onApply(profile)}
        >
          {applied.has(profile.npi) ? <><Check className="w-3 h-3 mr-1" /> Saved</> :
           applying.has(profile.npi) ? <Loader2 className="w-3 h-3 animate-spin" /> :
           <><Sparkles className="w-3 h-3 mr-1" /> Save</>}
        </Button>
      </div>

      <div className="space-y-2 text-xs text-slate-600">
        {profile.website && (
          <div className="flex items-center gap-2 p-2 bg-blue-50 rounded-lg">
            <Globe className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <a href={profile.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate text-[11px]">{profile.website}</a>
          </div>
        )}
        {profile.affiliations?.length > 0 && (
          <div className="flex items-start gap-2 p-2 bg-slate-50 rounded-lg">
            <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
            <div>
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Affiliations</span>
              <p className="text-xs text-slate-700 mt-0.5">{profile.affiliations.join(' · ')}</p>
            </div>
          </div>
        )}
        {profile.board_certifications?.length > 0 && (
          <div className="flex items-start gap-2 p-2 bg-slate-50 rounded-lg">
            <Shield className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
            <div>
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Board Certifications</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {profile.board_certifications.map((c, j) => (
                  <Badge key={j} className="bg-violet-50 text-violet-700 border-violet-200 text-[9px]">{c}</Badge>
                ))}
              </div>
            </div>
          </div>
        )}
        {profile.education && (
          <div className="flex items-start gap-2 p-2 bg-slate-50 rounded-lg">
            <GraduationCap className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
            <div>
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Education</span>
              <p className="text-xs text-slate-700 mt-0.5">{profile.education}</p>
            </div>
          </div>
        )}
        {profile.languages?.length > 0 && (
          <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
            <Languages className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="text-xs text-slate-700">{profile.languages.join(', ')}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AIProfileAugmenter({ providers = [], locations = [], taxonomies = [], onComplete }) {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [applying, setApplying] = useState(new Set());
  const [applied, setApplied] = useState(new Set());

  const providerCount = Math.min(providers.length, 15);

  const handleAugment = async () => {
    setLoading(true);
    setResults(null);
    setApplied(new Set());

    const batch = providers.slice(0, 15).map(p => {
      const loc = locations.find(l => l.npi === p.npi && l.is_primary) || locations.find(l => l.npi === p.npi);
      const tax = taxonomies.find(t => t.npi === p.npi && t.primary_flag) || taxonomies.find(t => t.npi === p.npi);
      return {
        npi: p.npi,
        name: p.entity_type === 'Individual' ? `${p.first_name} ${p.last_name}`.trim() : p.organization_name || '',
        entity_type: p.entity_type,
        credential: p.credential || '',
        specialty: tax?.taxonomy_description || '',
        city: loc?.city || '',
        state: loc?.state || '',
      };
    });

    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a healthcare provider research specialist. For each provider below, find additional publicly available information:

1. Practice website URL
2. Hospital/system affiliations
3. Board certifications & key specialties
4. Education/training background
5. Languages spoken
6. Accepting new patients status

Providers:
${JSON.stringify(batch, null, 1)}

Only return information you find with reasonable confidence from public sources. Do not fabricate data.`,
      add_context_from_internet: true,
      response_json_schema: {
        type: "object",
        properties: {
          profiles: {
            type: "array",
            items: {
              type: "object",
              properties: {
                npi: { type: "string" },
                name: { type: "string" },
                website: { type: "string" },
                affiliations: { type: "array", items: { type: "string" } },
                board_certifications: { type: "array", items: { type: "string" } },
                education: { type: "string" },
                languages: { type: "array", items: { type: "string" } },
                accepting_patients: { type: "string" },
                confidence: { type: "string" },
                notes: { type: "string" }
              }
            }
          },
          summary: { type: "string" }
        }
      }
    });

    setResults(res);
    setLoading(false);
    const enriched = (res.profiles || []).filter(p => p.website || p.affiliations?.length || p.board_certifications?.length || p.education || p.languages?.length);
    toast.success(`Found enrichment data for ${enriched.length} of ${batch.length} providers`);
  };

  const handleApply = async (profile) => {
    setApplying(prev => new Set([...prev, profile.npi]));

    const provider = providers.find(p => p.npi === profile.npi);
    if (provider) {
      const enrichmentData = {};
      const enrichmentParts = [];
      if (profile.website) enrichmentParts.push(`Website: ${profile.website}`);
      if (profile.affiliations?.length) enrichmentParts.push(`Affiliations: ${profile.affiliations.join(', ')}`);
      if (profile.board_certifications?.length) enrichmentParts.push(`Certifications: ${profile.board_certifications.join(', ')}`);
      if (profile.education) enrichmentParts.push(`Education: ${profile.education}`);
      if (profile.languages?.length) enrichmentParts.push(`Languages: ${profile.languages.join(', ')}`);

      if (profile.website && !provider.email_source) {
        enrichmentData.email_source = profile.website;
      }

      await base44.entities.DataQualityAlert.create({
        alert_type: 'new_issue_detected',
        title: 'Profile Augmentation',
        rule_id: `augment_${profile.npi}`,
        rule_name: 'Profile Augmentation',
        category: 'completeness',
        severity: 'low',
        summary: enrichmentParts.join(' | '),
        npi: profile.npi,
        status: 'accepted',
        ai_root_cause: profile.notes || 'AI-augmented profile data',
        ai_solutions: [
          profile.website || '',
          (profile.affiliations || []).join(', '),
          (profile.board_certifications || []).join(', '),
        ].filter(Boolean),
      });

      if (Object.keys(enrichmentData).length > 0) {
        await base44.entities.Provider.update(provider.id, enrichmentData);
      }
    }

    setApplying(prev => { const n = new Set(prev); n.delete(profile.npi); return n; });
    setApplied(prev => new Set([...prev, profile.npi]));
    toast.success(`Saved enrichment for ${profile.name}`);
    if (onComplete) onComplete();
  };

  const handleApplyAll = async () => {
    const enriched = (results?.profiles || []).filter(
      p => (p.website || p.affiliations?.length || p.board_certifications?.length) && !applied.has(p.npi)
    );
    for (const profile of enriched) {
      await handleApply(profile);
    }
  };

  const enrichedProfiles = (results?.profiles || []).filter(p => p.website || p.affiliations?.length || p.board_certifications?.length || p.education || p.languages?.length);
  const unappliedCount = enrichedProfiles.filter(p => !applied.has(p.npi)).length;

  return (
    <div className="space-y-4">
      {/* Description */}
      <div className="flex items-start gap-3 p-4 bg-teal-50/70 rounded-xl border border-teal-100">
        <div className="p-2 rounded-lg bg-teal-100">
          <Globe className="w-4 h-4 text-teal-600" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Augment Provider Profiles</h3>
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
            AI researches public sources to find practice websites, hospital affiliations, board certifications, 
            education, and languages for your providers. Select providers in the Directory tab first, or it will use the top 15.
          </p>
        </div>
      </div>

      {/* Action */}
      <Card className="bg-white">
        <CardContent className="pt-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-500">
              {providerCount} provider{providerCount !== 1 ? 's' : ''} will be researched
            </div>
            {enrichedProfiles.length > 0 && unappliedCount > 0 && (
              <Button size="sm" variant="outline" className="h-7 text-xs text-teal-700 border-teal-200 hover:bg-teal-50" onClick={handleApplyAll}>
                <Check className="w-3 h-3 mr-1" /> Save All ({unappliedCount})
              </Button>
            )}
          </div>
          <Button onClick={handleAugment} disabled={loading || providerCount === 0} className="w-full bg-teal-600 hover:bg-teal-700 h-9">
            {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Researching Public Sources...</> : <><Globe className="w-4 h-4 mr-2" /> Augment {providerCount} Provider{providerCount !== 1 ? 's' : ''}</>}
          </Button>
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && (
        <Card className="border-teal-200 bg-teal-50/50">
          <CardContent className="py-8 flex flex-col items-center gap-2">
            <Loader2 className="w-6 h-6 text-teal-600 animate-spin" />
            <p className="text-sm font-medium text-teal-800">Researching {providerCount} providers...</p>
            <p className="text-xs text-teal-600">Searching websites, directories, and public registries</p>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {results && !loading && (
        <div className="space-y-3">
          {results.summary && (
            <div className="flex items-start gap-2 px-3 py-2 bg-slate-50 rounded-lg">
              <Info className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
              <p className="text-xs text-slate-500">{results.summary}</p>
            </div>
          )}

          {applied.size > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 bg-green-50 rounded-lg border border-green-200">
              <Check className="w-3.5 h-3.5 text-green-600" />
              <span className="text-xs font-medium text-green-700">{applied.size} profile{applied.size !== 1 ? 's' : ''} saved</span>
            </div>
          )}

          {enrichedProfiles.length > 0 ? (
            <div className="space-y-3">
              {enrichedProfiles.map((p, i) => (
                <ProfileCard key={i} profile={p} applying={applying} applied={applied} onApply={handleApply} />
              ))}
            </div>
          ) : (
            <Card className="bg-slate-50 border-dashed">
              <CardContent className="py-8 text-center">
                <Globe className="w-6 h-6 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-500">No additional data found for these providers</p>
                <p className="text-xs text-slate-400 mt-1">Try selecting different providers from the directory</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
        <p className="text-[10px] text-amber-700 leading-relaxed">
          Augmented data is sourced from public websites and directories. Verify accuracy before using for outreach or clinical decisions.
        </p>
      </div>
    </div>
  );
}
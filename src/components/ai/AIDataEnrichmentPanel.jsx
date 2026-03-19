import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import { Sparkles, Loader2, Check, X, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

function GapBadge({ count }) {
  if (count === 0) return <Badge className="bg-green-100 text-green-700 text-[9px]">Complete</Badge>;
  return <Badge className="bg-amber-100 text-amber-700 text-[9px]">{count} missing</Badge>;
}

function SuggestionRow({ suggestion, onAccept, onReject, accepting }) {
  const confColor = {
    high: 'bg-green-100 text-green-700',
    medium: 'bg-amber-100 text-amber-700',
    low: 'bg-red-100 text-red-700',
  };

  return (
    <div className="flex items-start gap-3 p-3 bg-slate-800/40 rounded-lg border border-slate-700/50 hover:border-slate-700/50 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-semibold text-slate-700">{suggestion.field_label}</span>
          <Badge className={`text-[9px] ${confColor[suggestion.confidence] || confColor.low}`}>
            {suggestion.confidence}
          </Badge>
          {suggestion.is_correction && (
            <Badge className="bg-blue-100 text-blue-700 text-[9px]">Correction</Badge>
          )}
        </div>
        {suggestion.current_value && (
          <p className="text-[10px] text-slate-400 line-through">{suggestion.current_value}</p>
        )}
        <p className="text-sm text-slate-800 font-medium">{suggestion.suggested_value}</p>
        {suggestion.reason && (
          <p className="text-[10px] text-slate-400 mt-0.5">{suggestion.reason}</p>
        )}
      </div>
      <div className="flex gap-1 shrink-0">
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-green-600 hover:bg-green-50"
          onClick={() => onAccept(suggestion)}
          disabled={accepting}
        >
          {accepting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-slate-400 hover:bg-red-50 hover:text-red-500"
          onClick={() => onReject(suggestion)}
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

export default function AIDataEnrichmentPanel({
  provider,
  location,
  taxonomies = [],
  entityType = 'provider', // 'provider' | 'organization' | 'location'
  onDataUpdated,
}) {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState(null);
  const [accepted, setAccepted] = useState(new Set());
  const [rejected, setRejected] = useState(new Set());
  const [acceptingId, setAcceptingId] = useState(null);
  const [showGaps, setShowGaps] = useState(false);

  const gaps = useMemo(() => {
    const g = [];
    if (!provider) return g;

    // Provider-level gaps
    if (entityType !== 'location') {
      if (!provider.credential && provider.entity_type === 'Individual') g.push({ entity: 'provider', field: 'credential', label: 'Credential' });
      if (!provider.organization_name && provider.entity_type === 'Organization') g.push({ entity: 'provider', field: 'organization_name', label: 'Organization Name' });
      if (provider.entity_type === 'Individual' && !provider.gender) g.push({ entity: 'provider', field: 'gender', label: 'Gender' });
      if (!provider.email) g.push({ entity: 'provider', field: 'email', label: 'Email' });
    }

    // Location gaps
    if (location) {
      if (!location.address_1) g.push({ entity: 'location', field: 'address_1', label: 'Street Address' });
      if (!location.city) g.push({ entity: 'location', field: 'city', label: 'City' });
      if (!location.state) g.push({ entity: 'location', field: 'state', label: 'State' });
      if (!location.zip) g.push({ entity: 'location', field: 'zip', label: 'ZIP' });
      if (!location.phone) g.push({ entity: 'location', field: 'phone', label: 'Phone' });
      if (!location.fax) g.push({ entity: 'location', field: 'fax', label: 'Fax' });
    } else if (entityType !== 'location') {
      g.push({ entity: 'location', field: 'all', label: 'No Location Record' });
    }

    // Taxonomy gaps
    if (taxonomies.length === 0 && entityType !== 'location') {
      g.push({ entity: 'taxonomy', field: 'taxonomy_description', label: 'Specialty' });
    }

    return g;
  }, [provider, location, taxonomies, entityType]);

  const runEnrichment = async () => {
    setLoading(true);
    setSuggestions(null);
    setAccepted(new Set());
    setRejected(new Set());

    const name = provider?.entity_type === 'Individual'
      ? `${provider?.first_name || ''} ${provider?.last_name || ''}`.trim()
      : provider?.organization_name || '';
    const specialty = taxonomies.map(t => t.taxonomy_description).filter(Boolean).join(', ');

    try {
      const res = await base44.integrations.Core.InvokeLLM({
        prompt: `You are a healthcare data enrichment specialist. Analyze this ${entityType} record and:
1. Find missing data fields using NPI registry and public healthcare directories
2. Identify potential corrections to existing data (typos, outdated info, format issues)
3. Suggest related entities or connections

CURRENT DATA:
- NPI: ${provider?.npi || 'N/A'}
- Name: ${name || 'N/A'}
- Entity Type: ${provider?.entity_type || entityType}
- Credential: ${provider?.credential || 'MISSING'}
- Gender: ${provider?.gender || 'MISSING'}
- Organization: ${provider?.organization_name || 'MISSING'}
- Email: ${provider?.email || 'MISSING'}
- Status: ${provider?.status || 'MISSING'}
- Specialty: ${specialty || 'MISSING'}
- Address: ${location ? `${location.address_1 || 'MISSING'}, ${location.city || 'MISSING'}, ${location.state || 'MISSING'} ${location.zip || 'MISSING'}` : 'NO LOCATION'}
- Phone: ${location?.phone || 'MISSING'}
- Fax: ${location?.fax || 'MISSING'}

IDENTIFIED GAPS: ${gaps.map(g => g.label).join(', ') || 'None'}

Return suggestions for filling missing data AND potential corrections. Be thorough but only return data you have reasonable confidence in.`,
        add_context_from_internet: true,
        response_json_schema: {
          type: "object",
          properties: {
            suggestions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  entity: { type: "string", enum: ["provider", "location", "taxonomy"] },
                  field: { type: "string" },
                  field_label: { type: "string" },
                  current_value: { type: ["string", "null"] },
                  suggested_value: { type: "string" },
                  confidence: { type: "string", enum: ["high", "medium", "low"] },
                  is_correction: { type: "boolean" },
                  reason: { type: "string" },
                }
              }
            },
            summary: { type: "string" },
            data_completeness_score: { type: "number" },
          }
        }
      });

      const enriched = (res.suggestions || []).map((s, i) => ({
        ...s,
        id: s.id || `sug_${i}`,
      }));

      setSuggestions({
        items: enriched,
        summary: res.summary,
        completeness: res.data_completeness_score,
      });
    } catch (err) {
      toast.error('Enrichment analysis failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (sug) => {
    setAcceptingId(sug.id);

    try {
      if (sug.entity === 'provider' && provider?.id) {
        const update = {};
        if (['credential', 'gender', 'organization_name', 'email'].includes(sug.field)) {
          update[sug.field] = sug.suggested_value;
        }
        if (sug.field === 'email') {
          update.email_confidence = sug.confidence;
          update.email_source = 'AI enrichment';
        }
        if (Object.keys(update).length > 0) {
          await base44.entities.Provider.update(provider.id, update);
        }
      } else if (sug.entity === 'location' && location?.id) {
        const update = {};
        if (['address_1', 'address_2', 'city', 'state', 'zip', 'phone', 'fax'].includes(sug.field)) {
          update[sug.field] = sug.suggested_value;
        }
        if (Object.keys(update).length > 0) {
          await base44.entities.ProviderLocation.update(location.id, update);
        }
      } else if (sug.entity === 'taxonomy') {
        if (taxonomies.length > 0 && taxonomies[0].id) {
          await base44.entities.ProviderTaxonomy.update(taxonomies[0].id, {
            taxonomy_description: sug.suggested_value,
          });
        } else if (provider?.npi) {
          await base44.entities.ProviderTaxonomy.create({
            npi: provider.npi,
            taxonomy_description: sug.suggested_value,
            primary_flag: true,
          });
        }
      }

      setAccepted(prev => new Set([...prev, sug.id]));
      toast.success(`Updated ${sug.field_label}`);
      if (onDataUpdated) onDataUpdated();
    } catch (err) {
      toast.error(`Failed to update ${sug.field_label}`);
    } finally {
      setAcceptingId(null);
    }
  };

  const handleReject = (sug) => {
    setRejected(prev => new Set([...prev, sug.id]));
  };

  const handleAcceptAll = async () => {
    const highConf = (suggestions?.items || []).filter(
      s => s.confidence === 'high' && !accepted.has(s.id) && !rejected.has(s.id)
    );
    for (const sug of highConf) {
      await handleAccept(sug);
    }
  };

  const visibleSuggestions = (suggestions?.items || []).filter(
    s => !accepted.has(s.id) && !rejected.has(s.id)
  );
  const newFieldSuggestions = visibleSuggestions.filter(s => !s.is_correction);
  const correctionSuggestions = visibleSuggestions.filter(s => s.is_correction);

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-violet-500" />
          AI Data Enrichment
        </CardTitle>
        <Button
          size="sm"
          onClick={runEnrichment}
          disabled={loading}
          className="bg-violet-600 hover:bg-violet-700 h-7 text-xs"
        >
          {loading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}
          {loading ? 'Analyzing...' : suggestions ? 'Re-analyze' : 'Enrich'}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Data gaps summary */}
        <button
          onClick={() => setShowGaps(!showGaps)}
          className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <div className="flex items-center gap-2">
            {showGaps ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
            <span className="text-xs font-medium text-slate-600">Data Gaps</span>
          </div>
          <GapBadge count={gaps.length} />
        </button>

        {showGaps && gaps.length > 0 && (
          <div className="space-y-1 pl-3">
            {gaps.map((g, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-slate-500">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                <span>{g.label}</span>
                <span className="text-slate-300">({g.entity})</span>
              </div>
            ))}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-6 gap-2 text-violet-500">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-xs">Searching public registries & directories...</span>
          </div>
        )}

        {/* Not run yet */}
        {!suggestions && !loading && (
          <p className="text-[10px] text-slate-400 text-center py-2">
            AI will search NPI registry, CMS data, and public directories to fill gaps and suggest corrections.
          </p>
        )}

        {/* Results */}
        {suggestions && (
          <div className="space-y-3">
            {/* Completeness score */}
            {suggestions.completeness != null && (
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-500 to-blue-500 transition-all"
                    style={{ width: `${suggestions.completeness}%` }}
                  />
                </div>
                <span className="text-xs font-semibold text-slate-700">{suggestions.completeness}%</span>
              </div>
            )}

            {suggestions.summary && (
              <p className="text-[10px] text-slate-500 italic">{suggestions.summary}</p>
            )}

            {accepted.size > 0 && (
              <p className="text-[10px] text-green-600 font-medium">
                ✓ {accepted.size} suggestion{accepted.size !== 1 ? 's' : ''} applied
              </p>
            )}

            {/* Accept all high-confidence */}
            {visibleSuggestions.filter(s => s.confidence === 'high').length > 1 && (
              <Button
                size="sm"
                variant="outline"
                className="w-full h-7 text-xs text-violet-700 border-violet-200 hover:bg-violet-50"
                onClick={handleAcceptAll}
              >
                <Check className="w-3 h-3 mr-1" /> Accept All High-Confidence ({visibleSuggestions.filter(s => s.confidence === 'high').length})
              </Button>
            )}

            {/* New field suggestions */}
            {newFieldSuggestions.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Missing Fields</p>
                <div className="space-y-1.5">
                  {newFieldSuggestions.map(s => (
                    <SuggestionRow
                      key={s.id}
                      suggestion={s}
                      onAccept={handleAccept}
                      onReject={handleReject}
                      accepting={acceptingId === s.id}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Corrections */}
            {correctionSuggestions.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Suggested Corrections
                </p>
                <div className="space-y-1.5">
                  {correctionSuggestions.map(s => (
                    <SuggestionRow
                      key={s.id}
                      suggestion={s}
                      onAccept={handleAccept}
                      onReject={handleReject}
                      accepting={acceptingId === s.id}
                    />
                  ))}
                </div>
              </div>
            )}

            {visibleSuggestions.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-3">All suggestions have been reviewed.</p>
            )}

            <div className="flex items-start gap-1.5 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
              <AlertTriangle className="w-3 h-3 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-[10px] text-amber-700">AI-sourced data. Review before accepting.</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
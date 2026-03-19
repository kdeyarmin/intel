import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import { Phone, Mail, Globe, Loader2, Sparkles, Check, Copy, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

export default function AIContactEnrichment({ provider, location, taxonomies }) {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copiedField, setCopiedField] = useState(null);

  const name = provider?.entity_type === 'Individual'
    ? `${provider.first_name || ''} ${provider.last_name || ''}`.trim()
    : provider?.organization_name || '';

  const missingFields = [];
  if (!location?.phone) missingFields.push('phone');
  if (!location?.fax) missingFields.push('fax');
  missingFields.push('email'); // always try email since it's not in entity
  missingFields.push('website');

  const enrich = async () => {
    setLoading(true);
    try {
      const specialty = (taxonomies || []).map(t => t.taxonomy_description).filter(Boolean).join(', ');

      const res = await base44.integrations.Core.InvokeLLM({
        prompt: `Find contact information for this healthcare provider. Search the web thoroughly.

PROVIDER:
- Name: ${name}
- NPI: ${provider?.npi}
- Credential: ${provider?.credential || 'N/A'}
- Organization: ${provider?.organization_name || 'N/A'}
- Specialty: ${specialty || 'N/A'}
- City: ${location?.city || 'N/A'}, ${location?.state || 'N/A'} ${location?.zip || ''}
- Known phone: ${location?.phone || 'none'}
- Known fax: ${location?.fax || 'none'}

Find: email addresses, phone numbers, fax, and website URL.
For each piece of info, indicate confidence ("high" = publicly listed, "medium" = inferred from pattern, "low" = uncertain).
Also find any social profiles (LinkedIn, Doximity, Healthgrades).`,
        add_context_from_internet: true,
        response_json_schema: {
          type: "object",
          properties: {
            emails: { type: "array", items: { type: "object", properties: { value: { type: "string" }, confidence: { type: "string" }, source: { type: "string" } } } },
            phones: { type: "array", items: { type: "object", properties: { value: { type: "string" }, confidence: { type: "string" }, source: { type: "string" } } } },
            fax: { type: "object", properties: { value: { type: "string" }, confidence: { type: "string" }, source: { type: "string" } } },
            website: { type: "object", properties: { value: { type: "string" }, confidence: { type: "string" } } },
            social_profiles: { type: "array", items: { type: "object", properties: { platform: { type: "string" }, url: { type: "string" } } } },
            organization_domain: { type: "string" },
            summary: { type: "string" }
          }
        }
      });

      setResults(res);
    } catch (err) {
      toast.error('Enrichment failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const copyValue = (val, field) => {
    navigator.clipboard.writeText(val);
    setCopiedField(field);
    toast.success('Copied');
    setTimeout(() => setCopiedField(null), 2000);
  };

  const confColor = { high: 'bg-green-100 text-green-700', medium: 'bg-amber-100 text-amber-700', low: 'bg-red-100 text-red-700' };

  const ContactRow = ({ icon: Icon, label, items = [] }) => {
    if (!items.length) return null;
    return (
      <div className="space-y-1">
        <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide flex items-center gap-1">
          <Icon className="w-3 h-3" /> {label}
        </p>
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2 bg-slate-800/40 rounded-lg px-3 py-1.5 border border-slate-700/50">
            <span className="text-xs font-medium text-slate-700 flex-1 truncate">{item.value}</span>
            <Badge className={`text-[9px] ${confColor[item.confidence] || confColor.low}`}>{item.confidence}</Badge>
            <button onClick={() => copyValue(item.value, `${label}-${i}`)} className="text-slate-400 hover:text-slate-600">
              {copiedField === `${label}-${i}` ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
            </button>
          </div>
        ))}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-violet-500" />
          AI Contact Enrichment
        </CardTitle>
        <Button size="sm" onClick={enrich} disabled={loading} className="bg-violet-600 hover:bg-violet-700 h-7 text-xs">
          {loading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}
          {loading ? 'Enriching...' : results ? 'Re-enrich' : 'Enrich'}
        </Button>
      </CardHeader>
      <CardContent>
        {!results && !loading && (
          <div className="text-center py-4">
            <p className="text-xs text-slate-400 mb-1">Automatically find missing contact info</p>
            <div className="flex flex-wrap gap-1 justify-center">
              {missingFields.map(f => <Badge key={f} variant="outline" className="text-[9px]">{f}</Badge>)}
            </div>
          </div>
        )}
        {loading && (
          <div className="flex items-center justify-center py-6 gap-2 text-violet-500">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-xs">Searching the web for contact info...</span>
          </div>
        )}
        {results && (
          <div className="space-y-3">
            <ContactRow icon={Mail} label="Emails" items={results.emails || []} />
            <ContactRow icon={Phone} label="Phone Numbers" items={results.phones || []} />
            {results.fax?.value && <ContactRow icon={Phone} label="Fax" items={[results.fax]} />}
            {results.website?.value && (
              <div>
                <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide flex items-center gap-1">
                  <Globe className="w-3 h-3" /> Website
                </p>
                <a href={results.website.value.startsWith('http') ? results.website.value : `https://${results.website.value}`}
                  target="_blank" rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:underline">{results.website.value}</a>
              </div>
            )}
            {results.social_profiles?.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide mb-1">Profiles</p>
                <div className="flex flex-wrap gap-1.5">
                  {results.social_profiles.map((p, i) => (
                    <a key={i} href={p.url} target="_blank" rel="noopener noreferrer">
                      <Badge variant="outline" className="text-[10px] hover:bg-blue-50 cursor-pointer">{p.platform}</Badge>
                    </a>
                  ))}
                </div>
              </div>
            )}
            {results.summary && <p className="text-[10px] text-slate-500 italic">{results.summary}</p>}
            <div className="flex items-start gap-1.5 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
              <AlertTriangle className="w-3 h-3 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-[10px] text-amber-700">AI-generated suggestions. Verify before outreach.</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import { Mail, Loader2, Search, AlertTriangle, Copy, Check } from 'lucide-react';
import EmailValidationBadge from '../emailBot/EmailValidationBadge';
import { toast } from 'sonner';

export default function AIEmailFinder({ provider, locations, taxonomies }) {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState(null);

  const findEmails = async () => {
    setLoading(true);
    try {
      const name = provider.entity_type === 'Individual'
        ? `${provider.first_name || ''} ${provider.last_name || ''}`.trim()
        : provider.organization_name || '';

      const primaryLoc = locations?.find(l => l.is_primary) || locations?.[0];
      const specialty = (taxonomies || []).map(t => t.taxonomy_description).filter(Boolean).join(', ');

      const prompt = `Find likely professional email addresses for this healthcare provider. Search the web for any publicly available contact information.

PROVIDER:
- Name: ${name}
- NPI: ${provider.npi}
- Credential: ${provider.credential || 'N/A'}
- Organization: ${provider.organization_name || 'N/A'}
- Specialty: ${specialty || 'N/A'}
- Location: ${primaryLoc ? `${primaryLoc.city || ''}, ${primaryLoc.state || ''}` : 'N/A'}
- Phone: ${primaryLoc?.phone || 'N/A'}

Instructions:
1. Search for this provider's practice website, hospital affiliation, or organization website.
2. Look for publicly listed email addresses or contact forms.
3. If no direct email is found, infer the most likely email patterns based on the organization domain (e.g. first.last@hospital.org).
4. For each email, rate your confidence: "high" if found publicly, "medium" if inferred from a known domain pattern, "low" if purely guessed.
5. Return up to 5 possible emails.
6. PRACTICE EMAILS ARE ACCEPTABLE: If you cannot find a personal/direct email, return practice or office emails (e.g., info@practice.com, office@clinic.com, frontdesk@hospital.org). Mark these with source "practice email". Always prefer a direct provider email, but never return zero results if a practice email exists.

IMPORTANT: Be honest about confidence levels. Mark as "low" if you're guessing.`;

      const res = await base44.integrations.Core.InvokeLLM({
        prompt,
        add_context_from_internet: true,
        response_json_schema: {
          type: "object",
          properties: {
            emails: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  email: { type: "string" },
                  confidence: { type: "string", enum: ["high", "medium", "low"] },
                  source: { type: "string" },
                }
              }
            },
            organization_domain: { type: "string" },
            notes: { type: "string" }
          }
        }
      });

      const emails = (res.emails || []).filter(e => e.email && e.email.includes('@'));

      // Validate emails
      let validations = [];
      if (emails.length > 0) {
        const provName = provider.entity_type === 'Individual'
          ? `${provider.first_name || ''} ${provider.last_name || ''}`.trim()
          : provider.organization_name || '';
        const valRes = await base44.integrations.Core.InvokeLLM({
          prompt: `You are an email deliverability expert. Validate these emails for healthcare provider "${provName}" (NPI: ${provider.npi}).

EMAILS:
${emails.map((e, i) => `${i+1}. ${e.email} (confidence: ${e.confidence}, source: ${e.source})`).join('\n')}

CONTEXT: Type=${provider.entity_type}, Org=${provider.organization_name || 'N/A'}, Credential=${provider.credential || 'N/A'}

For each email assign:
- "valid" = high likelihood of being deliverable and correct
- "risky" = might work but has concerns (role-based, catch-all, pattern mismatch)
- "invalid" = likely undeliverable (bad format, fake domain, wrong person)`,
          response_json_schema: {
            type: "object",
            properties: {
              validations: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    email: { type: "string" },
                    status: { type: "string", enum: ["valid", "risky", "invalid"] },
                    reason: { type: "string" }
                  }
                }
              }
            }
          }
        });
        validations = valRes.validations || [];
      }

      // Merge validations into results
      const enrichedEmails = (res.emails || []).map(e => {
        const v = validations.find(val => val.email === e.email);
        return { ...e, validation_status: v?.status || 'unknown', validation_reason: v?.reason || '' };
      });
      res.emails = enrichedEmails;

      setResults(res);

      // Auto-save the best email to the provider record
      if (emails.length > 0 && provider?.id) {
        const best = enrichedEmails[0];
        try {
          await base44.entities.Provider.update(provider.id, {
            email: best.email,
            email_confidence: best.confidence,
            email_source: best.source || '',
            email_validation_status: best.validation_status || 'unknown',
            email_validation_reason: best.validation_reason || '',
            additional_emails: enrichedEmails.slice(1).map(e => ({
              email: e.email,
              confidence: e.confidence,
              source: e.source,
              validation_status: e.validation_status,
            })),
            email_searched_at: new Date().toISOString(),
          });
        } catch (updateErr) {
          console.error('Failed to auto-save email:', updateErr);
        }
      }
    } catch (err) {
      toast.error('Email search failed: ' + (err.message || 'Unknown error'));
      setResults(null);
    } finally {
      setLoading(false);
    }
  };

  const copyEmail = (email, idx) => {
    navigator.clipboard.writeText(email);
    setCopiedIdx(idx);
    toast.success('Email copied');
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const confColors = {
    high: 'bg-green-100 text-green-800',
    medium: 'bg-yellow-100 text-yellow-800',
    low: 'bg-red-100 text-red-800',
  };

  return (
    <Card className="bg-gray-100">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Mail className="w-4 h-4 text-blue-600" />
          AI Email Finder
        </CardTitle>
        <Button
          size="sm"
          onClick={findEmails}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700"
        >
          {loading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Search className="w-3 h-3 mr-1" />}
          {loading ? 'Searching...' : results ? 'Search Again' : 'Find Emails'}
        </Button>
      </CardHeader>
      <CardContent>
        {!results && !loading && (
          <p className="text-sm text-gray-400 text-center py-4">
            Click "Find Emails" to search for this provider's contact information
          </p>
        )}
        {loading && (
          <div className="flex items-center justify-center py-6 gap-2 text-blue-500">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Searching the web for contact info...</span>
          </div>
        )}
        {results && (
          <div className="space-y-3">
            {results.emails?.length > 0 ? (
              <div className="space-y-2">
                {results.emails.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-900 truncate">{item.email}</span>
                        <Badge className={confColors[item.confidence] + ' text-xs'}>
                          {item.confidence}
                        </Badge>
                        <EmailValidationBadge
                          status={item.validation_status}
                          reason={item.validation_reason}
                          size="sm"
                        />
                      </div>
                      {item.source && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate">{item.source}</p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      onClick={() => copyEmail(item.email, idx)}
                    >
                      {copiedIdx === idx ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 text-center py-2">No email addresses found</p>
            )}

            {results.organization_domain && (
              <p className="text-xs text-gray-500">
                Organization domain: <span className="font-medium">{results.organization_domain}</span>
              </p>
            )}

            {results.notes && (
              <p className="text-xs text-gray-500">{results.notes}</p>
            )}

            <div className="flex items-start gap-1.5 bg-amber-50 border border-amber-200 rounded-lg p-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700">
                These are AI-generated suggestions, not verified addresses. Always confirm before sending outreach.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
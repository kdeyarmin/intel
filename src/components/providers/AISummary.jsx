import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { Sparkles, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export default function AISummary({ provider, taxonomies, utilization, referral, locations, score }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setLoading(true);
    const name = provider.entity_type === 'Individual'
      ? `${provider.first_name || ''} ${provider.last_name || ''}`.trim()
      : provider.organization_name || provider.npi;

    const prompt = `Write a concise 3-4 paragraph executive summary for the following healthcare provider profile. Use a professional, analytical tone suitable for a sales or business development team.

PROVIDER:
- Name: ${name}
- NPI: ${provider.npi}
- Credential: ${provider.credential || 'N/A'}
- Entity Type: ${provider.entity_type}
- Status: ${provider.status}
- Specialties: ${(taxonomies || []).map(t => t.taxonomy_description || t.taxonomy_code).join(', ') || 'N/A'}
- Locations: ${locations?.length || 0} on file, primary in ${locations?.find(l => l.is_primary)?.city || locations?.[0]?.city || 'N/A'}, ${locations?.find(l => l.is_primary)?.state || locations?.[0]?.state || 'N/A'}

UTILIZATION (most recent):
- Total Services: ${utilization?.total_services?.toLocaleString() || 'N/A'}
- Medicare Beneficiaries: ${utilization?.total_medicare_beneficiaries?.toLocaleString() || 'N/A'}
- Total Medicare Payment: $${utilization?.total_medicare_payment?.toLocaleString() || 'N/A'}
- Drug Services: ${utilization?.drug_services?.toLocaleString() || 'N/A'}

REFERRALS (most recent):
- Total Referrals: ${referral?.total_referrals?.toLocaleString() || 'N/A'}
- Home Health: ${referral?.home_health_referrals?.toLocaleString() || 'N/A'}
- Hospice: ${referral?.hospice_referrals?.toLocaleString() || 'N/A'}
- SNF: ${referral?.snf_referrals?.toLocaleString() || 'N/A'}
- DME: ${referral?.dme_referrals?.toLocaleString() || 'N/A'}

LEAD SCORE: ${score?.score || 'N/A'}/100
${score?.reasons?.length ? 'Score Reasons: ' + score.reasons.join('; ') : ''}

Summarize who this provider is, their practice characteristics, notable utilization/referral patterns, and their potential value as a business lead. Highlight any standout metrics.`;

    const result = await base44.integrations.Core.InvokeLLM({ prompt });
    setSummary(result);
    setLoading(false);
  };

  return (
    <Card className="bg-gray-100">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-600" />
          AI Provider Summary
        </CardTitle>
        <Button
          size="sm"
          onClick={generate}
          disabled={loading}
          className="bg-purple-600 hover:bg-purple-700"
        >
          {loading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}
          {loading ? 'Generating...' : summary ? 'Refresh' : 'Generate'}
        </Button>
      </CardHeader>
      <CardContent>
        {!summary && !loading && (
          <p className="text-sm text-gray-400 text-center py-6">
            Click "Generate" to create an AI-powered executive summary of this provider
          </p>
        )}
        {loading && (
          <div className="flex items-center justify-center py-8 gap-2 text-purple-500">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Analyzing provider data...</span>
          </div>
        )}
        {summary && (
          <div className="prose prose-sm max-w-none text-gray-700">
            <ReactMarkdown>{summary}</ReactMarkdown>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
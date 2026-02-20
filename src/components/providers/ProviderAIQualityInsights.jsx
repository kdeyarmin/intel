import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2, AlertTriangle, CheckCircle2, Eye } from 'lucide-react';

export default function ProviderAIQualityInsights({ provider, locations, utilizations, referrals, taxonomies }) {
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState(null);

  const runAnalysis = async () => {
    setAnalyzing(true);
    const name = provider.entity_type === 'Individual'
      ? `${provider.first_name || ''} ${provider.last_name || ''}`.trim()
      : provider.organization_name || provider.npi;

    const prompt = `Analyze this healthcare provider's data quality. Identify anomalies, missing data, and inconsistencies.

Provider: ${name} (NPI: ${provider.npi}, ${provider.entity_type}, Credential: ${provider.credential || 'N/A'})
Status: ${provider.status}, Gender: ${provider.gender || 'N/A'}
Email: ${provider.email || 'N/A'} (confidence: ${provider.email_confidence || 'N/A'})

Locations (${locations?.length || 0}):
${(locations || []).slice(0, 5).map(l => `  ${l.location_type}: ${l.city || ''}, ${l.state || ''} ${l.zip || ''} Phone: ${l.phone || 'N/A'}`).join('\n')}

Specialties: ${(taxonomies || []).map(t => t.taxonomy_description).join(', ') || 'N/A'}

Utilization: ${(utilizations || []).slice(0, 3).map(u => `Year ${u.year}: ${u.total_services || 0} services, ${u.total_medicare_beneficiaries || 0} beneficiaries, $${u.total_medicare_payment || 0} payment`).join('; ') || 'N/A'}

Referrals: ${(referrals || []).slice(0, 3).map(r => `Year ${r.year}: ${r.total_referrals || 0} total, ${r.home_health_referrals || 0} HH, ${r.hospice_referrals || 0} hospice`).join('; ') || 'N/A'}

Look for: volume anomalies, address conflicts, missing critical fields, utilization/referral ratio issues, data staleness.`;

    const res = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          quality_score: { type: 'number', description: '0-100' },
          issues: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                severity: { type: 'string', enum: ['high', 'medium', 'low'] },
                description: { type: 'string' },
                recommendation: { type: 'string' },
              },
            },
          },
          summary: { type: 'string' },
        },
      },
    });
    setResults(res);
    setAnalyzing(false);
  };

  const scoreColor = (s) => s >= 80 ? 'text-emerald-400' : s >= 60 ? 'text-amber-400' : 'text-red-400';
  const sevColors = {
    high: 'bg-red-500/15 text-red-400 border-red-500/20',
    medium: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
    low: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  };

  return (
    <Card className="bg-[#141d30] border-slate-700/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2 text-slate-200">
            <Sparkles className="w-4 h-4 text-violet-400" />
            AI Quality Insights
          </CardTitle>
          <Button
            onClick={runAnalysis}
            disabled={analyzing}
            size="sm"
            className="bg-violet-600 hover:bg-violet-700 text-white gap-1 h-7 text-xs"
          >
            {analyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />}
            {analyzing ? 'Analyzing...' : results ? 'Re-analyze' : 'Analyze'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!results && !analyzing && (
          <p className="text-xs text-slate-500 text-center py-4">Click Analyze to run AI quality check on this provider's data</p>
        )}
        {analyzing && (
          <div className="text-center py-4">
            <Loader2 className="w-5 h-5 mx-auto mb-2 animate-spin text-violet-400" />
            <p className="text-xs text-slate-400">Analyzing provider data...</p>
          </div>
        )}
        {results && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className={`text-2xl font-bold ${scoreColor(results.quality_score)}`}>{results.quality_score}</span>
              <span className="text-xs text-slate-500">/ 100</span>
              <p className="text-xs text-slate-400 flex-1">{results.summary}</p>
            </div>
            {results.issues?.length > 0 ? (
              <div className="space-y-1.5">
                {results.issues.map((issue, i) => (
                  <div key={i} className="bg-slate-800/40 border border-slate-700/40 rounded-lg p-2.5">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertTriangle className="w-3 h-3 text-amber-400 flex-shrink-0" />
                      <span className="text-xs font-medium text-slate-300">{issue.title}</span>
                      <Badge className={`text-[9px] ml-auto ${sevColors[issue.severity]}`}>{issue.severity}</Badge>
                    </div>
                    <p className="text-[11px] text-slate-400 mb-1">{issue.description}</p>
                    {issue.recommendation && (
                      <p className="text-[10px] text-emerald-400/80">{issue.recommendation}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
                <CheckCircle2 className="w-4 h-4" />
                No quality issues detected
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles, AlertTriangle, CheckCircle2, Eye, Users, MapPin, Activity } from 'lucide-react';

const ANOMALY_ICONS = {
  volume: Activity,
  address: MapPin,
  pattern: AlertTriangle,
  provider: Users,
};

function AnomalyCard({ anomaly }) {
  const Icon = ANOMALY_ICONS[anomaly.category] || AlertTriangle;
  const severityColors = {
    high: 'bg-red-500/15 text-red-400 border-red-500/20',
    medium: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
    low: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  };

  return (
    <div className="bg-slate-800/40 border border-slate-700/40 rounded-lg p-3 space-y-2">
      <div className="flex items-start gap-2">
        <Icon className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-sm font-medium text-slate-200">{anomaly.title}</span>
            <Badge className={`text-[9px] ${severityColors[anomaly.severity] || severityColors.medium}`}>
              {anomaly.severity}
            </Badge>
          </div>
          <p className="text-xs text-slate-400">{anomaly.description}</p>
        </div>
      </div>
      {anomaly.affected_providers?.length > 0 && (
        <div className="pl-6">
          <p className="text-[10px] text-slate-500 mb-1">Affected Providers ({anomaly.affected_providers.length}):</p>
          <div className="flex flex-wrap gap-1">
            {anomaly.affected_providers.slice(0, 8).map((p, i) => (
              <Badge key={i} className="bg-slate-700/50 text-slate-300 text-[9px] font-mono">{p}</Badge>
            ))}
            {anomaly.affected_providers.length > 8 && (
              <span className="text-[9px] text-slate-500">+{anomaly.affected_providers.length - 8} more</span>
            )}
          </div>
        </div>
      )}
      {anomaly.recommendation && (
        <div className="pl-6 bg-emerald-500/5 border border-emerald-500/20 rounded-md p-2">
          <p className="text-[10px] text-emerald-400">{anomaly.recommendation}</p>
        </div>
      )}
    </div>
  );
}

export default function AIImportQualityAnalysis() {
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState(null);

  const { data: providers = [] } = useQuery({
    queryKey: ['providers_sample_dq'],
    queryFn: () => base44.entities.Provider.list('-updated_date', 200),
    staleTime: 120000,
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['locations_sample_dq'],
    queryFn: () => base44.entities.ProviderLocation.list('-updated_date', 200),
    staleTime: 120000,
  });

  const { data: utilization = [] } = useQuery({
    queryKey: ['util_sample_dq'],
    queryFn: () => base44.entities.CMSUtilization.list('-updated_date', 100),
    staleTime: 120000,
  });

  const { data: referrals = [] } = useQuery({
    queryKey: ['refs_sample_dq'],
    queryFn: () => base44.entities.CMSReferral.list('-updated_date', 100),
    staleTime: 120000,
  });

  const runAnalysis = async () => {
    setAnalyzing(true);
    setResults(null);

    // Build a summary snapshot for the AI
    const providerSummary = providers.slice(0, 50).map(p => ({
      npi: p.npi,
      name: `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.organization_name || p.npi,
      entity_type: p.entity_type,
      credential: p.credential,
      status: p.status,
      gender: p.gender,
      email: p.email ? 'yes' : 'no',
      email_confidence: p.email_confidence,
    }));

    const locationSummary = locations.slice(0, 50).map(l => ({
      npi: l.npi,
      type: l.location_type,
      city: l.city,
      state: l.state,
      zip: l.zip,
      phone: l.phone ? 'yes' : 'no',
    }));

    const utilSummary = utilization.slice(0, 30).map(u => ({
      npi: u.npi,
      year: u.year,
      total_services: u.total_services,
      total_beneficiaries: u.total_medicare_beneficiaries,
      total_payment: u.total_medicare_payment,
    }));

    const refSummary = referrals.slice(0, 30).map(r => ({
      npi: r.npi,
      year: r.year,
      total_referrals: r.total_referrals,
      hh_referrals: r.home_health_referrals,
      hospice_referrals: r.hospice_referrals,
    }));

    // Check for cross-source address conflicts
    const npiLocations = {};
    locations.forEach(l => {
      if (!npiLocations[l.npi]) npiLocations[l.npi] = [];
      npiLocations[l.npi].push(l);
    });
    const conflictNPIs = Object.entries(npiLocations)
      .filter(([, locs]) => {
        const practiceLocs = locs.filter(l => l.location_type === 'Practice');
        if (practiceLocs.length <= 1) return false;
        const states = new Set(practiceLocs.map(l => l.state).filter(Boolean));
        return states.size > 1;
      })
      .map(([npi]) => npi)
      .slice(0, 10);

    const prompt = `You are a healthcare data quality analyst. Analyze the following imported provider data for anomalies, inconsistencies, and data quality issues.

PROVIDER DATA (${providers.length} total, showing 50):
${JSON.stringify(providerSummary, null, 1)}

LOCATION DATA (${locations.length} total, showing 50):
${JSON.stringify(locationSummary, null, 1)}

UTILIZATION DATA (${utilization.length} total, showing 30):
${JSON.stringify(utilSummary, null, 1)}

REFERRAL DATA (${referrals.length} total, showing 30):
${JSON.stringify(refSummary, null, 1)}

NPIs WITH CONFLICTING PRACTICE ADDRESSES (different states): ${conflictNPIs.join(', ') || 'None found'}

Look for:
1. Providers with unusually high patient volumes without corresponding discharge/referral counts
2. Providers with conflicting address information across different locations
3. Unusual patterns in utilization (outliers in services, payments, or beneficiary counts)
4. Missing critical data (no credential, no location, no email)
5. Data consistency issues (active providers with no utilization, high referrals but no utilization)
6. Any other anomalies you notice

Return a structured analysis with specific NPIs and actionable recommendations.`;

    const res = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          overall_health_score: { type: 'number', description: 'Data quality score 0-100' },
          summary: { type: 'string', description: 'One-paragraph executive summary' },
          total_anomalies_found: { type: 'number' },
          anomalies: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                category: { type: 'string', enum: ['volume', 'address', 'pattern', 'provider'] },
                severity: { type: 'string', enum: ['high', 'medium', 'low'] },
                description: { type: 'string' },
                affected_providers: { type: 'array', items: { type: 'string' }, description: 'NPIs affected' },
                recommendation: { type: 'string' },
              },
            },
          },
          providers_needing_review: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                npi: { type: 'string' },
                reason: { type: 'string' },
                priority: { type: 'string', enum: ['high', 'medium', 'low'] },
              },
            },
          },
        },
      },
    });

    setResults(res);
    setAnalyzing(false);
  };

  const scoreColor = (score) => {
    if (score >= 80) return 'text-emerald-400';
    if (score >= 60) return 'text-amber-400';
    return 'text-red-400';
  };

  return (
    <Card className="bg-[#141d30] border-slate-700/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-400" />
            AI Data Quality Analysis
          </CardTitle>
          <Button
            onClick={runAnalysis}
            disabled={analyzing || providers.length === 0}
            className="bg-violet-600 hover:bg-violet-700 text-white gap-1.5"
            size="sm"
          >
            {analyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {analyzing ? 'Analyzing...' : 'Run AI Analysis'}
          </Button>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          AI scans {providers.length} providers, {locations.length} locations, {utilization.length} utilization, and {referrals.length} referral records for anomalies.
        </p>
      </CardHeader>
      <CardContent>
        {!results && !analyzing && (
          <div className="text-center py-8">
            <Sparkles className="w-10 h-10 mx-auto mb-3 text-slate-600" />
            <p className="text-sm text-slate-400">Click "Run AI Analysis" to scan imported data for quality issues</p>
            <p className="text-xs text-slate-500 mt-1">Checks for volume anomalies, address conflicts, missing data, and pattern inconsistencies</p>
          </div>
        )}

        {analyzing && (
          <div className="text-center py-8">
            <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin text-violet-400" />
            <p className="text-sm text-slate-300">Analyzing data quality across all imported records...</p>
            <p className="text-xs text-slate-500 mt-1">This may take 15-30 seconds</p>
          </div>
        )}

        {results && (
          <div className="space-y-5">
            {/* Score + Summary */}
            <div className="flex items-start gap-5 bg-slate-800/40 border border-slate-700/40 rounded-lg p-4">
              <div className="text-center flex-shrink-0">
                <p className={`text-4xl font-bold ${scoreColor(results.overall_health_score)}`}>
                  {results.overall_health_score}
                </p>
                <p className="text-[10px] text-slate-500">Health Score</p>
              </div>
              <div className="flex-1">
                <p className="text-sm text-slate-300 leading-relaxed">{results.summary}</p>
                <div className="flex gap-3 mt-2 text-xs">
                  <Badge className="bg-slate-700/50 text-slate-300">{results.total_anomalies_found} anomalies</Badge>
                  <Badge className="bg-slate-700/50 text-slate-300">{results.providers_needing_review?.length || 0} providers flagged</Badge>
                </div>
              </div>
            </div>

            {/* Anomalies */}
            {results.anomalies?.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-slate-300 mb-2 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  Detected Anomalies ({results.anomalies.length})
                </h4>
                <div className="space-y-2">
                  {results.anomalies.map((a, i) => <AnomalyCard key={i} anomaly={a} />)}
                </div>
              </div>
            )}

            {/* Providers Needing Review */}
            {results.providers_needing_review?.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-slate-300 mb-2 flex items-center gap-2">
                  <Eye className="w-4 h-4 text-cyan-400" />
                  Providers Recommended for Manual Review
                </h4>
                <div className="space-y-1">
                  {results.providers_needing_review.map((p, i) => (
                    <div key={i} className="flex items-center gap-3 bg-slate-800/30 border border-slate-700/30 rounded-md p-2">
                      <Badge className="bg-slate-700/50 text-slate-300 text-[10px] font-mono">{p.npi}</Badge>
                      <span className="text-xs text-slate-400 flex-1">{p.reason}</span>
                      <Badge className={`text-[9px] ${
                        p.priority === 'high' ? 'bg-red-500/15 text-red-400' :
                        p.priority === 'medium' ? 'bg-amber-500/15 text-amber-400' :
                        'bg-blue-500/15 text-blue-400'
                      }`}>{p.priority}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {results.anomalies?.length === 0 && (
              <div className="text-center py-6">
                <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-400" />
                <p className="text-sm text-emerald-400">No significant anomalies detected</p>
                <p className="text-xs text-slate-500">Your imported data looks clean</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
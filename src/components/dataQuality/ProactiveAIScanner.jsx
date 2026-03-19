import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Sparkles, Loader2, ShieldAlert, CheckCircle2,
  User, MapPin, Stethoscope, AlertTriangle, Lightbulb
} from 'lucide-react';

const ENTITY_CONFIGS = [
  { key: 'Provider', icon: User, label: 'Providers', color: 'text-blue-600 bg-blue-50' },
  { key: 'ProviderLocation', icon: MapPin, label: 'Locations', color: 'text-emerald-600 bg-emerald-50' },
  { key: 'ProviderTaxonomy', icon: Stethoscope, label: 'Taxonomies', color: 'text-violet-600 bg-violet-50' },
];

export default function ProactiveAIScanner() {
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState({ step: '', pct: 0 });
  const [results, setResults] = useState(null);
  const [createdCount, setCreatedCount] = useState(0);
  const queryClient = useQueryClient();

  const runProactiveScan = async () => {
    setScanning(true);
    setResults(null);
    setCreatedCount(0);

    try {
    const allFindings = [];

    for (let ei = 0; ei < ENTITY_CONFIGS.length; ei++) {
      const cfg = ENTITY_CONFIGS[ei];
      setProgress({ step: `Fetching ${cfg.label}...`, pct: Math.round(((ei) / ENTITY_CONFIGS.length) * 80) });

      let records = [];
      if (cfg.key === 'Provider') {
        records = await base44.entities.Provider.list('-created_date', 200);
      } else if (cfg.key === 'ProviderLocation') {
        records = await base44.entities.ProviderLocation.list('-created_date', 200);
      } else {
        records = await base44.entities.ProviderTaxonomy.list('-created_date', 200);
      }

      if (records.length === 0) continue;

      setProgress({ step: `AI analyzing ${cfg.label} (${records.length} records)...`, pct: Math.round(((ei + 0.5) / ENTITY_CONFIGS.length) * 80) });

      // Sample up to 50 records for AI analysis to stay within token limits
      const sample = records.slice(0, 50);
      const sampleSummary = sample.map(r => {
        if (cfg.key === 'Provider') {
          return `NPI:${r.npi} | Name:${r.first_name||''} ${r.last_name||''} | Org:${r.organization_name||''} | Cred:${r.credential||''} | Type:${r.entity_type||''} | Email:${r.email||'MISSING'} | Status:${r.status||''} | Gender:${r.gender||'MISSING'}`;
        } else if (cfg.key === 'ProviderLocation') {
          return `NPI:${r.npi} | Addr:${r.address_1||'MISSING'} | City:${r.city||'MISSING'} | State:${r.state||'MISSING'} | ZIP:${r.zip||'MISSING'} | Phone:${r.phone||'MISSING'} | Primary:${r.is_primary||false}`;
        } else {
          return `NPI:${r.npi} | Code:${r.taxonomy_code||'MISSING'} | Desc:${r.taxonomy_description||'MISSING'} | Primary:${r.primary_flag||false}`;
        }
      }).join('\n');

      const res = await base44.integrations.Core.InvokeLLM({
        prompt: `You are a healthcare data quality expert. Proactively analyze this sample of ${cfg.key} records (${sample.length} of ${records.length} total) and identify data quality issues.

RECORDS SAMPLE:
${sampleSummary}

Look for these types of issues:
1. COMPLETENESS: Missing critical fields (emails, addresses, phone numbers, credentials, taxonomy codes)
2. ACCURACY: Invalid formats (bad ZIP codes, malformed NPIs, impossible values), suspicious data
3. CONSISTENCY: Mismatches (e.g., Individual type with organization name but no first/last name, location without matching provider)
4. DUPLICATES: Records that appear to be duplicates based on NPI + other fields
5. TIMELINESS: Data that appears stale or outdated

For each issue found, provide:
- A clear summary
- The severity (critical, high, medium, low)
- The category (completeness, accuracy, consistency, duplicate, timeliness)
- Which field is affected
- How many of the ${records.length} total records likely have this issue (extrapolate from sample)
- A specific suggested fix or action

Return up to 10 most important issues, prioritized by severity and affected count.`,
        response_json_schema: {
          type: "object",
          properties: {
            issues: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  summary: { type: "string" },
                  severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
                  category: { type: "string", enum: ["completeness", "accuracy", "consistency", "duplicate", "timeliness"] },
                  field_name: { type: "string" },
                  estimated_affected: { type: "number" },
                  root_cause: { type: "string" },
                  suggested_fix: { type: "string" }
                }
              }
            },
            overall_health: { type: "string", enum: ["good", "fair", "poor"] },
            health_summary: { type: "string" }
          }
        }
      });

      const entityIssues = (res.issues || []).map(issue => ({
        ...issue,
        entity_type: cfg.key,
        overall_health: res.overall_health,
        health_summary: res.health_summary,
      }));
      allFindings.push({ entity: cfg.key, label: cfg.label, issues: entityIssues, health: res.overall_health, healthSummary: res.health_summary, totalRecords: records.length });
    }

    // Create alerts for high/critical issues
    setProgress({ step: 'Creating alerts for critical issues...', pct: 85 });
    let created = 0;
    const batchId = `proactive_${Date.now()}`;

    for (const finding of allFindings) {
      for (const issue of finding.issues) {
        if (issue.severity === 'critical' || issue.severity === 'high') {
          await base44.entities.DataQualityAlert.create({
            rule_id: `proactive_ai_${issue.category}_${finding.entity.toLowerCase()}`,
            rule_name: `AI Proactive: ${issue.summary.slice(0, 60)}`,
            category: issue.category,
            severity: issue.severity,
            entity_type: finding.entity,
            field_name: issue.field_name || '',
            summary: issue.summary,
            suggested_value: issue.suggested_fix || '',
            suggestion_reason: issue.root_cause || '',
            ai_root_cause: issue.root_cause || '',
            ai_solutions: [issue.suggested_fix || ''],
            ai_impact_assessment: `Estimated ${issue.estimated_affected || 0} of ${finding.totalRecords} ${finding.label} records affected.`,
            ai_analyzed_at: new Date().toISOString(),
            affected_count: issue.estimated_affected || 1,
            scan_batch_id: batchId,
            status: 'open',
          });
          created++;
        }
      }
    }

    setProgress({ step: 'Complete', pct: 100 });
    setCreatedCount(created);
    setResults(allFindings);
    queryClient.invalidateQueries({ queryKey: ['dqAlerts'] });
    } catch (err) {
      setProgress({ step: `Error: ${err.message}`, pct: 0 });
      alert(`Scan failed: ${err.message}`);
    } finally {
      setScanning(false);
    }
  };

  const healthColors = {
    good: 'bg-green-100 text-green-700 border-green-200',
    fair: 'bg-amber-100 text-amber-700 border-amber-200',
    poor: 'bg-red-100 text-red-700 border-red-200',
  };

  const sevColors = {
    critical: 'bg-red-100 text-red-700',
    high: 'bg-orange-100 text-orange-700',
    medium: 'bg-yellow-100 text-yellow-700',
    low: 'bg-blue-100 text-blue-700',
  };

  return (
    <Card className="border-violet-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-violet-600" />
            Proactive AI Quality Scanner
          </CardTitle>
          <Button
            onClick={runProactiveScan}
            disabled={scanning}
            size="sm"
            className="bg-violet-600 hover:bg-violet-700 gap-1.5"
          >
            {scanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {scanning ? 'Scanning...' : 'Run AI Scan'}
          </Button>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          Uses AI to proactively identify data quality issues across Providers, Locations, and Taxonomies
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {scanning && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>{progress.step}</span>
              <span>{progress.pct}%</span>
            </div>
            <Progress value={progress.pct} className="h-2" />
          </div>
        )}

        {!results && !scanning && (
          <div className="text-center py-6 text-slate-400">
            <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Click "Run AI Scan" to proactively discover data quality issues</p>
            <p className="text-xs mt-1">Analyzes provider, location, and taxonomy records for completeness, accuracy, and consistency</p>
          </div>
        )}

        {results && (
          <div className="space-y-4">
            {createdCount > 0 && (
              <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-violet-600 shrink-0" />
                <p className="text-xs text-violet-700">
                  Created <strong>{createdCount}</strong> new alert{createdCount > 1 ? 's' : ''} for critical/high severity issues. View them in the Alerts tab.
                </p>
              </div>
            )}

            {results.map((finding) => {
              const Icon = ENTITY_CONFIGS.find(c => c.key === finding.entity)?.icon || User;
              return (
                <div key={finding.entity} className="border rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 bg-slate-50">
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4 text-slate-600" />
                      <span className="text-sm font-semibold text-slate-800">{finding.label}</span>
                      <span className="text-xs text-slate-400">({finding.totalRecords} records)</span>
                    </div>
                    {finding.health && (
                      <Badge className={`text-[10px] border ${healthColors[finding.health] || healthColors.fair}`}>
                        {finding.health}
                      </Badge>
                    )}
                  </div>

                  {finding.healthSummary && (
                    <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 flex items-start gap-2">
                      <Lightbulb className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" />
                      <p className="text-xs text-blue-700">{finding.healthSummary}</p>
                    </div>
                  )}

                  {finding.issues.length === 0 ? (
                    <div className="px-4 py-4 text-center">
                      <CheckCircle2 className="w-5 h-5 text-green-400 mx-auto mb-1" />
                      <p className="text-xs text-green-600">No significant issues found</p>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {finding.issues.map((issue, idx) => (
                        <div key={idx} className="px-4 py-3 space-y-1.5">
                          <div className="flex items-start gap-2">
                            <Badge className={`text-[8px] shrink-0 mt-0.5 ${sevColors[issue.severity]}`}>
                              {issue.severity}
                            </Badge>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium text-slate-800">{issue.summary}</p>
                              <div className="flex gap-2 mt-0.5">
                                <Badge variant="outline" className="text-[8px]">{issue.category}</Badge>
                                {issue.field_name && <Badge variant="outline" className="text-[8px]">{issue.field_name}</Badge>}
                                {issue.estimated_affected > 0 && (
                                  <span className="text-[10px] text-slate-400">~{issue.estimated_affected} records</span>
                                )}
                              </div>
                            </div>
                          </div>
                          {issue.root_cause && (
                            <p className="text-[10px] text-amber-700 bg-amber-50 rounded px-2 py-1">
                              <strong>Cause:</strong> {issue.root_cause}
                            </p>
                          )}
                          {issue.suggested_fix && (
                            <p className="text-[10px] text-emerald-700 bg-emerald-50 rounded px-2 py-1">
                              <strong>Fix:</strong> {issue.suggested_fix}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
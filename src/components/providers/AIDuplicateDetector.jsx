import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import { Loader2, AlertTriangle, Eye, Info, ShieldAlert, CheckCircle2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

function DuplicateGroupCard({ group }) {
  const confStyle = {
    high: { bg: 'bg-red-50 border-red-200', badge: 'bg-red-100 text-red-700 border-red-200', icon: 'text-red-500' },
    medium: { bg: 'bg-amber-50 border-amber-200', badge: 'bg-amber-100 text-amber-700 border-amber-200', icon: 'text-amber-500' },
    low: { bg: 'bg-slate-50 border-slate-200', badge: 'bg-slate-100 text-slate-600 border-slate-200', icon: 'text-slate-400' },
  };
  const style = confStyle[group.confidence] || confStyle.low;

  return (
    <div className={`p-4 rounded-xl border ${style.bg} transition-all`}>
      <div className="flex items-center gap-2 mb-2">
        <ShieldAlert className={`w-4 h-4 ${style.icon}`} />
        <Badge className={`text-[9px] border ${style.badge}`}>{group.confidence} confidence</Badge>
        {group.match_type && <Badge variant="outline" className="text-[9px]">{group.match_type}</Badge>}
        <span className="text-[10px] text-slate-400 ml-auto">{group.records?.length || 0} records</span>
      </div>
      <p className="text-xs text-slate-600 mb-3 leading-relaxed">{group.reason}</p>
      <div className="space-y-1.5">
        {group.records?.map((rec, j) => (
          <div key={j} className="flex items-center justify-between bg-white/80 rounded-lg px-3 py-2 border border-slate-100">
            <div className="flex items-center gap-2 min-w-0">
              <div className={`w-2 h-2 rounded-full shrink-0 ${j === 0 ? 'bg-blue-500' : 'bg-slate-300'}`} />
              <span className="text-xs font-medium text-slate-800 truncate">{rec.name}</span>
              <span className="text-[10px] text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded shrink-0">{rec.npi}</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 ml-2">
              {rec.detail && <span className="text-[10px] text-slate-400 hidden sm:inline">{rec.detail}</span>}
              <Link to={createPageUrl(`ProviderDetail?npi=${rec.npi}`)}>
                <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2">
                  <Eye className="w-3 h-3 mr-1" /> View
                </Button>
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AIDuplicateDetector({ providers = [], locations = [], taxonomies = [] }) {
  const [loading, setLoading] = useState(false);
  const [duplicates, setDuplicates] = useState(null);

  const scanCount = Math.min(providers.length, 100);

  const handleScan = async () => {
    setLoading(true);
    setDuplicates(null);

    const sample = providers.slice(0, 100).map(p => {
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
        phone: loc?.phone || '',
        email: p.email || '',
      };
    });

    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a healthcare data deduplication specialist. Analyze this list of ${sample.length} providers and identify POTENTIAL DUPLICATE records.

Look for:
1. Same person with different NPIs (name variations, typos, maiden/married names)
2. Same organization listed multiple times (abbreviations, name variations)
3. Very similar names at the same address/city
4. Providers with same phone or email but different NPIs
5. Similar credentials at the same location

Provider data (first ${sample.length}):
${JSON.stringify(sample, null, 1)}

Return groups of potential duplicates. Each group should have 2+ records that might be the same entity. Include a confidence score and clear reasoning for each group.`,
      response_json_schema: {
        type: "object",
        properties: {
          duplicate_groups: {
            type: "array",
            items: {
              type: "object",
              properties: {
                group_id: { type: "string" },
                confidence: { type: "string", enum: ["high", "medium", "low"] },
                reason: { type: "string" },
                match_type: { type: "string" },
                records: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      npi: { type: "string" },
                      name: { type: "string" },
                      detail: { type: "string" }
                    }
                  }
                }
              }
            }
          },
          summary: { type: "string" },
          total_flagged: { type: "number" }
        }
      }
    });

    setDuplicates(res);
    setLoading(false);

    if (res.duplicate_groups?.length > 0) {
      for (const group of res.duplicate_groups.slice(0, 5)) {
        await base44.entities.DataQualityAlert.create({
          rule_id: `dup_${group.group_id}`,
          rule_name: 'Potential Duplicate',
          category: 'duplicate',
          severity: group.confidence === 'high' ? 'high' : 'medium',
          summary: `Potential duplicate: ${group.records.map(r => r.name).join(' / ')}`,
          npi: group.records[0]?.npi || '',
          status: 'open',
        });
      }
      toast.success(`Found ${res.duplicate_groups.length} potential duplicate groups — alerts created`);
    } else {
      toast.success('No duplicates detected — your data looks clean!');
    }
  };

  const highCount = duplicates?.duplicate_groups?.filter(g => g.confidence === 'high').length || 0;
  const medCount = duplicates?.duplicate_groups?.filter(g => g.confidence === 'medium').length || 0;
  const lowCount = duplicates?.duplicate_groups?.filter(g => g.confidence === 'low').length || 0;

  return (
    <div className="space-y-4">
      {/* Description */}
      <div className="flex items-start gap-3 p-4 bg-amber-50/70 rounded-xl border border-amber-100">
        <div className="p-2 rounded-lg bg-amber-100">
          <Users className="w-4 h-4 text-amber-600" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Detect Duplicate Providers</h3>
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
            AI analyzes your provider records to find potential duplicates based on name similarities, 
            matching addresses, phone numbers, and email patterns. Flagged duplicates are saved as Data Quality alerts for review.
          </p>
        </div>
      </div>

      {/* Action */}
      <Card className="bg-white">
        <CardContent className="pt-5 space-y-3">
          <div className="text-xs text-slate-500">
            {scanCount} provider{scanCount !== 1 ? 's' : ''} will be analyzed for duplicates
          </div>
          <Button onClick={handleScan} disabled={loading || scanCount === 0} className="w-full bg-amber-600 hover:bg-amber-700 h-9">
            {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Scanning for Duplicates...</> : <><ShieldAlert className="w-4 h-4 mr-2" /> Scan {scanCount} Providers</>}
          </Button>
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="py-8 flex flex-col items-center gap-2">
            <Loader2 className="w-6 h-6 text-amber-600 animate-spin" />
            <p className="text-sm font-medium text-amber-800">Analyzing {scanCount} provider records...</p>
            <p className="text-xs text-amber-600">Comparing names, addresses, phone numbers, and emails</p>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {duplicates && !loading && (
        <div className="space-y-3">
          {/* Summary stats */}
          {duplicates.duplicate_groups?.length > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              <div className="flex items-center gap-2 p-2.5 bg-red-50 rounded-lg border border-red-100">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-xs text-red-700 font-medium">{highCount} High</span>
              </div>
              <div className="flex items-center gap-2 p-2.5 bg-amber-50 rounded-lg border border-amber-100">
                <div className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="text-xs text-amber-700 font-medium">{medCount} Medium</span>
              </div>
              <div className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                <div className="w-2 h-2 rounded-full bg-slate-400" />
                <span className="text-xs text-slate-600 font-medium">{lowCount} Low</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg border border-green-200">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium text-green-700">No potential duplicates found</span>
            </div>
          )}

          {duplicates.summary && (
            <div className="flex items-start gap-2 px-3 py-2 bg-slate-50 rounded-lg">
              <Info className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
              <p className="text-xs text-slate-500">{duplicates.summary}</p>
            </div>
          )}

          {/* Duplicate groups */}
          {duplicates.duplicate_groups?.length > 0 && (
            <div className="space-y-3">
              {duplicates.duplicate_groups.map((group, i) => (
                <DuplicateGroupCard key={i} group={group} />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
        <p className="text-[10px] text-amber-700 leading-relaxed">
          Duplicates are flagged using AI analysis and may include false positives. Review each group before merging or deactivating records.
        </p>
      </div>
    </div>
  );
}
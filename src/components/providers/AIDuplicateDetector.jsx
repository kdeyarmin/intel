import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import { Copy, Loader2, AlertTriangle, Merge, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function AIDuplicateDetector({ providers = [], locations = [], taxonomies = [] }) {
  const [loading, setLoading] = useState(false);
  const [duplicates, setDuplicates] = useState(null);

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
1. Same person with different NPIs (name variations, typos)
2. Same organization listed multiple times
3. Very similar names at the same address
4. Providers with same phone/email but different NPIs

Provider data (first 100):
${JSON.stringify(sample, null, 1)}

Return groups of potential duplicates. Each group should have 2+ records that might be the same entity. Include a confidence score and reasoning.`,
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
      toast.success(`Found ${res.duplicate_groups.length} potential duplicate groups and created alerts`);
    } else {
      toast.success('No duplicates detected');
    }
  };

  const confColor = { high: 'bg-red-100 text-red-700', medium: 'bg-amber-100 text-amber-700', low: 'bg-slate-100 text-slate-600' };

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Copy className="w-4 h-4 text-amber-600" />
          AI Duplicate Detector
        </CardTitle>
        <Button size="sm" onClick={handleScan} disabled={loading} className="bg-amber-600 hover:bg-amber-700 h-7 text-xs">
          {loading ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Scanning...</> : <><Copy className="w-3 h-3 mr-1" /> Scan for Duplicates</>}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && (
          <div className="flex items-center justify-center py-6 gap-2 text-amber-600">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-xs">Analyzing {Math.min(providers.length, 100)} providers for duplicates...</span>
          </div>
        )}

        {!duplicates && !loading && (
          <p className="text-[10px] text-slate-400 text-center py-2">
            AI will analyze provider records to find potential duplicates based on names, addresses, and contact info.
          </p>
        )}

        {duplicates && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500 italic">{duplicates.summary}</p>
            {duplicates.duplicate_groups?.length === 0 && (
              <p className="text-xs text-green-600 text-center py-3">No potential duplicates found.</p>
            )}
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {duplicates.duplicate_groups?.map((group, i) => (
                <div key={i} className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                    <Badge className={`text-[9px] ${confColor[group.confidence]}`}>{group.confidence} confidence</Badge>
                    <Badge variant="outline" className="text-[9px]">{group.match_type}</Badge>
                  </div>
                  <p className="text-xs text-slate-600 mb-2">{group.reason}</p>
                  <div className="space-y-1">
                    {group.records?.map((rec, j) => (
                      <div key={j} className="flex items-center justify-between pl-3 border-l-2 border-amber-300">
                        <div>
                          <span className="text-xs font-medium text-slate-800">{rec.name}</span>
                          <span className="text-[10px] text-slate-400 ml-2 font-mono">{rec.npi}</span>
                          {rec.detail && <span className="text-[10px] text-slate-400 ml-2">{rec.detail}</span>}
                        </div>
                        <Link to={createPageUrl(`ProviderDetail?npi=${rec.npi}`)}>
                          <Button variant="ghost" size="sm" className="h-6 text-[10px]">
                            <Eye className="w-3 h-3 mr-1" /> View
                          </Button>
                        </Link>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
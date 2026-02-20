import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Upload, CheckCircle2, Building2, Wifi, Users } from 'lucide-react';
import { toast } from 'sonner';

export default function BatchProviderUpdater() {
  const queryClient = useQueryClient();
  const [applying, setApplying] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [results, setResults] = useState(null);

  const { data: approved = [], isLoading } = useQuery({
    queryKey: ['approvedEnrichments'],
    queryFn: () => base44.entities.EnrichmentRecord.filter({ status: 'approved' }, '-created_date', 200),
    staleTime: 15000,
  });

  // Group by update type
  const updateGroups = useMemo(() => {
    const groups = { organization: [], telehealth: [], affiliations: [], other: [] };
    approved.forEach(r => {
      const d = r.enrichment_details;
      if (!d) return;
      if (d.group_practices?.length > 0) groups.organization.push(r);
      if (d.telehealth_available !== null && d.telehealth_available !== undefined) groups.telehealth.push(r);
      if (d.hospital_affiliations?.length > 0) groups.affiliations.push(r);
    });
    return groups;
  }, [approved]);

  const toggleAll = (group) => {
    const ids = group.map(r => r.id);
    setSelected(prev => {
      const next = new Set(prev);
      const allSelected = ids.every(id => next.has(id));
      if (allSelected) ids.forEach(id => next.delete(id));
      else ids.forEach(id => next.add(id));
      return next;
    });
  };

  const applyUpdates = async () => {
    if (selected.size === 0) return;
    setApplying(true);
    let success = 0, failed = 0;

    const toApply = approved.filter(r => selected.has(r.id));

    for (const r of toApply) {
      const d = r.enrichment_details;
      if (!d) continue;

      const provs = await base44.entities.Provider.filter({ npi: r.npi });
      if (provs.length === 0) { failed++; continue; }

      const prov = provs[0];
      const update = {};

      if (d.group_practices?.length > 0 && !prov.organization_name) {
        update.organization_name = d.group_practices[0];
      }

      // Create affiliations
      if (d.hospital_affiliations?.length > 0) {
        for (const aff of d.hospital_affiliations) {
          const existing = await base44.entities.ProviderAffiliation.filter({ npi: r.npi });
          const alreadyExists = existing.some(e => e.affiliation_name.toLowerCase() === aff.toLowerCase());
          if (!alreadyExists) {
            await base44.entities.ProviderAffiliation.create({
              npi: r.npi, affiliation_name: aff, affiliation_type: 'hospital',
              source: 'enrichment', status: 'confirmed', is_active: true,
              confidence: r.confidence,
            });
          }
        }
      }

      if (Object.keys(update).length > 0) {
        await base44.entities.Provider.update(prov.id, update);
      }

      // Mark as auto_applied
      await base44.entities.EnrichmentRecord.update(r.id, { status: 'auto_applied' });
      success++;
    }

    setResults({ success, failed });
    setSelected(new Set());
    setApplying(false);
    queryClient.invalidateQueries({ queryKey: ['approvedEnrichments'] });
    queryClient.invalidateQueries({ queryKey: ['enrichmentRecords'] });
    toast.success(`Applied ${success} updates to provider profiles`);
  };

  const GROUP_CONFIG = [
    { key: 'organization', label: 'Organization Names', icon: Building2, color: 'text-blue-400',
      desc: 'Update organization_name from group practice data' },
    { key: 'affiliations', label: 'Hospital Affiliations', icon: Users, color: 'text-violet-400',
      desc: 'Create ProviderAffiliation records' },
    { key: 'telehealth', label: 'Telehealth Status', icon: Wifi, color: 'text-cyan-400',
      desc: 'Flag telehealth availability' },
  ];

  if (isLoading) return null;
  if (approved.length === 0) return null;

  return (
    <Card className="bg-[#141d30] border-slate-700/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <Upload className="w-4 h-4 text-emerald-400" />
            Batch Apply to Profiles
            <Badge className="bg-emerald-500/15 text-emerald-400 text-[10px]">{approved.length} ready</Badge>
          </CardTitle>
          {selected.size > 0 && (
            <Button size="sm" onClick={applyUpdates} disabled={applying}
              className="h-7 text-[10px] gap-1 bg-emerald-600 hover:bg-emerald-700">
              {applying ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
              Apply {selected.size} Updates
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {GROUP_CONFIG.map(gc => {
          const items = updateGroups[gc.key];
          if (!items || items.length === 0) return null;
          const Icon = gc.icon;
          const allSel = items.every(r => selected.has(r.id));
          return (
            <div key={gc.key} className="border border-slate-700/30 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Checkbox checked={allSel} onCheckedChange={() => toggleAll(items)} className="border-slate-600" />
                  <Icon className={`w-3.5 h-3.5 ${gc.color}`} />
                  <span className="text-xs font-medium text-slate-300">{gc.label}</span>
                  <Badge className="bg-slate-700/50 text-slate-400 text-[9px]">{items.length}</Badge>
                </div>
              </div>
              <p className="text-[10px] text-slate-500 ml-6 mb-2">{gc.desc}</p>
              <div className="ml-6 space-y-1 max-h-32 overflow-y-auto">
                {items.slice(0, 10).map(r => (
                  <div key={r.id} className="flex items-center gap-2">
                    <Checkbox checked={selected.has(r.id)}
                      onCheckedChange={() => setSelected(prev => { const n = new Set(prev); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })}
                      className="border-slate-600" />
                    <span className="text-[10px] text-slate-400 truncate">{r.provider_name || r.npi}</span>
                    <span className="text-[9px] text-slate-600 truncate flex-1">
                      {gc.key === 'organization' && r.enrichment_details?.group_practices?.[0]}
                      {gc.key === 'affiliations' && r.enrichment_details?.hospital_affiliations?.slice(0, 2).join(', ')}
                      {gc.key === 'telehealth' && (r.enrichment_details?.telehealth_available ? '✓ Available' : '✗ N/A')}
                    </span>
                  </div>
                ))}
                {items.length > 10 && <p className="text-[9px] text-slate-600">+{items.length - 10} more</p>}
              </div>
            </div>
          );
        })}

        {results && (
          <div className="bg-emerald-500/10 rounded-lg p-2 text-center">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
            <p className="text-xs text-emerald-400">{results.success} profiles updated</p>
            {results.failed > 0 && <p className="text-[10px] text-red-400">{results.failed} failed</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
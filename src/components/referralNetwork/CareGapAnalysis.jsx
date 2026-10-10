import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Info } from 'lucide-react';
import { KEY_SPECIALTY_GROUPS, specialtyGroupFor, specialtyGroupLabel } from '@/lib/specialtyGroups';

/**
 * Which key specialties appear among the providers in this network view, per
 * state. It describes the network shown, not every provider in a state; the
 * Influencers tab's gap analysis compares against all providers in scope.
 */
export default function CareGapAnalysis({ nodes = [] }) {
  const states = useMemo(() => {
    const byState = {};
    for (const n of nodes) {
      if (!n.state) continue;
      const s = (byState[n.state] ||= { state: n.state, providers: 0, groups: {} });
      s.providers += 1;
      const g = n.specialtyGroup || specialtyGroupFor(n.taxonomyCode, n.specialty).key;
      s.groups[g] = (s.groups[g] || 0) + 1;
    }
    return Object.values(byState)
      // A handful of partner providers in another state says nothing about that state.
      .filter((s) => s.providers >= 10)
      .map((s) => ({
        ...s,
        missing: KEY_SPECIALTY_GROUPS.filter((g) => !s.groups[g]),
        present: KEY_SPECIALTY_GROUPS.filter((g) => s.groups[g]).map((g) => ({ key: g, count: s.groups[g] })),
      }))
      .sort((a, b) => b.providers - a.providers)
      .slice(0, 8);
  }, [nodes]);

  return (
    <Card className="bg-[#141d30] border-slate-700/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400" aria-hidden="true" />
          Specialty coverage in this network
        </CardTitle>
        <p className="flex items-start gap-1.5 text-xs text-slate-400">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
          Based on the {nodes.length} providers shown, grouped by NPPES taxonomy. For gaps measured against every provider in
          scope, use Specialty gaps on the Influencers tab.
        </p>
      </CardHeader>
      <CardContent>
        {states.length === 0 ? (
          <p className="py-6 text-center text-slate-400 text-sm">Not enough providers with a known state to compare specialties.</p>
        ) : (
          <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
            {states.map((s) => (
              <div key={s.state} className="border border-slate-700/50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Badge className="bg-slate-700/50 text-slate-200 font-mono">{s.state}</Badge>
                  <span className="text-xs text-slate-400">{s.providers} providers shown</span>
                  <Badge className={`ml-auto text-[10px] ${s.missing.length >= 8 ? 'bg-red-900/30 text-red-400' : s.missing.length >= 4 ? 'bg-amber-900/30 text-amber-400' : 'bg-emerald-900/30 text-emerald-400'}`}>
                    {KEY_SPECIALTY_GROUPS.length - s.missing.length}/{KEY_SPECIALTY_GROUPS.length} key specialties
                  </Badge>
                </div>
                {s.missing.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-1.5" aria-label={`Not in this network for ${s.state}`}>
                    <span className="text-[10px] text-red-400 mr-1">Not in this network:</span>
                    {s.missing.map((g) => (
                      <Badge key={g} className="bg-red-900/30 text-red-400 text-[9px] border border-red-500/30">{specialtyGroupLabel(g)}</Badge>
                    ))}
                  </div>
                )}
                {s.present.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    <span className="text-[10px] text-slate-400 mr-1">Present:</span>
                    {s.present.map((p) => (
                      <Badge key={p.key} variant="outline" className="text-[9px] text-slate-300">{specialtyGroupLabel(p.key)} ({p.count})</Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

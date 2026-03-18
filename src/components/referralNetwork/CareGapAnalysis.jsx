import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Stethoscope, TrendingDown } from 'lucide-react';

const KEY_SPECIALTIES = [
  'Internal Medicine', 'Family Medicine', 'Cardiology', 'Orthopedic Surgery',
  'General Surgery', 'Psychiatry', 'Neurology', 'Oncology', 'Dermatology',
  'Emergency Medicine', 'Obstetrics & Gynecology', 'Pediatrics', 'Pulmonology',
  'Gastroenterology', 'Nephrology', 'Urology', 'Ophthalmology', 'Endocrinology',
];

export default function CareGapAnalysis({ nodes = [], locations = [] }) {
  const gaps = useMemo(() => {
    // Build state → specialties map
    const npiState = {};
    locations.forEach(l => { if (l.npi && l.state) npiState[l.npi] = l.state; });

    const stateSpecialties = {};
    const stateCounts = {};
    nodes.forEach(n => {
      const st = n.state || npiState[n.npi];
      if (!st) return;
      if (!stateSpecialties[st]) stateSpecialties[st] = {};
      if (!stateCounts[st]) stateCounts[st] = 0;
      stateCounts[st]++;
      const spec = n.specialty;
      if (spec) stateSpecialties[st][spec] = (stateSpecialties[st][spec] || 0) + 1;
    });

    // Find gaps: states missing key specialties, or with very low coverage
    const gapList = [];
    Object.entries(stateSpecialties).forEach(([state, specs]) => {
      const total = stateCounts[state] || 1;
      const missingSpecialties = KEY_SPECIALTIES.filter(s => !specs[s]);
      const lowCoverage = KEY_SPECIALTIES
        .filter(s => specs[s] && (specs[s] / total) < 0.02)
        .map(s => ({ specialty: s, count: specs[s], pct: Math.round((specs[s] / total) * 100) }));

      if (missingSpecialties.length > 0 || lowCoverage.length > 0) {
        gapList.push({
          state,
          totalProviders: total,
          missingSpecialties,
          lowCoverage,
          gapScore: missingSpecialties.length * 3 + lowCoverage.length,
        });
      }
    });

    return gapList.sort((a, b) => b.gapScore - a.gapScore).slice(0, 12);
  }, [nodes, locations]);

  if (gaps.length === 0) {
    return (
      <Card className="bg-[#141d30] border-slate-700/50">
        <CardContent className="py-8 text-center text-slate-500 text-sm">
          Not enough data to analyze care gaps
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-[#141d30] border-slate-700/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          Care Gap Analysis
          <Badge variant="outline" className="text-[10px] ml-auto text-slate-500">{gaps.length} states with gaps</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
          {gaps.map(g => (
            <div key={g.state} className="border border-slate-700/50 rounded-lg p-3 hover:bg-slate-800/30 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Badge className="bg-slate-700/50 text-slate-300 font-mono">{g.state}</Badge>
                  <span className="text-xs text-slate-500">{g.totalProviders} providers</span>
                </div>
                <Badge className={`text-[10px] ${g.gapScore >= 10 ? 'bg-red-500/15 text-red-400' : g.gapScore >= 5 ? 'bg-amber-500/15 text-amber-400' : 'bg-slate-700/50 text-slate-400'}`}>
                  Gap Score: {g.gapScore}
                </Badge>
              </div>

              {g.missingSpecialties.length > 0 && (
                <div className="mb-2">
                  <div className="flex items-center gap-1 mb-1">
                    <Stethoscope className="w-3 h-3 text-red-400" />
                    <span className="text-[10px] text-red-400 font-medium">Missing Specialties</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {g.missingSpecialties.slice(0, 6).map(s => (
                      <Badge key={s} className="bg-red-500/10 text-red-400 text-[9px] border border-red-500/20">{s}</Badge>
                    ))}
                    {g.missingSpecialties.length > 6 && (
                      <Badge className="bg-slate-700/50 text-slate-400 text-[9px]">+{g.missingSpecialties.length - 6} more</Badge>
                    )}
                  </div>
                </div>
              )}

              {g.lowCoverage.length > 0 && (
                <div>
                  <div className="flex items-center gap-1 mb-1">
                    <TrendingDown className="w-3 h-3 text-amber-400" />
                    <span className="text-[10px] text-amber-400 font-medium">Low Coverage (&lt;2%)</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {g.lowCoverage.slice(0, 4).map(c => (
                      <Badge key={c.specialty} className="bg-amber-500/10 text-amber-400 text-[9px] border border-amber-500/20">
                        {c.specialty} ({c.count})
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
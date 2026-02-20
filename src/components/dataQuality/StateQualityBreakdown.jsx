import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { MapPin } from 'lucide-react';

function getScoreColor(pct) {
  if (pct >= 80) return 'text-emerald-400';
  if (pct >= 60) return 'text-amber-400';
  return 'text-red-400';
}

export default function StateQualityBreakdown({ providers = [], locations = [] }) {
  const [viewMode, setViewMode] = useState('completeness');

  const stateData = useMemo(() => {
    // Map providers to states via locations
    const npiState = {};
    locations.forEach(l => { if (l.npi && l.state) npiState[l.npi] = l.state; });

    const stateProviders = {};
    providers.forEach(p => {
      const st = npiState[p.npi];
      if (!st) return;
      if (!stateProviders[st]) stateProviders[st] = [];
      stateProviders[st].push(p);
    });

    return Object.entries(stateProviders)
      .map(([state, provs]) => {
        const total = provs.length;
        const withEmail = provs.filter(p => p.email).length;
        const withCredential = provs.filter(p => p.credential).length;
        const withGender = provs.filter(p => p.gender && p.gender !== '').length;
        const emailPct = Math.round((withEmail / total) * 100);
        const credPct = Math.round((withCredential / total) * 100);
        const genderPct = Math.round((withGender / total) * 100);
        const avgCompleteness = Math.round((emailPct + credPct + genderPct) / 3);
        return { state, total, emailPct, credPct, genderPct, avgCompleteness };
      })
      .sort((a, b) => viewMode === 'completeness' ? a.avgCompleteness - b.avgCompleteness : b.total - a.total)
      .slice(0, 15);
  }, [providers, locations, viewMode]);

  if (stateData.length === 0) return null;

  return (
    <Card className="bg-[#141d30] border-slate-700/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-cyan-400" />
            Quality by State
          </CardTitle>
          <div className="flex gap-1">
            <button
              onClick={() => setViewMode('completeness')}
              className={`text-[10px] px-2 py-0.5 rounded ${viewMode === 'completeness' ? 'bg-cyan-500/20 text-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}
            >
              Lowest Quality
            </button>
            <button
              onClick={() => setViewMode('volume')}
              className={`text-[10px] px-2 py-0.5 rounded ${viewMode === 'volume' ? 'bg-cyan-500/20 text-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}
            >
              By Volume
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
          {stateData.map(s => (
            <div key={s.state} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-800/30">
              <Badge className="bg-slate-700/50 text-slate-300 font-mono w-10 justify-center text-xs">{s.state}</Badge>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="text-slate-500">{s.total} providers</span>
                  <span className={getScoreColor(s.avgCompleteness)}>{s.avgCompleteness}% complete</span>
                </div>
                <Progress value={s.avgCompleteness} className="h-1.5" />
              </div>
              <div className="flex gap-2 text-[10px] shrink-0">
                <span className="text-slate-500">Email: <span className={getScoreColor(s.emailPct)}>{s.emailPct}%</span></span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
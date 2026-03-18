import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPin } from 'lucide-react';

function getHeatColor(intensity) {
  if (intensity >= 0.8) return { bg: 'bg-red-500/30', text: 'text-red-400', border: 'border-red-500/30' };
  if (intensity >= 0.6) return { bg: 'bg-orange-500/25', text: 'text-orange-400', border: 'border-orange-500/25' };
  if (intensity >= 0.4) return { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/20' };
  if (intensity >= 0.2) return { bg: 'bg-cyan-500/15', text: 'text-cyan-400', border: 'border-cyan-500/15' };
  return { bg: 'bg-slate-700/30', text: 'text-slate-400', border: 'border-slate-700/30' };
}

export default function GeographicHeatmap({ nodes = [], locations = [] }) {
  const [metric, setMetric] = useState('providers');

  const stateData = useMemo(() => {
    const npiState = {};
    locations.forEach(l => { if (l.npi && l.state) npiState[l.npi] = l.state; });

    const states = {};
    nodes.forEach(n => {
      const st = n.state || npiState[n.npi];
      if (!st) return;
      if (!states[st]) states[st] = { state: st, providers: 0, volume: 0, hubs: 0, specialties: new Set() };
      states[st].providers++;
      states[st].volume += n.totalVolume || 0;
      if (n.isHub) states[st].hubs++;
      if (n.specialty) states[st].specialties.add(n.specialty);
    });

    const arr = Object.values(states).map(s => ({
      ...s,
      specialtyCount: s.specialties.size,
      specialties: undefined,
    }));

    const maxVal = Math.max(...arr.map(s => metric === 'providers' ? s.providers : metric === 'volume' ? s.volume : s.hubs), 1);
    return arr.map(s => ({
      ...s,
      intensity: (metric === 'providers' ? s.providers : metric === 'volume' ? s.volume : s.hubs) / maxVal,
    })).sort((a, b) => b.intensity - a.intensity);
  }, [nodes, locations, metric]);

  if (stateData.length === 0) return null;

  return (
    <Card className="bg-[#141d30] border-slate-700/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-cyan-400" />
            Geographic Clustering
          </CardTitle>
          <div className="flex gap-1">
            {[
              { key: 'providers', label: 'Providers' },
              { key: 'volume', label: 'Volume' },
              { key: 'hubs', label: 'Hubs' },
            ].map(m => (
              <button
                key={m.key}
                onClick={() => setMetric(m.key)}
                className={`text-[10px] px-2 py-0.5 rounded ${metric === m.key ? 'bg-cyan-500/20 text-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-1.5">
          {stateData.map(s => {
            const c = getHeatColor(s.intensity);
            return (
              <div key={s.state} className={`${c.bg} border ${c.border} rounded-lg p-2 text-center group relative cursor-default`}>
                <p className={`text-xs font-bold ${c.text}`}>{s.state}</p>
                <p className="text-[9px] text-slate-500">{s.providers}</p>
                {/* Tooltip on hover */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-slate-900 border border-slate-700 rounded-lg p-2 text-left whitespace-nowrap z-10 hidden group-hover:block shadow-xl">
                  <p className="text-[10px] font-semibold text-slate-200">{s.state}</p>
                  <p className="text-[9px] text-slate-400">{s.providers} providers</p>
                  <p className="text-[9px] text-slate-400">{s.volume.toLocaleString()} referral volume</p>
                  <p className="text-[9px] text-slate-400">{s.hubs} hubs</p>
                  <p className="text-[9px] text-slate-400">{s.specialtyCount} specialties</p>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-center gap-2 mt-3">
          <span className="text-[9px] text-slate-500">Low</span>
          <div className="flex gap-0.5">
            {['bg-slate-700/30', 'bg-cyan-500/15', 'bg-amber-500/20', 'bg-orange-500/25', 'bg-red-500/30'].map((c, i) => (
              <div key={i} className={`w-6 h-2 rounded ${c}`} />
            ))}
          </div>
          <span className="text-[9px] text-slate-500">High</span>
        </div>
      </CardContent>
    </Card>
  );
}
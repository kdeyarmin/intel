import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRightLeft } from 'lucide-react';
import { fmtPct, fmtMoney } from '@/lib/marketFormat';

const SETTINGS = [
  { key: 'pct_snf', label: 'Skilled nursing', color: 'bg-amber-500' },
  { key: 'pct_hha', label: 'Home health', color: 'bg-green-500' },
  { key: 'pct_hospice', label: 'Hospice', color: 'bg-purple-500' },
  { key: 'pct_inpatient', label: 'Inpatient (readmissions)', color: 'bg-blue-500' },
  { key: 'pct_outpatient', label: 'Outpatient', color: 'bg-cyan-500' },
];

/**
 * Where a hospital's Medicare patients go in the 30 days after discharge,
 * as the share of episode spend by setting (CMS Hospital Spending by
 * Claim), against the state and national shares.
 */
export default function DischargeMixCard({ mix, title = 'Where patients go after discharge', compact = false }) {
  if (!mix) return null;
  const max = Math.max(1, ...SETTINGS.map((s) => mix[s.key] ?? 0), ...SETTINGS.map((s) => mix.national?.[s.key] ?? 0));
  const body = (
    <ul className="space-y-2">
      {SETTINGS.map((s) => {
        const v = mix[s.key];
        if (v == null) return null;
        return (
          <li key={s.key} className="text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-300">{s.label}</span>
              <span className="text-slate-200">{fmtPct(v)}
                {mix.state?.[s.key] != null ? <span className="text-slate-400"> · state {fmtPct(mix.state[s.key])}</span> : null}
                {mix.national?.[s.key] != null ? <span className="text-slate-400"> · U.S. {fmtPct(mix.national[s.key])}</span> : null}
              </span>
            </div>
            <span className="block h-2 rounded bg-slate-900 mt-1"><span className={`block h-2 rounded ${s.color}`} style={{ width: `${(v / max) * 100}%` }} /></span>
          </li>
        );
      })}
    </ul>
  );
  if (compact) return body;
  return (
    <Card className="bg-slate-800/50 border-slate-700/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-slate-200 flex items-center gap-2">
          <ArrowRightLeft className="w-4 h-4 text-cyan-400" aria-hidden="true" /> {title}
        </CardTitle>
        <p className="text-[11px] text-slate-400">
          Share of Medicare episode spend in the 30 days after discharge, by setting ({mix.data_year}). A proxy for destinations, not a count of transfers.
          {mix.avg_episode_spend != null ? ` Average episode ${fmtMoney(mix.avg_episode_spend)}.` : ''}
        </p>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}

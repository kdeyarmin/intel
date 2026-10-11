import React, { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { invokeOrThrow } from '@/api/functionResult';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Stethoscope, ListPlus } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { SPECIALTY_GROUPS } from '@/lib/specialtyGroups';
import { fmtCount, fmtRate, fmtShare } from '@/lib/marketFormat';
import AddToLeadListDialog from '../leadlists/AddToLeadListDialog';
import MarketFreshness from './MarketFreshness';

const SETTINGS = [
  { value: 'all', label: 'Any' },
  { value: 'hospice', label: 'Can order hospice' },
  { value: 'hha', label: 'Can order home health' },
  { value: 'dme', label: 'Can order DME' },
];
const GROUP_OPTIONS = [...SPECIALTY_GROUPS].sort((a, b) => a.label.localeCompare(b.label));

/** Clinicians in a county (or state) most likely to generate post-acute referrals, with the index's components. */
export default function ReferralSourcesTable({ state, countyFips, countyName }) {
  const ids = useId();
  const [setting, setSetting] = useState('all');
  const [group, setGroup] = useState('all');
  const [limit, setLimit] = useState(25);
  const [listNpis, setListNpis] = useState(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['referralSources', state, countyFips, setting, group, limit],
    queryFn: () => invokeOrThrow('getReferralSources', {
      state, ...(countyFips ? { county_fips: countyFips } : {}),
      ...(setting !== 'all' ? { setting } : {}), ...(group !== 'all' ? { specialty_group: group } : {}), limit,
    }),
    enabled: !!state,
    staleTime: 5 * 60 * 1000,
  });
  const rows = data?.rows || [];

  return (
    <Card className="bg-slate-800/50 border-slate-700/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-slate-200 flex items-center gap-2">
          <Stethoscope className="w-4 h-4 text-cyan-400" aria-hidden="true" /> Likely referral sources in {countyName || state}
        </CardTitle>
        <p className="text-[11px] text-slate-400">
          Clinicians ranked by a referral index built from Medicare volume (Physician &amp; Other Practitioners by Provider{data?.data_year ? ` ${data.data_year}` : ''}), patient risk and Order &amp; Referring eligibility. {data?.index_note}
        </p>
        <div className="flex flex-wrap items-end gap-3 pt-2">
          <div className="space-y-1">
            <Label htmlFor={`${ids}-setting`} className="text-xs text-slate-400">Eligibility</Label>
            <Select value={setting} onValueChange={setSetting}>
              <SelectTrigger id={`${ids}-setting`} className="w-48 h-8 text-xs bg-slate-900 border-slate-700"><SelectValue /></SelectTrigger>
              <SelectContent>{SETTINGS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${ids}-group`} className="text-xs text-slate-400">Specialty</Label>
            <Select value={group} onValueChange={setGroup}>
              <SelectTrigger id={`${ids}-group`} className="w-56 h-8 text-xs bg-slate-900 border-slate-700"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All specialties</SelectItem>
                {GROUP_OPTIONS.map((g) => <SelectItem key={g.key} value={g.key}>{g.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${ids}-limit`} className="text-xs text-slate-400">Show</Label>
            <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
              <SelectTrigger id={`${ids}-limit`} className="w-24 h-8 text-xs bg-slate-900 border-slate-700"><SelectValue /></SelectTrigger>
              <SelectContent>{[10, 25, 50, 100, 200].map((n) => <SelectItem key={n} value={String(n)}>Top {n}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button size="sm" variant="outline" disabled={rows.length === 0} onClick={() => setListNpis(rows.map((r) => r.npi))} className="h-8 text-xs border-slate-700 text-slate-300">
            <ListPlus className="w-3.5 h-3.5 mr-1" aria-hidden="true" /> Add these {rows.length || ''} to a lead list
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-sm text-slate-400">Loading…</p>
          : isError ? <p className="text-sm text-red-400" role="alert">Couldn't load referral sources: {error?.message}</p>
          : rows.length === 0 ? <p className="text-sm text-slate-400">No clinicians match. The Physician &amp; Other Practitioners by Provider file and the market rollups must be loaded first.</p>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <caption className="sr-only">Clinicians by referral index</caption>
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-700/60">
                    <th scope="col" className="py-1.5 pr-2">#</th>
                    <th scope="col" className="py-1.5 pr-2">Clinician</th>
                    <th scope="col" className="py-1.5 pr-2 text-right">Index</th>
                    <th scope="col" className="py-1.5 pr-2 text-right">Medicare patients</th>
                    <th scope="col" className="py-1.5 pr-2 text-right">Risk</th>
                    <th scope="col" className="py-1.5 pr-2 text-right">Alzheimer's</th>
                    <th scope="col" className="py-1.5 pr-2 text-right">Heart failure</th>
                    <th scope="col" className="py-1.5 pr-2">Can order</th>
                    <th scope="col" className="py-1.5 pr-2 text-right">Hospitals</th>
                    <th scope="col" className="py-1.5 text-right">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.npi} className="border-b border-slate-800/60">
                      <td className="py-1.5 pr-2 text-slate-400">{countyFips ? r.rank_in_county ?? i + 1 : i + 1}</td>
                      <td className="py-1.5 pr-2">
                        <Link to={createPageUrl(`ProviderDetail?npi=${r.npi}`)} className="text-cyan-400 hover:underline">{r.name}</Link>
                        <span className="block text-[10px] text-slate-400">{r.specialty || r.specialty_group_label}{!countyFips && r.county_name ? ` · ${r.county_name}` : ''}</span>
                      </td>
                      <td className="py-1.5 pr-2 text-right text-slate-100 font-medium">{r.referral_index ?? '—'}</td>
                      <td className="py-1.5 pr-2 text-right text-slate-200">{fmtCount(r.benes)}</td>
                      <td className="py-1.5 pr-2 text-right text-slate-300">{fmtRate(r.avg_risk_score, 2)}</td>
                      <td className="py-1.5 pr-2 text-right text-slate-300">{fmtShare(r.chronic?.alzheimer)}</td>
                      <td className="py-1.5 pr-2 text-right text-slate-300">{fmtShare(r.chronic?.chf)}</td>
                      <td className="py-1.5 pr-2">
                        <span className="flex gap-1">
                          {r.eligible?.hha ? <Badge variant="outline" className="text-[10px] bg-green-900/30 text-green-400 border-green-500/30">HHA</Badge> : null}
                          {r.eligible?.hospice ? <Badge variant="outline" className="text-[10px] bg-purple-900/30 text-purple-400 border-purple-500/30">Hospice</Badge> : null}
                          {r.eligible?.dme ? <Badge variant="outline" className="text-[10px] bg-cyan-900/30 text-cyan-400 border-cyan-500/30">DME</Badge> : null}
                          {!r.eligible?.hha && !r.eligible?.hospice && !r.eligible?.dme ? <span className="text-slate-400">—</span> : null}
                        </span>
                      </td>
                      <td className="py-1.5 pr-2 text-right text-slate-300">{r.hospital_ccns?.length || 0}</td>
                      <td className="py-1.5 text-right">
                        <Badge className={`text-[10px] ${r.lead_score == null ? 'bg-slate-700 text-slate-300' : 'bg-teal-900/30 text-teal-400'}`}>{r.lead_score == null ? 'Unscored' : Math.round(r.lead_score)}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data?.truncated ? <p className="text-[11px] text-slate-400 mt-1">More clinicians match; raise the limit to see them.</p> : null}
            </div>
          )}
        <div className="mt-3"><MarketFreshness rollups={data?.rollups} jobs={['referral_sources']} /></div>
      </CardContent>
      <AddToLeadListDialog
        open={!!listNpis}
        onOpenChange={(open) => { if (!open) setListNpis(null); }}
        npis={listNpis || []}
        defaultName={`Referral sources: ${countyName || state}`}
      />
    </Card>
  );
}

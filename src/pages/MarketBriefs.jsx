import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { invokeOrThrow } from '@/api/functionResult';
import { useUrlState } from '@/hooks/useUrlState';
import { createPageUrl } from '@/utils';
import PageTabs from '@/components/layout/PageTabs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileBarChart2, Printer } from 'lucide-react';
import { US_STATES } from '@/lib/usStates';
import { fmtCount, fmtMoney, fmtPct, fmtShare } from '@/lib/marketFormat';
import { GROWTH_SETTINGS, REPORT_CATALOG, countyGrowthRows, growthFacts, leaderFacts } from '@/lib/marketBriefs';
import { useBusinessLine } from '@/lib/BusinessLineContext';
import { countExport } from '@/components/exports/exportUtils';
import { toast } from 'sonner';
import ComplianceDisclaimer from '../components/compliance/ComplianceDisclaimer';
import MarketFreshness from '../components/market/MarketFreshness';

const URL_DEFAULTS = { report: '', state: 'PA', county: '', from: '', setting: 'hha', sort: 'users' };

const SORTS = [
  { id: 'users', label: 'Users' },
  { id: 'usersPerProvider', label: 'Users per provider' },
  { id: 'usersPct', label: 'Share of fee-for-service' },
  { id: 'usersChange', label: 'Change vs last year' },
  { id: 'spend', label: 'Spend per beneficiary' },
];

function resolveReport(url) {
  const listed = REPORT_CATALOG.find((r) => r.id === url.report);
  if (listed) return listed;
  if (url.report === 'grow') {
    const setting = GROWTH_SETTINGS[url.setting] ? url.setting : 'hha';
    return REPORT_CATALOG.find((r) => r.id === `expand-${setting}`);
  }
  if (url.report === 'calls') return REPORT_CATALOG.find((r) => r.id === (url.setting === 'hospice' ? 'calls-hospice' : 'calls-hha'));
  if (url.report === 'county') {
    const from = REPORT_CATALOG.find((r) => r.id === url.from);
    return {
      id: 'county',
      purpose: from?.purpose || 'County',
      audience: from?.audience || 'County',
      title: from ? `${from.audience} in this county` : 'County follow-up',
      needs: 'county',
      setting: from?.setting || 'hha',
      reason: 'Demand in this county, the hospitals discharging its residents, and the providers already serving it.',
    };
  }
  return null;
}

function growthLead(state, setting, facts) {
  if (!facts.top) return `${state} does not have ${setting.label.toLowerCase()} user counts on the county profiles yet.`;
  const top = facts.top;
  const detail = [
    top.usersPct != null ? `${fmtPct(top.usersPct)} of fee-for-service` : null,
    top.billing != null ? `billed by ${fmtCount(top.billing)} ${setting.noun}` : null,
  ].filter(Boolean);
  const parts = [`${state} has ${setting.label.toLowerCase()} user counts for ${fmtCount(facts.countiesWithUsers)} counties. ${top.name} has the most: ${fmtCount(top.users)} users${detail.length ? ` (${detail.join(', ')})` : ''}.`];
  if (facts.busiest && facts.medianUsers != null) {
    const b = facts.busiest;
    const each = fmtCount(b.usersPerProvider);
    if (b.fips === top.fips) parts.push(`It also has the most users per billing ${setting.one} among counties at or above the median user count (${fmtCount(facts.medianUsers)}): ${each}.`);
    else parts.push(`Among counties with at least the median user count (${fmtCount(facts.medianUsers)}), ${b.name} has the most per billing ${setting.one}: ${each} across ${fmtCount(b.billing)} ${setting.noun}.`);
  }
  if (facts.rising.length) {
    const names = facts.rising.slice(0, 3).map((r) => r.name);
    const verb = facts.rising.length === 1 ? '1 county had' : `${fmtCount(facts.rising.length)} counties had`;
    parts.push(`${verb} more users than the year before while the number of billing ${setting.noun} did not rise: ${names.join(', ')}${facts.rising.length > 3 ? ', and others' : ''}.`);
  }
  return parts.join(' ');
}

function acquireLead(state, spec, data) {
  const facts = leaderFacts(data?.rows || []);
  if (!facts.top) return `${state} has no ${spec.audience.toLowerCase()} in the post-acute file yet.`;
  const top = facts.top;
  const place = [top.city, top.state].filter(Boolean).join(', ');
  const parts = [`${top.name || top.ccn}${place ? ` (${place})` : ''} has the most Medicare beneficiaries among ${spec.audience.toLowerCase()} located in ${state}: ${fmtCount(top.benes)} (${fmtShare(top.share)} of beneficiaries served by providers located in the state).`];
  if (data.providers_in_market != null) parts.push(`${fmtCount(data.providers_in_market)} providers are ranked${data.data_year ? ` for ${data.data_year}` : ''}.`);
  if (facts.listedShare != null) parts.push(`The ${fmtCount(facts.listed)} listed here account for ${fmtShare(facts.listedShare)} of beneficiaries served by providers located in the state.`);
  return parts.join(' ');
}

function Section({ title, children }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-slate-200">{title}</h2>
      {children}
    </section>
  );
}

function Table({ headers, rows }) {
  if (!rows.length) return <p className="text-xs text-slate-500">None on file.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-slate-500">
            {headers.map((h) => <th key={h} className="py-1 pr-3 font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i} className="border-t border-slate-800 text-slate-200">
              {cells.map((c, j) => <td key={j} className="py-1.5 pr-3 align-top">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function sortGrowth(rows, key) {
  return [...rows].sort((a, b) => {
    const va = a[key];
    const vb = b[key];
    if (va == null && vb == null) return String(a.name).localeCompare(String(b.name));
    if (va == null) return 1;
    if (vb == null) return -1;
    return vb - va || String(a.name).localeCompare(String(b.name));
  });
}

function facilityLink(ccn, group, name) {
  return <Link to={createPageUrl(`FacilityDetail?id=${encodeURIComponent(ccn)}&group=${group || 'hospital'}`)} className="text-cyan-400 hover:underline">{name || ccn}</Link>;
}

export default function MarketBriefs() {
  const [url, setUrl] = useUrlState(URL_DEFAULTS);
  const { profile } = useBusinessLine();
  const catalog = profile ? REPORT_CATALOG.filter((r) => profile.reports.includes(r.id)) : REPORT_CATALOG;
  const spec = resolveReport(url);
  const settingKey = GROWTH_SETTINGS[spec?.setting] ? spec.setting : 'hha';
  const settingDef = GROWTH_SETTINGS[settingKey];
  const ready = !!url.state && !!url.county;
  const purposes = [...new Set(catalog.map((r) => r.purpose))];

  const { data: counties } = useQuery({
    queryKey: ['geoCounties', url.state],
    queryFn: () => invokeOrThrow('getGeoCounties', { state: url.state }),
    enabled: !!url.state && (!spec || spec.needs === 'county'),
    staleTime: 60 * 60 * 1000,
  });

  const { data: layer, isLoading: layerLoading, isError: layerError, error: layerErr } = useQuery({
    queryKey: ['countyMarketLayer', url.state, 'all'],
    queryFn: () => invokeOrThrow('getCountyMarketLayer', { state: url.state, all: true }),
    enabled: !!spec && spec.id.startsWith('expand') && !!url.state,
    staleTime: 5 * 60 * 1000,
  });

  const { data: leaders, isLoading: leadersLoading, isError: leadersError, error: leadersErr } = useQuery({
    queryKey: ['stateMarketLeaders', url.state, settingKey],
    queryFn: () => invokeOrThrow('getStateMarketLeaders', { state: url.state, setting: settingKey, limit: 15 }),
    enabled: !!spec && spec.id.startsWith('acquire') && !!url.state,
    staleTime: 5 * 60 * 1000,
  });

  const { data: market, isLoading, isError, error } = useQuery({
    queryKey: ['countyMarket', url.state, url.county],
    queryFn: () => invokeOrThrow('getCountyMarket', { state: url.state, county_fips: url.county }),
    enabled: ready && !!spec && spec.needs === 'county',
    staleTime: 5 * 60 * 1000,
  });

  const sourceSetting = settingKey === 'hospice' ? 'hospice' : 'hha';
  const { data: sources } = useQuery({
    queryKey: ['referralSources', url.state, url.county, sourceSetting, spec?.id],
    queryFn: () => invokeOrThrow('getReferralSources', { state: url.state, county_fips: url.county, setting: sourceSetting, limit: spec?.id?.startsWith('calls') ? 25 : 8 }),
    enabled: ready && !!spec && (spec.id.startsWith('calls') || (spec.id === 'county' && settingKey !== 'snf')),
    staleTime: 5 * 60 * 1000,
  });

  const countyList = counties?.counties || [];
  const countyName = countyList.find((c) => c.fips === url.county)?.name || market?.county?.name || 'This county';
  const place = `${countyName}${url.state ? `, ${url.state}` : ''}`;

  // Printing exports the full brief, so it counts against the organization's
  // daily export allowance like every other export.
  const handlePrint = async () => {
    const quota = await countExport();
    if (!quota.ok) {
      toast.error(quota.message);
      return;
    }
    window.print();
  };
  const facts = useMemo(() => growthFacts(countyGrowthRows(layer?.counties || [], settingKey)), [layer, settingKey]);
  const ranked = useMemo(() => sortGrowth(facts.ranked, SORTS.some((s) => s.id === url.sort) ? url.sort : 'users').filter((r) => r.users != null).slice(0, 15), [facts, url.sort]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[900px] mx-auto space-y-6">
      <PageTabs current="MarketBriefs" />
      <div className="flex items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <FileBarChart2 className="w-6 h-6 text-cyan-400" aria-hidden="true" />
            Reports
          </h1>
          <p className="text-sm text-slate-400 mt-1">{profile ? profile.blurb : 'Each report answers one decision. The figures are the published counts, not a score built on top of them.'}</p>
        </div>
        {spec && (
          <Button type="button" variant="outline" size="sm" onClick={handlePrint} disabled={spec.needs === 'county' && !ready}>
            <Printer className="w-4 h-4 mr-1" aria-hidden="true" /> Print
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <div className="space-y-1">
          <Label htmlFor="brief-state">State</Label>
          <Select value={url.state || undefined} onValueChange={(state) => setUrl({ state, county: '' })}>
            <SelectTrigger id="brief-state" className="w-28"><SelectValue placeholder="State" /></SelectTrigger>
            <SelectContent>{US_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {spec?.needs === 'county' && (
          <div className="space-y-1">
            <Label htmlFor="brief-county">County</Label>
            <Select value={url.county || undefined} onValueChange={(county) => setUrl({ county })} disabled={!url.state}>
              <SelectTrigger id="brief-county" className="w-52"><SelectValue placeholder="County" /></SelectTrigger>
              <SelectContent>{countyList.map((c) => <SelectItem key={c.fips} value={c.fips}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}
        {spec && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setUrl({ report: '', from: '' })}>All reports</Button>
        )}
      </div>

      {!spec && (
        <div className="space-y-6">
          {purposes.map((purpose) => (
            <section key={purpose} className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-300">{purpose}</h2>
              <div className="grid gap-2">
                {catalog.filter((r) => r.purpose === purpose).map((r) => (
                  <button key={r.id} type="button" onClick={() => setUrl({ report: r.id, from: '', county: r.needs === 'state' ? '' : url.county })} className="text-left rounded-lg border border-slate-800 bg-slate-900/40 p-3 hover:border-slate-600">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">{r.audience}</p>
                    <p className="text-sm font-medium text-slate-100">{r.title}</p>
                    <p className="text-xs text-slate-400 mt-1">{r.reason}</p>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {spec?.id?.startsWith('expand') && (
        <article className="space-y-6" id="market-brief">
          <header>
            <p className="text-[11px] uppercase tracking-wide text-slate-500">{spec.purpose} · {spec.audience}</p>
            <h2 className="text-xl font-semibold text-slate-100">{spec.title}</h2>
            <p className="text-xs text-slate-400 mt-1">{spec.reason}</p>
            {layerLoading && <p className="text-sm text-slate-400 mt-2">Building the ranking…</p>}
            {layerError && <p className="text-sm text-red-400 mt-2">{layerErr?.message || 'Could not rank counties.'}</p>}
            {layer && <p className="text-sm text-slate-300 mt-2">{growthLead(url.state, settingDef, facts)}</p>}
          </header>
          {layer && facts.rising.length > 0 && (
            <Section title={`Use rose; billing ${settingDef.noun} did not`}>
              <Table
                headers={['County', 'Users', 'Vs last year', `Billing ${settingDef.noun}`, 'Their change']}
                rows={facts.rising.slice(0, 8).map((r) => [
                  <button key={r.fips} type="button" className="text-cyan-400 hover:underline text-left" onClick={() => setUrl({ report: 'county', county: r.fips, from: spec.id })}>{r.name}</button>,
                  fmtCount(r.users), fmtPct(r.usersChange), fmtCount(r.billing), fmtPct(r.billingChange),
                ])}
              />
              <p className="text-[11px] text-slate-500">Change is versus the prior year in the market-saturation file. A billing {settingDef.one} in another county still counts.</p>
            </Section>
          )}
          {layer && (
            <Section title="Largest counties">
              <div className="print:hidden">
                <Label htmlFor="brief-sort">Sort</Label>
                <Select value={SORTS.some((s) => s.id === url.sort) ? url.sort : 'users'} onValueChange={(sort) => setUrl({ sort })}>
                  <SelectTrigger id="brief-sort" className="mt-1 w-56"><SelectValue /></SelectTrigger>
                  <SelectContent>{SORTS.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Table
                headers={['County', 'Users', 'Share of FFS', 'Vs last year', `Billing ${settingDef.noun}`, 'Users each', 'Spend / beneficiary']}
                rows={ranked.map((r) => [
                  <button key={r.fips} type="button" className="text-cyan-400 hover:underline text-left" onClick={() => setUrl({ report: 'county', county: r.fips, from: spec.id })}>{r.name}</button>,
                  fmtCount(r.users), fmtPct(r.usersPct), fmtPct(r.usersChange), fmtCount(r.billing), fmtCount(r.usersPerProvider), fmtMoney(r.spend),
                ])}
              />
              <p className="text-[11px] text-slate-500">Top 15. Users are Original Medicare residents, not the agency’s own claim count. Open a county for the hospitals and the providers already there.</p>
            </Section>
          )}
        </article>
      )}

      {spec?.id?.startsWith('acquire') && (
        <article className="space-y-6" id="market-brief">
          <header>
            <p className="text-[11px] uppercase tracking-wide text-slate-500">{spec.purpose} · {spec.audience}</p>
            <h2 className="text-xl font-semibold text-slate-100">{spec.title}</h2>
            <p className="text-xs text-slate-400 mt-1">{spec.reason} Share is of providers located in the state, not of every resident who used the service.</p>
            {leadersLoading && <p className="text-sm text-slate-400 mt-2">Building the list…</p>}
            {leadersError && <p className="text-sm text-red-400 mt-2">{leadersErr?.message || 'Could not list providers.'}</p>}
            {leaders && <p className="text-sm text-slate-300 mt-2">{acquireLead(url.state, spec, leaders)}</p>}
          </header>
          {leaders && (
            <Section title="Largest by Medicare beneficiaries">
              <Table
                headers={settingKey === 'snf'
                  ? ['Provider', 'Beneficiaries', 'Share', 'Payment', 'Residents', 'Medicare / Medicaid']
                  : ['Provider', 'Beneficiaries', 'Share', 'Payment', 'Dual %', 'Counties served']}
                rows={(leaders.rows || []).map((r) => settingKey === 'snf' ? [
                  <span key={r.ccn}>{facilityLink(r.ccn, r.facility_group, r.name)}<span className="block text-slate-500">{[r.city, r.state].filter(Boolean).join(', ')}{r.census?.chain ? ` · ${r.census.chain}` : ''}</span></span>,
                  fmtCount(r.benes), fmtShare(r.share), fmtMoney(r.payment),
                  r.census ? fmtCount(r.census.total_residents) : '—',
                  r.census ? `${fmtShare(r.census.medicare_pct)} / ${fmtShare(r.census.medicaid_pct)}` : '—',
                ] : [
                  <span key={r.ccn}>{facilityLink(r.ccn, r.facility_group, r.name)}<span className="block text-slate-500">{[r.city, r.state].filter(Boolean).join(', ')}</span></span>,
                  fmtCount(r.benes), fmtShare(r.share), fmtMoney(r.payment), fmtPct(r.dual_pct, 0), r.counties_served == null ? '—' : fmtCount(r.counties_served),
                ])}
              />
              <p className="text-[11px] text-slate-500">{settingKey === 'snf' ? 'Residents and payer mix are the latest nursing-home census, not the Medicare year.' : 'Counties served is the ZIP service area, not the counties where the beneficiaries live.'}{leaders.data_year ? ` Medicare year ${leaders.data_year}.` : ''}</p>
            </Section>
          )}
        </article>
      )}

      {spec && spec.needs === 'county' && !ready && <p className="text-sm text-slate-400">Pick a county to open this report.</p>}
      {spec && spec.needs === 'county' && isLoading && <p className="text-sm text-slate-400">Building the report…</p>}
      {spec && spec.needs === 'county' && isError && <p className="text-sm text-red-400">{error?.message || 'Could not build this report.'}</p>}

      {spec?.id === 'hospital-partners' && ready && market && !market.needsCounty && (
        <article className="space-y-6" id="market-brief">
          <header>
            <p className="text-[11px] uppercase tracking-wide text-slate-500">{spec.purpose} · {spec.audience}</p>
            <h2 className="text-xl font-semibold text-slate-100">{place}</h2>
            <p className="text-sm text-slate-300 mt-2">
              {market.hospital_sources?.total ? `${fmtCount(market.hospital_sources.total)} hospitals discharged residents of ${place}` : `No hospital origins are on file for ${place}`}
              {market.hospital_sources?.data_year ? ` (${market.hospital_sources.data_year})` : ''}.
              {' '}The post-acute columns are that hospital’s Medicare episode spend, set next to the state figure.
            </p>
          </header>
          <Section title="Where to build a hospital relationship">
            <Table
              headers={['Hospital', 'Cases', 'Share of county', 'Home health', 'State', 'Hospice', 'State', 'SNF', 'State']}
              rows={(market.hospital_sources?.rows || []).slice(0, 10).map((r) => {
                const m = r.discharge_mix;
                return [
                  facilityLink(r.ccn, 'hospital', r.name),
                  fmtCount(r.cases), fmtShare(r.share),
                  m ? fmtPct(m.pct_hha) : '—', m ? fmtPct(m.state?.pct_hha) : '—',
                  m ? fmtPct(m.pct_hospice) : '—', m ? fmtPct(m.state?.pct_hospice) : '—',
                  m ? fmtPct(m.pct_snf) : '—', m ? fmtPct(m.state?.pct_snf) : '—',
                ];
              })}
            />
            <p className="text-[11px] text-slate-500">A higher home health, hospice, or skilled nursing percent than the state means more of that hospital’s episode spend went to that setting. It is not a referral order.</p>
          </Section>
        </article>
      )}

      {spec?.id?.startsWith('calls') && ready && market && !market.needsCounty && (
        <article className="space-y-6" id="market-brief">
          <header>
            <p className="text-[11px] uppercase tracking-wide text-slate-500">{spec.purpose} · {spec.audience}</p>
            <h2 className="text-xl font-semibold text-slate-100">{spec.title}</h2>
            <p className="text-sm text-slate-300 mt-2">Clinicians in {place}. {spec.reason}</p>
          </header>
          <Section title="Call list">
            <Table
              headers={sourceSetting === 'hospice'
                ? ['Clinician', 'Specialty', 'Medicare patients', 'Hospice oversight', 'Heart failure', 'COPD', 'Alzheimer']
                : ['Clinician', 'Specialty', 'Medicare patients', 'Home health certifications', 'Heart failure', 'COPD', 'Alzheimer']}
              rows={(sources?.rows || []).map((r) => [
                <Link key={r.npi} to={createPageUrl(`ProviderDetail?npi=${r.npi}`)} className="text-cyan-400 hover:underline">{r.name}</Link>,
                r.specialty || '—',
                fmtCount(r.benes),
                fmtCount(sourceSetting === 'hospice' ? r.hospice_oversight_benes : r.hh_cert_benes),
                fmtShare(r.chronic?.chf, 0), fmtShare(r.chronic?.copd, 0), fmtShare(r.chronic?.alzheimer, 0),
              ])}
            />
            <p className="text-[11px] text-slate-500">{sources?.index_note || 'Ranked from the physician file.'}{sources?.data_year ? ` Physician year ${sources.data_year}.` : ''}{sources?.certifications_year ? ` Certifications ${sources.certifications_year}.` : ''} Chronic columns are the share of that clinician’s Medicare patients.</p>
          </Section>
        </article>
      )}

      {spec?.id === 'county' && ready && market && !market.needsCounty && (
        <article className="space-y-6" id="market-brief">
          <header>
            <p className="text-[11px] uppercase tracking-wide text-slate-500">{spec.audience} · {place}</p>
            <h2 className="text-xl font-semibold text-slate-100">{spec.title}</h2>
            <p className="text-sm text-slate-300 mt-2">{spec.reason}</p>
          </header>
          {market.profile?.available && (
            <Section title={`${settingDef.label} demand`}>
              <Table
                headers={['Users', 'Share of FFS', 'Vs last year', 'Billing', 'Located here', 'Spend / beneficiary']}
                rows={[[
                  fmtCount(market.profile[settingKey === 'hospice' ? 'hospice_users' : settingKey === 'snf' ? 'snf_users' : 'hha_users']),
                  fmtPct(market.profile[settingKey === 'hospice' ? 'hospice_users_pct' : settingKey === 'snf' ? 'snf_users_pct' : 'hha_users_pct']),
                  fmtPct(market.profile[settingKey === 'hospice' ? 'hospice_users_change_pct' : settingKey === 'snf' ? 'snf_users_change_pct' : 'hha_users_change_pct']),
                  fmtCount(market.profile[settingDef.billing]),
                  fmtCount(market.profile[settingDef.located]),
                  fmtMoney(market.profile[settingDef.spend]),
                ]]}
              />
              <p className="text-[11px] text-slate-500">Billing includes {settingDef.noun} in other counties. {fmtCount(market.profile.benes)} Medicare beneficiaries live here, {fmtShare(market.profile.ma_penetration)} in Medicare Advantage.</p>
            </Section>
          )}
          <Section title="Hospitals discharging residents">
            <Table
              headers={['Hospital', 'Cases', 'Share', settingDef.label]}
              rows={(market.hospital_sources?.rows || []).slice(0, 6).map((r) => [
                facilityLink(r.ccn, 'hospital', r.name),
                fmtCount(r.cases), fmtShare(r.share),
                r.discharge_mix ? fmtPct(r.discharge_mix[settingKey === 'hospice' ? 'pct_hospice' : settingKey === 'snf' ? 'pct_snf' : 'pct_hha']) : '—',
              ])}
            />
            <p className="text-[11px] text-slate-500">{market.hospital_sources?.data_year ? `Origins ${market.hospital_sources.data_year}. ` : ''}The last column is the share of that hospital’s Medicare episode spend, not a referral order.</p>
          </Section>
          {(market.competitors?.[settingKey]?.rows || []).length > 0 && (
            <Section title={`Who already serves ${settingDef.label.toLowerCase()}`}>
              <Table
                headers={['Provider', 'Beneficiaries', 'Share', 'Payment']}
                rows={market.competitors[settingKey].rows.slice(0, 8).map((r) => [facilityLink(r.ccn, r.facility_group, r.name), fmtCount(r.benes), fmtShare(r.share), fmtMoney(r.payment)])}
              />
              {market.competitors[settingKey].data_year && <p className="text-[11px] text-slate-500">Share of beneficiaries served in this county, {market.competitors[settingKey].data_year}.</p>}
            </Section>
          )}
          {settingKey !== 'snf' && (
            <Section title="Clinicians to call">
              <Table
                headers={['Clinician', 'Specialty', 'Medicare patients']}
                rows={(sources?.rows || []).slice(0, 8).map((r) => [
                  <Link key={r.npi} to={createPageUrl(`ProviderDetail?npi=${r.npi}`)} className="text-cyan-400 hover:underline">{r.name}</Link>,
                  r.specialty || '—', fmtCount(r.benes),
                ])}
              />
              <p className="text-[11px] text-slate-500 print:hidden">
                <button type="button" className="text-cyan-400 hover:underline" onClick={() => setUrl({ report: settingKey === 'hospice' ? 'calls-hospice' : 'calls-hha', county: url.county })}>Open the full call list.</button>
              </p>
            </Section>
          )}
        </article>
      )}

      {spec && (spec.id.startsWith('expand') ? layer : spec.id.startsWith('acquire') ? leaders : ready && market && !market.needsCounty) && (
        <Card className="bg-slate-900/40 border-slate-800 print:border-0 print:shadow-none">
          <CardContent className="p-3 space-y-2">
            <ComplianceDisclaimer variant="market" />
            <MarketFreshness
              rollups={(spec.id.startsWith('expand') ? layer : spec.id.startsWith('acquire') ? leaders : market)?.rollups}
              jobs={['county_market_profile']}
              vintages={(spec.id.startsWith('expand') ? layer : market)?.vintages}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

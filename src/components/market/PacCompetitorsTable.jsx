import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Building2 } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { fmtCount, fmtPct, fmtRate, fmtShare, fmtMoney } from '@/lib/marketFormat';
import MarketShareTrendChart from './MarketShareTrendChart';
import MarketFreshness from './MarketFreshness';
import { useBusinessLine } from '@/lib/BusinessLineContext';
import SortableTableHead from '../shared/SortableTableHead';
import { nextSort, sortRows } from '@/lib/tableSorting';

const ORDER = ['snf', 'hha', 'hospice', 'irf', 'ltch', 'licensed'];
const LICENSE_LABELS = { personal_care_home: 'Personal care home', assisted_living: 'Assisted living', memory_care: 'Memory care', nursing_home: 'Nursing home', adult_day: 'Adult day', domiciliary_care: 'Domiciliary care' };
const licenseLabel = (t) => LICENSE_LABELS[t] || String(t || '').replace(/_/g, ' ');
// The county's licensed homes: the totals cover every home, while the rows listed are capped.
const licensedHomeCount = (licensed) => (licensed?.totals || []).reduce((sum, t) => sum + (Number(t.homes) || 0), 0) || licensed?.rows?.length || 0;

/** State-licensed homes (personal care, assisted living): not in CMS files, so no Medicare share, just who is there and how big. */
function LicensedHomes({ licensed, countyName }) {
  const [sort, setSort] = useState({ key: 'capacity', direction: 'desc' });
  const rows = licensed?.rows || [];
  const sortedRows = sortRows(rows, sort, (row, key) => key === 'name' ? row.name : row[key]);
  const changeSort = (key) => setSort((current) => nextSort(current, key, key === 'name' || key === 'type' ? 'asc' : 'desc'));
  const totals = licensed?.totals || [];
  if (rows.length === 0) {
    return <p className="text-sm text-slate-400">No state-licensed homes loaded for {countyName || 'this county'}. Import a state licensing export (Data Center › State-Licensed Homes) to see personal care homes and assisted living residences here.</p>;
  }
  const max = Math.max(1, ...rows.map((r) => r.capacity ?? 0));
  const homes = licensedHomeCount(licensed);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {totals.map((t) => (
          <Badge key={t.license_type} variant="outline" className="text-[10px] text-slate-300">{licenseLabel(t.license_type)}: {fmtCount(t.homes)} homes{t.beds != null ? ` · ${fmtCount(t.beds)} beds` : ''}</Badge>
        ))}
        {licensed.as_of ? <Badge variant="outline" className="text-[10px] text-slate-400">as of {licensed.as_of}</Badge> : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <caption className="sr-only">State-licensed homes by capacity</caption>
          <thead>
            <tr className="text-left text-slate-400 border-b border-slate-700/60">
              <SortableTableHead label="Home" column="name" sort={sort} onSort={changeSort} className="py-1.5 pr-2" />
              <SortableTableHead label="Type" column="license_type" sort={sort} onSort={changeSort} className="py-1.5 pr-2" />
              <SortableTableHead label="Capacity" column="capacity" sort={sort} onSort={changeSort} className="py-1.5 pr-2" />
              <SortableTableHead label="Status" column="status" sort={sort} onSort={changeSort} className="py-1.5 pr-2" />
              <SortableTableHead label="Licensee" column="licensee" sort={sort} onSort={changeSort} className="py-1.5" />
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((r) => (
              <tr key={`${r.license_type}:${r.license_number || r.name}`} className="border-b border-slate-800/60">
                <td className="py-1.5 pr-2">
                  <span className="text-slate-200">{r.name}</span>
                  <span className="block text-[10px] text-slate-400">{[r.address, r.city, r.zip5].filter(Boolean).join(', ')}{r.license_number ? ` · license ${r.license_number}` : ''}</span>
                </td>
                <td className="py-1.5 pr-2 text-slate-300">{licenseLabel(r.license_type)}</td>
                <td className="py-1.5 pr-2 min-w-[7rem]">
                  <span className="flex items-center gap-2">
                    <span className="flex-1 h-2 rounded bg-slate-900"><span className="block h-2 rounded bg-pink-500" style={{ width: `${((r.capacity ?? 0) / max) * 100}%` }} /></span>
                    <span className="w-10 text-right text-slate-200">{fmtCount(r.capacity)}</span>
                  </span>
                </td>
                <td className="py-1.5 pr-2 text-slate-300">{r.status || '—'}</td>
                <td className="py-1.5 text-slate-300 truncate max-w-[14rem]">{r.licensee || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {homes > rows.length ? <p className="text-[11px] text-slate-400">Showing the {fmtCount(rows.length)} largest of {fmtCount(homes)} licensed homes in {countyName || 'this county'}; the counts above cover all of them.</p> : null}
    </div>
  );
}

/** Post-acute providers located in a county, ranked by Medicare beneficiaries served, with agency coverage. */
export default function PacCompetitorsTable({ competitors = {}, trends = {}, coverage = {}, licensed = null, labels = {}, rollups, countyName }) {
  const { profile } = useBusinessLine();
  const [showAll, setShowAll] = useState(false);
  const [setting, setSetting] = useState(null);
  const [sort, setSort] = useState({ key: 'benes', direction: 'desc' });
  const order = (!showAll && profile?.competitorSettings?.length) ? profile.competitorSettings : ORDER;
  const active = order.includes(setting) ? setting : (order.find((s) => (s === 'licensed' ? licensed?.rows?.length : competitors[s]?.rows?.length)) || order[0]);
  const allLabels = { ...labels, licensed: 'Personal care / assisted living' };
  const showCensus = active === 'snf' && (competitors.snf?.rows || []).some((r) => r.census);
  const current = competitors[active] || { data_year: null, rows: [] };
  const rows = current.rows || [];
  const sortedRows = sortRows(rows, sort, (row, key) => key === 'name' ? row.name : key === 'census' ? row.census?.total_residents : row[key]);
  const changeSort = (key) => setSort((currentSort) => nextSort(currentSort, key, key === 'name' ? 'asc' : 'desc'));
  const max = Math.max(1, ...rows.map((r) => r.share ?? 0));
  const cover = coverage[active] || [];
  return (
    <Card className="bg-slate-800/50 border-slate-700/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-slate-200 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-amber-400" aria-hidden="true" /> Post-acute providers in {countyName || 'this county'}
        </CardTitle>
        <p className="text-[11px] text-slate-400">
          Share of the Medicare FFS beneficiaries served by providers of each setting located in the county (post-acute utilization{current.data_year ? ` ${current.data_year}` : ''}).
        </p>
        <div className="flex flex-wrap gap-1 pt-1" role="group" aria-label="Setting">
          {order.map((s) => {
            // The county's provider count, not the number of rows listed (the list is capped).
            const n = s === 'licensed' ? licensedHomeCount(licensed) : (competitors[s]?.rows?.[0]?.providers_in_market ?? competitors[s]?.rows?.length);
            return (
            <Button key={s} size="sm" variant={s === active ? 'default' : 'outline'} aria-pressed={s === active}
              className={s === active ? 'bg-cyan-700 hover:bg-cyan-800 text-white h-7 text-xs' : 'border-slate-700 text-slate-300 h-7 text-xs'}
              onClick={() => setSetting(s)}>
              {allLabels[s] || s}{n ? ` (${n})` : ''}
            </Button>
            );
          })}
        </div>
        {profile?.competitorSettings?.length > 0 && profile.competitorSettings.length < ORDER.length && (
          <button type="button" className="text-xs text-cyan-400 hover:underline text-left" onClick={() => setShowAll((v) => !v)}>
            {showAll ? `Show only ${profile.label}` : 'Show every setting'}
          </button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {active === 'licensed' ? (
          <LicensedHomes licensed={licensed} countyName={countyName} />
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-400">No {labels[active] || active} providers in the post-acute utilization file for this county.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <caption className="sr-only">{labels[active] || active} providers by market share</caption>
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-700/60">
                  <th scope="col" className="py-1.5 pr-2">#</th>
                  <SortableTableHead label="Provider" column="name" sort={sort} onSort={changeSort} className="py-1.5 pr-2" />
                  <SortableTableHead label="Beneficiaries" column="benes" sort={sort} onSort={changeSort} className="py-1.5 pr-2 text-right" />
                  <SortableTableHead label="Stays" column="stays" sort={sort} onSort={changeSort} className="py-1.5 pr-2 text-right" />
                  <SortableTableHead label="Share" column="share" sort={sort} onSort={changeSort} className="py-1.5 pr-2" />
                  <SortableTableHead label="Payment" column="payment" sort={sort} onSort={changeSort} className="py-1.5 pr-2 text-right" />
                  <SortableTableHead label="Dual %" column="dual_pct" sort={sort} onSort={changeSort} className="py-1.5 pr-2 text-right" />
                  <SortableTableHead label="Risk" column="risk_score" sort={sort} onSort={changeSort} className="py-1.5 pr-2 text-right" />
                  {showCensus ? <SortableTableHead label="Residents (Medicare / Medicaid)" column="census" sort={sort} onSort={changeSort} className="py-1.5 text-right" /> : null}
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((r, index) => (
                  <tr key={r.ccn} className="border-b border-slate-800/60">
                    <td className="py-1.5 pr-2 text-slate-400">{index + 1}</td>
                    <td className="py-1.5 pr-2">
                      <Link to={createPageUrl(`FacilityDetail?id=${encodeURIComponent(r.ccn)}&group=${r.facility_group || 'snf'}`)} className="text-cyan-400 hover:underline">{r.name || r.ccn}</Link>
                      <span className="block text-[10px] text-slate-400">{[r.city, r.state].filter(Boolean).join(', ') || `CCN ${r.ccn}`}</span>
                    </td>
                    <td className="py-1.5 pr-2 text-right text-slate-200">{fmtCount(r.benes)}</td>
                    <td className="py-1.5 pr-2 text-right text-slate-300">{fmtCount(r.stays)}</td>
                    <td className="py-1.5 pr-2 min-w-[7rem]">
                      <span className="flex items-center gap-2">
                        <span className="flex-1 h-2 rounded bg-slate-900"><span className="block h-2 rounded bg-amber-500" style={{ width: `${((r.share ?? 0) / max) * 100}%` }} /></span>
                        <span className="w-10 text-right text-slate-200">{fmtShare(r.share, 1)}</span>
                      </span>
                    </td>
                    <td className="py-1.5 pr-2 text-right text-slate-300">{fmtMoney(r.payment)}</td>
                    <td className="py-1.5 pr-2 text-right text-slate-300">{fmtPct(r.dual_pct, 0)}</td>
                    <td className="py-1.5 pr-2 text-right text-slate-300">{fmtRate(r.risk_score, 2)}</td>
                    {showCensus ? <td className="py-1.5 text-right text-slate-300">{r.census ? `${fmtCount(r.census.total_residents)} (${fmtShare(r.census.medicare_pct)} / ${fmtShare(r.census.medicaid_pct)})` : '—'}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
            {rows[0]?.providers_in_market > rows.length ? <p className="text-[11px] text-slate-400 mt-1">Showing the top {rows.length} of {rows[0].providers_in_market} providers.</p> : null}
          </div>
        )}
        {active !== 'licensed' && <MarketShareTrendChart trend={trends[active] || []} label={labels[active] || active} />}
        {(active === 'hha' || active === 'hospice') && cover.length > 0 && (
          <div>
            <p className="text-xs text-slate-300 mb-1">{labels[active]} agencies serving the county's ZIP areas (Care Compare service areas), wherever they are based</p>
            <ul className="space-y-1">
              {cover.map((c) => (
                <li key={c.ccn} className="flex items-center gap-2 text-xs">
                  <Link to={createPageUrl(`FacilityDetail?id=${encodeURIComponent(c.ccn)}&group=${c.facility_group || 'home_health'}`)} className="w-56 truncate text-cyan-400 hover:underline">{c.name || c.ccn}</Link>
                  <span className="flex-1 h-2 rounded bg-slate-900"><span className="block h-2 rounded bg-teal-500" style={{ width: `${(c.share_of_county_zips ?? 0) * 100}%` }} /></span>
                  <span className="w-28 text-right text-slate-300">{c.zips_served} of {c.county_zips} ZIPs ({fmtShare(c.share_of_county_zips)})</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {active !== 'licensed' && <MarketFreshness rollups={rollups} jobs={['pac_market_share', 'agency_coverage']} />}
      </CardContent>
    </Card>
  );
}

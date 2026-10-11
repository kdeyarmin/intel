import React, { useMemo, useState } from 'react';
import PageTabs from '@/components/layout/PageTabs';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { invokeOrThrow } from '@/api/functionResult';
import { useUrlState } from '@/hooks/useUrlState';
import { createPageUrl } from '@/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart3, Download, AlertTriangle, ArrowUpDown } from 'lucide-react';
import { US_STATES } from '@/lib/usStates';
import { COUNTY_LAYER_METRICS, LAYER_BY_KEY } from '@/lib/marketLayers';
import { csvHeader, csvValue, formatMetric, sortRows, toCsv } from '@/lib/marketFormat';
import ComplianceDisclaimer from '../components/compliance/ComplianceDisclaimer';
import DataSourcesFooter from '../components/compliance/DataSourcesFooter';
import MarketFreshness from '../components/market/MarketFreshness';

// The columns shown by default; the rest are in the CSV and the metric picker.
const DEFAULT_COLUMNS = ['benes', 'ma_penetration', 'benes_85_plus', 'hha_users_pct', 'hospice_users_pct', 'snf_users_pct', 'snf_providers', 'hospitals_serving'];
const URL_DEFAULTS = { state: 'PA', sort: 'benes', dir: 'desc', cols: DEFAULT_COLUMNS.join(',') };

/** Every county in a state side by side: demand, Medicare Advantage, post-acute use and supply. */
export default function MarketIntelligence() {
  const [url, setUrl] = useUrlState(URL_DEFAULTS);
  const [adding, setAdding] = useState('');
  const columns = useMemo(() => url.cols.split(',').filter((k) => LAYER_BY_KEY[k]), [url.cols]);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['countyMarketLayer', url.state, 'all'],
    queryFn: () => invokeOrThrow('getCountyMarketLayer', { state: url.state, all: true }),
    enabled: !!url.state,
    staleTime: 5 * 60 * 1000,
  });

  const rows = useMemo(() => {
    const list = (data?.counties || []).map((c) => ({ fips: c.fips, name: c.name, ...(c.values || {}) }));
    return sortRows(list, url.sort, url.dir);
  }, [data, url.sort, url.dir]);

  const setSort = (key) => setUrl({ sort: key, dir: url.sort === key && url.dir === 'desc' ? 'asc' : 'desc' });
  const addColumn = (key) => {
    if (key && !columns.includes(key)) setUrl({ cols: [...columns, key].join(',') });
    setAdding('');
  };
  const removeColumn = (key) => setUrl({ cols: columns.filter((k) => k !== key).join(',') });

  const download = () => {
    // Every metric, one unit per column (shares as percent numbers), headed by what it is.
    const csv = toCsv(
      [{ key: 'fips', label: 'County FIPS' }, { key: 'name', label: 'County' }, ...COUNTY_LAYER_METRICS.map((m) => ({ key: m.key, label: csvHeader(m) }))],
      rows.map((r) => ({ fips: r.fips, name: r.name, ...Object.fromEntries(COUNTY_LAYER_METRICS.map((m) => [m.key, csvValue(r[m.key], m.format)])) })),
    );
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `caremetric-county-market-${url.state}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-5">
      <PageTabs current="MarketIntelligence" />
      <div>
        <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-teal-400" aria-hidden="true" />
          Market Intelligence
        </h1>
        <p className="text-sm text-slate-400 mt-1">Every county in a state side by side: Medicare demand, Medicare Advantage, post-acute use and supply, and where residents are hospitalized.</p>
      </div>
      <ComplianceDisclaimer variant="market" />

      <Card className="bg-slate-800/50 border-slate-700/50">
        <CardContent className="py-4 flex flex-col sm:flex-row sm:items-end gap-4">
          <div className="space-y-1">
            <Label htmlFor="market-state" className="text-xs text-slate-400">State</Label>
            <Select value={url.state} onValueChange={(state) => setUrl({ state })}>
              <SelectTrigger id="market-state" className="w-40 bg-slate-900 border-slate-700"><SelectValue placeholder="Pick a state" /></SelectTrigger>
              <SelectContent>{US_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="market-add-col" className="text-xs text-slate-400">Add a column</Label>
            <Select value={adding || undefined} onValueChange={addColumn}>
              <SelectTrigger id="market-add-col" className="w-64 bg-slate-900 border-slate-700"><SelectValue placeholder="Pick a metric" /></SelectTrigger>
              <SelectContent>{COUNTY_LAYER_METRICS.filter((m) => !columns.includes(m.key)).map((m) => <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={download} disabled={rows.length === 0} className="sm:ml-auto border-slate-700 text-slate-300">
            <Download className="w-4 h-4 mr-2" aria-hidden="true" /> Download CSV
          </Button>
        </CardContent>
      </Card>

      {isError ? (
        <div className="bg-red-900/30 border border-red-500/30 rounded-lg p-6 text-center space-y-3" role="alert">
          <AlertTriangle className="w-8 h-8 text-red-400 mx-auto" aria-hidden="true" />
          <p className="text-red-400 text-sm">Couldn't load the county table: {error?.message}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="border-red-500/30 text-red-400">Try again</Button>
        </div>
      ) : isLoading ? (
        <div className="space-y-2" aria-label="Loading counties">{Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-400">No county profiles for {url.state} yet. They need the Medicare enrollment, saturation and variation files imported and the market rollups computed.</p>
      ) : (
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardContent className="pt-4">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <caption className="sr-only">Counties in {url.state} by market metric</caption>
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-700/60">
                    <th scope="col" className="py-1.5 pr-2" aria-sort={url.sort === 'name' ? (url.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                      <button type="button" onClick={() => setSort('name')} className="inline-flex items-center gap-1 hover:text-slate-200">County <ArrowUpDown className="w-3 h-3" aria-hidden="true" /></button>
                    </th>
                    {columns.map((k) => (
                      <th key={k} scope="col" className="py-1.5 pr-2 text-right whitespace-nowrap" aria-sort={url.sort === k ? (url.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                        <button type="button" onClick={() => setSort(k)} className="inline-flex items-center gap-1 hover:text-slate-200">{LAYER_BY_KEY[k].label} <ArrowUpDown className="w-3 h-3" aria-hidden="true" /></button>
                        <button type="button" onClick={() => removeColumn(k)} aria-label={`Remove ${LAYER_BY_KEY[k].label} column`} className="ml-1 text-slate-400 hover:text-red-400">×</button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.fips} className="border-b border-slate-800/60">
                      <td className="py-1.5 pr-2">
                        <Link to={createPageUrl(`CountyIntelligence?state=${url.state}&county=${r.fips}&tab=market`)} className="text-cyan-400 hover:underline">{r.name}</Link>
                      </td>
                      {columns.map((k) => <td key={k} className="py-1.5 pr-2 text-right text-slate-200 whitespace-nowrap">{formatMetric(r[k], LAYER_BY_KEY[k].format)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3"><MarketFreshness rollups={data?.rollups} jobs={['county_market_profile']} vintages={data?.vintages} /></div>
          </CardContent>
        </Card>
      )}
      <DataSourcesFooter />
    </div>
  );
}

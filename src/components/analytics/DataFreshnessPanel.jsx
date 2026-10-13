import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import SortableTableHead from '@/components/shared/SortableTableHead';
import { nextSort, sortRows } from '@/lib/tableSorting';

const STATUS = {
  current: { label: 'Current', cls: 'bg-emerald-900/30 text-emerald-400 border-emerald-500/30' },
  update_available: { label: 'Newer release', cls: 'bg-amber-900/30 text-amber-400 border-amber-500/30' },
  importing: { label: 'Importing', cls: 'bg-sky-900/30 text-sky-400 border-sky-500/30' },
  failed: { label: 'Last import failed', cls: 'bg-rose-900/30 text-rose-400 border-rose-500/30' },
  never_imported: { label: 'Not loaded', cls: 'bg-slate-800 text-slate-400 border-slate-600' },
};

const fmtDate = (v) => (v ? new Date(v).toLocaleDateString() : '—');
const fmtCount = (v) => (v == null ? '—' : Number(v).toLocaleString());

/** Which version of each dataset is loaded, and what CMS has published since. */
export default function DataFreshnessPanel({ onlyLoaded = false }) {
  const [sort, setSort] = useState(null);
  const { data, isLoading } = useQuery({
    queryKey: ['dataFreshness'],
    queryFn: async () => (await base44.functions.invoke('getDataFreshness', {})).data,
    staleTime: 60 * 1000,
  });
  // Loaded means its rows are in the tables, whatever the latest refresh did: a dataset whose first import failed
  // has none (its status is "failed", not "never imported"), while one whose refresh failed keeps its earlier import.
  const filteredRows = (data?.datasets || []).filter((d) => !onlyLoaded || d.imported_at);
  const rows = sort
    ? sortRows(filteredRows, sort, (dataset, key) => key === 'label' ? dataset.label || dataset.import_type : dataset[key])
    : filteredRows;
  const checkedAt = rows.map((d) => d.catalog_checked_at).filter(Boolean).sort().pop();
  return (
    <Card className="bg-slate-900/80 border-slate-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-slate-200 text-base flex items-center gap-2">
          <Clock className="w-4 h-4 text-cyan-400" aria-hidden="true" />
          Data freshness
        </CardTitle>
        <p className="text-xs text-slate-400">
          Each dataset's data year, when CMS last published it and when it was imported here.
          {checkedAt ? ` CMS catalogs checked ${new Date(checkedAt).toLocaleString()}.` : ' The CMS catalogs have not been checked yet; the daily maintenance run does that.'}
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-400">No datasets have been imported yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Loaded datasets and their vintages</caption>
              <thead>
                <tr className="text-left text-xs text-slate-400 border-b border-slate-800">
                  <SortableTableHead label="Dataset" column="label" sort={sort} onSort={(column) => setSort((current) => nextSort(current, column))} className="py-2 pr-3 font-medium" />
                  <SortableTableHead label="Data year" column="data_year" sort={sort} onSort={(column) => setSort((current) => nextSort(current, column))} className="py-2 pr-3 font-medium" />
                  <SortableTableHead label="CMS published" column="catalog_modified" sort={sort} onSort={(column) => setSort((current) => nextSort(current, column))} className="py-2 pr-3 font-medium" />
                  <SortableTableHead label="Imported" column="imported_at" sort={sort} onSort={(column) => setSort((current) => nextSort(current, column))} className="py-2 pr-3 font-medium" />
                  <SortableTableHead label="Rows" column="row_count" sort={sort} onSort={(column) => setSort((current) => nextSort(current, column))} className="py-2 pr-3 font-medium text-right" />
                  <SortableTableHead label="Status" column="status" sort={sort} onSort={(column) => setSort((current) => nextSort(current, column))} className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => {
                  const s = STATUS[d.status] || STATUS.never_imported;
                  return (
                    <tr key={d.import_type} className="border-b border-slate-800/60">
                      <td className="py-2 pr-3 text-slate-200">{d.label}<div className="text-[10px] text-slate-400">{d.import_type}{d.cadence ? ` · ${d.cadence}` : ''}</div></td>
                      <td className="py-2 pr-3 text-slate-300 whitespace-nowrap">{d.data_year || '—'}</td>
                      <td className="py-2 pr-3 text-slate-300 whitespace-nowrap">{fmtDate(d.catalog_modified)}</td>
                      <td className="py-2 pr-3 text-slate-300 whitespace-nowrap">{fmtDate(d.imported_at)}</td>
                      <td className="py-2 pr-3 text-slate-300 text-right whitespace-nowrap">{fmtCount(d.row_count)}</td>
                      <td className="py-2"><Badge variant="outline" className={s.cls}>{s.label}</Badge>{d.notes ? <div className="text-[10px] text-slate-400 max-w-[18rem] truncate" title={d.notes}>{d.notes}</div> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <ReferenceData geography={data?.geography} taxonomy={data?.taxonomy} demographics={data?.demographics} />
      </CardContent>
    </Card>
  );
}

/** The bundled reference data every page relies on: Census geography and the NUCC taxonomy. */
function ReferenceData({ geography, taxonomy, demographics }) {
  if (!geography && !taxonomy && !demographics) return null;
  const items = [
    geography?.loaded
      ? `U.S. Census ${geography.vintage} geography (${fmtCount(geography.counts?.counties)} counties, ${fmtCount(geography.counts?.zctas)} ZIP areas)`
      : 'Census geography not loaded',
    demographics?.loaded
      ? `Census ACS ${demographics.vintage} demographics (${fmtCount(demographics.counts?.counties)} counties, ${fmtCount(demographics.counts?.zctas)} ZIP areas)`
      : 'Census ACS demographics not loaded',
    taxonomy?.loaded
      ? `NUCC taxonomy ${taxonomy.version} (${fmtCount(taxonomy.counts?.taxonomies)} codes)`
      : 'NUCC taxonomy not loaded',
  ];
  return (
    <p className="text-xs text-slate-400 mt-3">
      Reference data: {items.join('; ')}. Bundled with the app and loaded at start-up.
    </p>
  );
}

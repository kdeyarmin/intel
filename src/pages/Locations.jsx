import React, { useMemo, useEffect, useRef, useCallback, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { MapPin, Download } from 'lucide-react';
import SearchFilterBar from '../components/filters/SearchFilterBar';
import ExportDialog from '../components/exports/ExportDialog';
import SavedFilterBar from '../components/filters/SavedFilterBar';
import DataSourcesFooter from '../components/compliance/DataSourcesFooter';
import PageHeader from '../components/shared/PageHeader';
import QueryErrorState from '../components/shared/QueryErrorState';
import { useUrlState } from '@/hooks/useUrlState';
import { US_STATES } from '@/lib/usStates';
import SortableTableHead from '@/components/shared/SortableTableHead';
import { nextSort, sortRows } from '@/lib/tableSorting';

const PAGE_SIZE = 50;
const RECENT_LIMIT = 200;
const SEARCH_LIMIT = 500;

// Filters and paging live in the URL so Back from a location restores them.
const URL_DEFAULTS = { q: '', state: 'all', type: 'all', page: 0 };
const STATE_OPTIONS = US_STATES.map((st) => ({ value: st, label: st }));

export default function Locations() {
  const [url, setUrl] = useUrlState(URL_DEFAULTS);
  const [sort, setSort] = useState(null);
  const { q: search, state: stateFilter, type: typeFilter, page } = url;
  const [searchBox, setSearchBox] = useState(search);
  const setSearch = useCallback((q) => setSearchBox(q), []);
  // Debounce typing into the URL (which drives the server search).
  useEffect(() => {
    const t = setTimeout(() => { if (searchBox.trim() !== search) setUrl({ q: searchBox.trim(), page: 0 }); }, 350);
    return () => clearTimeout(t);
  }, [searchBox, search, setUrl]);
  useEffect(() => { setSearchBox((cur) => (cur.trim() === search ? cur : search)); }, [search]);
  const setPage = useCallback((update) => setUrl((cur) => ({ page: typeof update === 'function' ? update(cur.page) : update })), [setUrl]);

  const { data: savedFilters = [] } = useQuery({
    queryKey: ['savedFilters', 'Locations'],
    queryFn: () => base44.entities.SavedFilter.filter({ page: 'Locations' }),
    staleTime: 30000,
  });

  const defaultApplied = useRef(Object.keys(URL_DEFAULTS).some(k => url[k] !== URL_DEFAULTS[k]));
  useEffect(() => {
    if (defaultApplied.current) return;
    const def = savedFilters.find(f => f.is_default);
    if (def?.filters) {
      applyFilter(def.filters);
      defaultApplied.current = true;
    }
  }, [savedFilters]);

  const applyFilter = (filters) => {
    setUrl({
      q: filters.search || '',
      state: filters.stateFilter || 'all',
      type: filters.typeFilter || 'all',
      page: 0,
    });
  };

  const currentFilters = { search, stateFilter, typeFilter };

  // provider_locations has ~12M rows. Searches (NPI, ZIP, "City, ST", or a
  // state) run on the server against indexes; with nothing to search, browse
  // the newest rows and say so.
  const state = stateFilter !== 'all' ? stateFilter : null;
  const type = typeFilter !== 'all' ? typeFilter : null;
  const searching = !!search || !!state;
  const { data: result, isLoading, isError, error: loadError, refetch, isPlaceholderData } = useQuery({
    queryKey: ['locationsPage', search, state, type],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      if (searching) {
        const res = await base44.functions.invoke('searchLocations', {
          q: search, ...(state ? { state } : {}), ...(type ? { location_type: type } : {}), limit: SEARCH_LIMIT,
        });
        return res.data;
      }
      return { locations: await base44.entities.ProviderLocation.list('-created_date', RECENT_LIMIT), recent: true };
    },
    staleTime: 60000,
  });
  const locations = useMemo(() => result?.locations ?? [], [result]);

  // Browsing recent rows: the type filter applies here. Searches filter on the server.
  const filtered = useMemo(
    () => (searching || !type ? locations : locations.filter((l) => l.location_type === type)),
    [locations, searching, type],
  );
  const sortedFiltered = useMemo(
    () => (sort ? sortRows(filtered, sort, (location, key) => location[key]) : filtered),
    [filtered, sort],
  );

  let subtitle;
  if (isPlaceholderData) subtitle = 'Searching…';
  else if (result?.needsState) subtitle = result.message;
  else if (searching) subtitle = `${filtered.length.toLocaleString()}${result?.truncated ? '+' : ''} location${filtered.length === 1 && !result?.truncated ? '' : 's'} · ${result?.label || 'search'}${result?.degraded ? ' (search indexes are still being built, so this may be slow)' : ''}`;
  else subtitle = `Browsing the ${locations.length.toLocaleString()} most recently added locations. Search by NPI, ZIP, or "City, ST" to find any location.`;

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginatedLocations = sortedFiltered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const resetFilters = () => { setSearchBox(''); setUrl({ q: '', state: 'all', type: 'all', page: 0 }); };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Locations"
        subtitle={subtitle}
        icon={MapPin}
        breadcrumbs={[{ label: 'Providers', page: 'Providers' }, { label: 'Locations' }]}
      />
      <div className="mb-6 flex items-center justify-between">
        <div />
        <ExportDialog
          data={filtered.map(l => ({
            npi: l.npi, address: l.address_1 || '', city: l.city || '', state: l.state || '',
            zip: l.zip || '', phone: l.phone || '', fax: l.fax || '',
            type: l.location_type || '', created_date: l.created_date || '',
          }))}
          fields={[
            { key: 'npi', label: 'NPI' }, { key: 'address', label: 'Address' }, { key: 'city', label: 'City' },
            { key: 'state', label: 'State' }, { key: 'zip', label: 'ZIP' }, { key: 'phone', label: 'Phone' },
            { key: 'fax', label: 'Fax' }, { key: 'type', label: 'Type' },
          ]}
          fileName="locations"
          title="Locations"
          dateField="created_date"
          trigger={<Button variant="outline" className="bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-cyan-400"><Download className="w-4 h-4 mr-2" /> Export</Button>}
        />
      </div>

      <Card className="mb-6 bg-[#141d30] border-slate-700/50">
        <CardContent className="pt-6 space-y-3">
          <SavedFilterBar
            page="Locations"
            currentFilters={currentFilters}
            onApplyFilter={applyFilter}
          />
          <SearchFilterBar
            searchTerm={searchBox}
            onSearchChange={setSearch}
            placeholder='NPI, ZIP, or "City, ST"'
            onReset={resetFilters}
            filters={[
              { key: 'state', type: 'select', label: 'State', value: stateFilter, onChange: v => setUrl({ state: v, page: 0 }), options: STATE_OPTIONS },
              { key: 'type', type: 'select', label: 'Type', value: typeFilter, onChange: v => setUrl({ type: v, page: 0 }), options: [{ value: 'Practice', label: 'Practice' }, { value: 'Mailing', label: 'Mailing' }] },
            ]}
          />
        </CardContent>
      </Card>

      <Card className="bg-[#141d30] border-slate-700/50">
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-slate-200">
            <span className="flex items-center gap-2"><MapPin className="w-5 h-5 text-cyan-400" /> Location Directory</span>
            <span className="text-sm font-normal text-slate-400">{filtered.length}{result?.truncated ? '+' : ''} results</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead label="NPI" column="npi" sort={sort} onSort={(column) => setSort((current) => nextSort(current, column))} />
                  <SortableTableHead label="Address" column="address_1" sort={sort} onSort={(column) => setSort((current) => nextSort(current, column))} />
                  <SortableTableHead label="City" column="city" sort={sort} onSort={(column) => setSort((current) => nextSort(current, column))} />
                  <SortableTableHead label="State" column="state" sort={sort} onSort={(column) => setSort((current) => nextSort(current, column))} />
                  <SortableTableHead label="ZIP" column="zip" sort={sort} onSort={(column) => setSort((current) => nextSort(current, column))} />
                  <SortableTableHead label="Phone" column="phone" sort={sort} onSort={(column) => setSort((current) => nextSort(current, column))} />
                  <SortableTableHead label="Type" column="location_type" sort={sort} onSort={(column) => setSort((current) => nextSort(current, column))} />
                  <TableHead><span className="sr-only">Open</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array(5).fill(0).map((_, i) => (
                   <TableRow key={i}>
                     {Array(8).fill(0).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>)}
                   </TableRow>
                  ))
                ) : isError ? (
                  <TableRow><TableCell colSpan={8} className="py-6"><QueryErrorState title="Unable to load locations" error={loadError} onRetry={refetch} /></TableCell></TableRow>
                ) : filtered.length === 0 ? (
                 <TableRow><TableCell colSpan={8} className="text-center py-8 text-slate-400">
                   {result?.needsState ? result.message : searching ? `No locations found for ${result?.label || 'this search'}.` : 'No locations match the current filters.'}
                 </TableCell></TableRow>
                ) : (
                  paginatedLocations.map(loc => (
                    <TableRow key={loc.id}>
                      <TableCell className="font-mono text-sm">
                        <Link to={createPageUrl(`ProviderDetail?npi=${loc.npi}`)} className="text-slate-400 hover:text-cyan-400 hover:underline">{loc.npi}</Link>
                      </TableCell>
                       <TableCell className="text-slate-300">
                         <Link to={createPageUrl(`LocationDetail?id=${loc.id}`)} className="hover:text-cyan-400 hover:underline">{loc.address_1 || '-'}</Link>
                       </TableCell>
                       <TableCell className="text-slate-300">{loc.city || '-'}</TableCell>
                       <TableCell className="text-slate-300">{loc.state || '-'}</TableCell>
                       <TableCell className="text-slate-300">{loc.zip || '-'}</TableCell>
                       <TableCell className="text-slate-300">
                         {loc.phone ? <a href={`tel:${loc.phone.replace(/[^\d+]/g, '')}`} className="hover:text-cyan-400 hover:underline">{loc.phone}</a> : '-'}
                       </TableCell>
                       <TableCell><Badge variant="outline" className="text-slate-300">{loc.location_type || '-'}</Badge></TableCell>
                      <TableCell>
                        <Button asChild variant="outline" size="sm" className="text-xs h-7 bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-cyan-400">
                          <Link to={createPageUrl(`LocationDetail?id=${loc.id}`)}>View</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-3">
              <p className="text-xs text-slate-400">
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</Button>
                <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <DataSourcesFooter />
    </div>
  );
}
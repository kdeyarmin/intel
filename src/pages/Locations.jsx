import React, { useMemo, useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
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

const PAGE_SIZE = 50;
const RECENT_LIMIT = 200;

// Filters and paging live in the URL so Back from a location restores them.
const URL_DEFAULTS = { q: '', state: 'all', type: 'all', primary: 'all', page: 0 };

export default function Locations() {
  const [url, setUrl] = useUrlState(URL_DEFAULTS);
  const { q: search, state: stateFilter, type: typeFilter, primary: primaryFilter, page } = url;
  const setSearch = useCallback((q) => setUrl({ q, page: 0 }), [setUrl]);
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
      primary: filters.primaryFilter || 'all',
      page: 0,
    });
  };

  const currentFilters = { search, stateFilter, typeFilter, primaryFilter };

  // provider_locations has ~12M rows. A full NPI is looked up on the server
  // (indexed); otherwise we browse the newest rows and filter those, and the
  // header says so rather than calling them "total locations".
  const npiLookup = /^\d{10}$/.test(search.trim()) ? search.trim() : null;
  const { data: locations = [], isLoading, isError, error: loadError, refetch } = useQuery({
    queryKey: ['locationsPage', npiLookup],
    queryFn: () => (npiLookup
      ? base44.entities.ProviderLocation.filter({ npi: npiLookup }, undefined, 200)
      : base44.entities.ProviderLocation.list('-created_date', RECENT_LIMIT)),
    staleTime: 60000,
  });

  const states = useMemo(() => {
    const s = new Set(locations.map(l => l.state).filter(Boolean));
    return [...s].sort().map(st => ({ value: st, label: st }));
  }, [locations]);

  const filtered = useMemo(() => {
    return locations.filter(loc => {
      if (search) {
        const q = search.toLowerCase();
        const match = (loc.npi || '').includes(q) ||
          (loc.city || '').toLowerCase().includes(q) ||
          (loc.address_1 || '').toLowerCase().includes(q) ||
          (loc.zip || '').includes(q) ||
          (loc.phone || '').includes(q);
        if (!match) return false;
      }
      if (stateFilter !== 'all' && loc.state !== stateFilter) return false;
      if (typeFilter !== 'all' && loc.location_type !== typeFilter) return false;
      if (primaryFilter !== 'all') {
        if (primaryFilter === 'yes' && !loc.is_primary) return false;
        if (primaryFilter === 'no' && loc.is_primary) return false;
      }
      return true;
    });
  }, [locations, search, stateFilter, typeFilter, primaryFilter]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginatedLocations = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const resetFilters = () => setUrl({ q: '', state: 'all', type: 'all', primary: 'all', page: 0 });

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Locations"
        subtitle={
          npiLookup
            ? `${locations.length} location${locations.length === 1 ? '' : 's'} for NPI ${npiLookup}`
            : `Browsing the ${locations.length.toLocaleString()} most recently added locations — enter a 10-digit NPI to look up any provider's locations`
        }
        icon={MapPin}
        breadcrumbs={[{ label: 'Providers', page: 'Providers' }, { label: 'Locations' }]}
      />
      <div className="mb-6 flex items-center justify-between">
        <div />
        <ExportDialog
          data={filtered.map(l => ({
            npi: l.npi, address: l.address_1 || '', city: l.city || '', state: l.state || '',
            zip: l.zip || '', phone: l.phone || '', fax: l.fax || '',
            type: l.location_type || '', primary: l.is_primary ? 'Yes' : 'No', created_date: l.created_date || '',
          }))}
          fields={[
            { key: 'npi', label: 'NPI' }, { key: 'address', label: 'Address' }, { key: 'city', label: 'City' },
            { key: 'state', label: 'State' }, { key: 'zip', label: 'ZIP' }, { key: 'phone', label: 'Phone' },
            { key: 'fax', label: 'Fax' }, { key: 'type', label: 'Type' }, { key: 'primary', label: 'Primary' },
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
            searchTerm={search}
            onSearchChange={setSearch}
            onReset={resetFilters}
            filters={[
              { key: 'state', type: 'select', label: 'State', value: stateFilter, onChange: v => setUrl({ state: v, page: 0 }), options: states },
              { key: 'type', type: 'select', label: 'Type', value: typeFilter, onChange: v => setUrl({ type: v, page: 0 }), options: [{ value: 'Practice', label: 'Practice' }, { value: 'Mailing', label: 'Mailing' }] },
              { key: 'primary', type: 'select', label: 'Primary', value: primaryFilter, onChange: v => setUrl({ primary: v, page: 0 }), options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
            ]}
          />
        </CardContent>
      </Card>

      <Card className="bg-[#141d30] border-slate-700/50">
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-slate-200">
            <span className="flex items-center gap-2"><MapPin className="w-5 h-5 text-cyan-400" /> Location Directory</span>
            <span className="text-sm font-normal text-slate-500">{filtered.length} results</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>NPI</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>ZIP</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Primary</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array(5).fill(0).map((_, i) => (
                   <TableRow key={i}>
                     {Array(9).fill(0).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>)}
                   </TableRow>
                  ))
                ) : isError ? (
                  <TableRow><TableCell colSpan={9} className="py-6"><QueryErrorState title="Couldn't load locations" error={loadError} onRetry={refetch} /></TableCell></TableRow>
                ) : filtered.length === 0 ? (
                 <TableRow><TableCell colSpan={9} className="text-center py-8 text-slate-500">
                   {npiLookup ? `No locations on file for NPI ${npiLookup}.` : 'No locations match the current filters.'}
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
                       <TableCell>{loc.is_primary ? <Badge className="bg-blue-900/15 text-blue-400 border border-blue-500/20">Primary</Badge> : <span className="text-slate-500">-</span>}</TableCell>
                      <TableCell>
                        <Link to={createPageUrl(`LocationDetail?id=${loc.id}`)}>
                          <Button variant="outline" size="sm" className="text-xs h-7 bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-cyan-400">View</Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-3">
              <p className="text-xs text-slate-500">
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
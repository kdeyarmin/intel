import React, { useState, useMemo, useEffect } from 'react';
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

export default function Locations() {
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [primaryFilter, setPrimaryFilter] = useState('all');

  const { data: savedFilters = [] } = useQuery({
    queryKey: ['savedFilters', 'Locations'],
    queryFn: () => base44.entities.SavedFilter.filter({ page: 'Locations' }),
    staleTime: 30000,
  });

  useEffect(() => {
    const def = savedFilters.find(f => f.is_default);
    if (def?.filters) applyFilter(def.filters);
  }, [savedFilters.length]);

  const applyFilter = (filters) => {
    setSearch(filters.search || '');
    setStateFilter(filters.stateFilter || 'all');
    setTypeFilter(filters.typeFilter || 'all');
    setPrimaryFilter(filters.primaryFilter || 'all');
  };

  const currentFilters = { search, stateFilter, typeFilter, primaryFilter };

  const { data: locations = [], isLoading } = useQuery({
    queryKey: ['locationsPage'],
    queryFn: () => base44.entities.ProviderLocation.list('-created_date', 200),
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

  const resetFilters = () => {
    setSearch('');
    setStateFilter('all');
    setTypeFilter('all');
    setPrimaryFilter('all');
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Locations"
        subtitle={`${locations.length} total locations`}
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
          trigger={<Button variant="outline"><Download className="w-4 h-4 mr-2" /> Export</Button>}
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
              { key: 'state', type: 'select', label: 'State', value: stateFilter, onChange: setStateFilter, options: states },
              { key: 'type', type: 'select', label: 'Type', value: typeFilter, onChange: setTypeFilter, options: [{ value: 'Practice', label: 'Practice' }, { value: 'Mailing', label: 'Mailing' }] },
              { key: 'primary', type: 'select', label: 'Primary', value: primaryFilter, onChange: setPrimaryFilter, options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
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
                ) : filtered.length === 0 ? (
                 <TableRow><TableCell colSpan={9} className="text-center py-8 text-slate-500">No locations found</TableCell></TableRow>
                ) : (
                  filtered.slice(0, 100).map(loc => (
                    <TableRow key={loc.id}>
                      <TableCell className="font-mono text-sm text-slate-400">{loc.npi}</TableCell>
                       <TableCell className="text-slate-300">{loc.address_1 || '-'}</TableCell>
                       <TableCell className="text-slate-300">{loc.city || '-'}</TableCell>
                       <TableCell className="text-slate-300">{loc.state || '-'}</TableCell>
                       <TableCell className="text-slate-300">{loc.zip || '-'}</TableCell>
                       <TableCell className="text-slate-300">{loc.phone || '-'}</TableCell>
                       <TableCell><Badge variant="outline" className="text-slate-300">{loc.location_type || '-'}</Badge></TableCell>
                       <TableCell>{loc.is_primary ? <Badge className="bg-blue-500/15 text-blue-400 border border-blue-500/20">Primary</Badge> : <span className="text-slate-500">-</span>}</TableCell>
                      <TableCell>
                        <Link to={createPageUrl(`LocationDetail?id=${loc.id}`)}>
                          <Button variant="outline" size="sm" className="text-xs h-7">View</Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {filtered.length > 100 && <p className="text-xs text-slate-500 mt-3 text-center">Showing first 100 of {filtered.length}</p>}
        </CardContent>
      </Card>

      <DataSourcesFooter />
    </div>
  );
}
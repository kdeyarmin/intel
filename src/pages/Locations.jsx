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
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Locations</h1>
          <p className="text-gray-600 mt-1">{locations.length} total locations</p>
        </div>
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

      <Card className="mb-6 bg-white">
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

      <Card className="bg-white">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2"><MapPin className="w-5 h-5" /> Location Directory</span>
            <span className="text-sm font-normal text-gray-500">{filtered.length} results</span>
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
                 <TableRow><TableCell colSpan={9} className="text-center py-8 text-gray-500">No locations found</TableCell></TableRow>
                ) : (
                  filtered.slice(0, 100).map(loc => (
                    <TableRow key={loc.id}>
                      <TableCell className="font-mono text-sm">{loc.npi}</TableCell>
                      <TableCell>{loc.address_1 || '-'}</TableCell>
                      <TableCell>{loc.city || '-'}</TableCell>
                      <TableCell>{loc.state || '-'}</TableCell>
                      <TableCell>{loc.zip || '-'}</TableCell>
                      <TableCell>{loc.phone || '-'}</TableCell>
                      <TableCell><Badge variant="outline">{loc.location_type || '-'}</Badge></TableCell>
                      <TableCell>{loc.is_primary ? <Badge className="bg-blue-100 text-blue-700">Primary</Badge> : '-'}</TableCell>
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
          {filtered.length > 100 && <p className="text-xs text-gray-400 mt-3 text-center">Showing first 100 of {filtered.length}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
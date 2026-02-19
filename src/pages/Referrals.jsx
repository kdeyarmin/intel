import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { GitBranch } from 'lucide-react';
import SearchFilterBar from '../components/filters/SearchFilterBar';

export default function Referrals() {
  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState('all');
  const [minReferrals, setMinReferrals] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const { data: referrals = [], isLoading } = useQuery({
    queryKey: ['referrals'],
    queryFn: () => base44.entities.CMSReferral.list('-created_date', 200),
    staleTime: 60000,
  });

  const years = useMemo(() => {
    const y = new Set(referrals.map(r => r.year).filter(Boolean));
    return [...y].sort((a, b) => b - a).map(yr => ({ value: String(yr), label: String(yr) }));
  }, [referrals]);

  const filtered = useMemo(() => {
    return referrals.filter(r => {
      if (search && !(r.npi || '').includes(search)) return false;
      if (yearFilter !== 'all' && String(r.year) !== yearFilter) return false;
      if (minReferrals && (r.total_referrals || 0) < Number(minReferrals)) return false;
      if (typeFilter !== 'all') {
        if (typeFilter === 'home_health' && !(r.home_health_referrals > 0)) return false;
        if (typeFilter === 'hospice' && !(r.hospice_referrals > 0)) return false;
        if (typeFilter === 'snf' && !(r.snf_referrals > 0)) return false;
        if (typeFilter === 'dme' && !(r.dme_referrals > 0)) return false;
      }
      return true;
    });
  }, [referrals, search, yearFilter, minReferrals, typeFilter]);

  const resetFilters = () => {
    setSearch('');
    setYearFilter('all');
    setMinReferrals('');
    setTypeFilter('all');
  };

  const fmt = (v) => v != null ? Number(v).toLocaleString() : '0';

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Referrals</h1>
        <p className="text-gray-600 mt-1">{referrals.length} referral records</p>
      </div>

      <Card className="mb-6 bg-white">
        <CardContent className="pt-6">
          <SearchFilterBar
            searchTerm={search}
            onSearchChange={setSearch}
            onReset={resetFilters}
            filters={[
              { key: 'year', type: 'select', label: 'Year', value: yearFilter, onChange: setYearFilter, options: years },
              { key: 'minRef', type: 'number', label: 'Min Referrals', value: minReferrals, onChange: setMinReferrals },
              { key: 'type', type: 'select', label: 'Referral Type', value: typeFilter, onChange: setTypeFilter, options: [
                { value: 'home_health', label: 'Home Health' },
                { value: 'hospice', label: 'Hospice' },
                { value: 'snf', label: 'SNF' },
                { value: 'dme', label: 'DME' },
              ]},
            ]}
          />
        </CardContent>
      </Card>

      <Card className="bg-white">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2"><GitBranch className="w-5 h-5" /> CMS Referral Records</span>
            <span className="text-sm font-normal text-gray-500">{filtered.length} results</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>NPI</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Home Health</TableHead>
                  <TableHead className="text-right">Hospice</TableHead>
                  <TableHead className="text-right">SNF</TableHead>
                  <TableHead className="text-right">DME</TableHead>
                  <TableHead className="text-right">Imaging</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array(5).fill(0).map((_, i) => (
                    <TableRow key={i}>
                      {Array(8).fill(0).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>)}
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-gray-500">No referral records found</TableCell></TableRow>
                ) : (
                  filtered.slice(0, 100).map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-sm">{r.npi}</TableCell>
                      <TableCell>{r.year || '-'}</TableCell>
                      <TableCell className="text-right font-medium">{fmt(r.total_referrals)}</TableCell>
                      <TableCell className="text-right">{r.home_health_referrals > 0 ? <Badge className="bg-green-100 text-green-700">{fmt(r.home_health_referrals)}</Badge> : '0'}</TableCell>
                      <TableCell className="text-right">{r.hospice_referrals > 0 ? <Badge className="bg-purple-100 text-purple-700">{fmt(r.hospice_referrals)}</Badge> : '0'}</TableCell>
                      <TableCell className="text-right">{fmt(r.snf_referrals)}</TableCell>
                      <TableCell className="text-right">{fmt(r.dme_referrals)}</TableCell>
                      <TableCell className="text-right">{fmt(r.imaging_referrals)}</TableCell>
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
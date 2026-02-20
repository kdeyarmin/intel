import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { GitBranch, Download } from 'lucide-react';
import SearchFilterBar from '../components/filters/SearchFilterBar';
import ExportDialog from '../components/exports/ExportDialog';
import DataSourcesFooter from '../components/compliance/DataSourcesFooter';

export default function Referrals() {
  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState('all');
  const [minReferrals, setMinReferrals] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const { data: referrals = [], isLoading } = useQuery({
    queryKey: ['referralsPage'],
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
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Referrals</h1>
          <p className="text-slate-500 mt-1">{referrals.length} referral records</p>
        </div>
        <ExportDialog
          data={filtered.map(r => ({
            npi: r.npi, year: r.year || '', total_referrals: r.total_referrals ?? '',
            home_health: r.home_health_referrals ?? '', hospice: r.hospice_referrals ?? '',
            snf: r.snf_referrals ?? '', dme: r.dme_referrals ?? '', created_date: r.created_date || '',
          }))}
          fields={[
            { key: 'npi', label: 'NPI' }, { key: 'year', label: 'Year' }, { key: 'total_referrals', label: 'Total' },
            { key: 'home_health', label: 'Home Health' }, { key: 'hospice', label: 'Hospice' },
            { key: 'snf', label: 'SNF' }, { key: 'dme', label: 'DME' },
          ]}
          fileName="referrals"
          title="CMS Referrals"
          dateField="created_date"
          trigger={<Button variant="outline" className="bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-cyan-400"><Download className="w-4 h-4 mr-2" /> Export</Button>}
        />
      </div>

      <Card className="mb-6 bg-[#141d30] border-slate-700/50">
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

      <Card className="bg-[#141d30] border-slate-700/50">
        <CardHeader>
          <CardTitle className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-slate-200">
            <span className="flex items-center gap-2"><GitBranch className="w-5 h-5 text-cyan-400" /> CMS Referral Records</span>
            <span className="text-sm font-normal text-slate-500">{filtered.length} results</span>
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
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-slate-500">No referral records found</TableCell></TableRow>
                ) : (
                  filtered.slice(0, 100).map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-sm text-slate-400">{r.npi}</TableCell>
                      <TableCell className="text-slate-400">{r.year || '-'}</TableCell>
                      <TableCell className="text-right font-medium text-slate-200">{fmt(r.total_referrals)}</TableCell>
                      <TableCell className="text-right">{r.home_health_referrals > 0 ? <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">{fmt(r.home_health_referrals)}</Badge> : <span className="text-slate-600">0</span>}</TableCell>
                      <TableCell className="text-right">{r.hospice_referrals > 0 ? <Badge className="bg-violet-500/15 text-violet-400 border border-violet-500/20">{fmt(r.hospice_referrals)}</Badge> : <span className="text-slate-600">0</span>}</TableCell>
                      <TableCell className="text-right text-slate-300">{fmt(r.snf_referrals)}</TableCell>
                      <TableCell className="text-right text-slate-300">{fmt(r.dme_referrals)}</TableCell>

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
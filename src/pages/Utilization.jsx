import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Activity, Download } from 'lucide-react';
import SearchFilterBar from '../components/filters/SearchFilterBar';
import ExportDialog from '../components/exports/ExportDialog';

export default function Utilization() {
  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState('all');
  const [minBeneficiaries, setMinBeneficiaries] = useState('');
  const [minPayment, setMinPayment] = useState('');

  const { data: utilization = [], isLoading } = useQuery({
    queryKey: ['utilizationPage'],
    queryFn: () => base44.entities.CMSUtilization.list('-created_date', 200),
    staleTime: 60000,
  });

  const years = useMemo(() => {
    const y = new Set(utilization.map(u => u.year).filter(Boolean));
    return [...y].sort((a, b) => b - a).map(yr => ({ value: String(yr), label: String(yr) }));
  }, [utilization]);

  const filtered = useMemo(() => {
    return utilization.filter(u => {
      if (search && !(u.npi || '').includes(search)) return false;
      if (yearFilter !== 'all' && String(u.year) !== yearFilter) return false;
      if (minBeneficiaries && (u.total_medicare_beneficiaries || 0) < Number(minBeneficiaries)) return false;
      if (minPayment && (u.total_medicare_payment || 0) < Number(minPayment)) return false;
      return true;
    });
  }, [utilization, search, yearFilter, minBeneficiaries, minPayment]);

  const resetFilters = () => {
    setSearch('');
    setYearFilter('all');
    setMinBeneficiaries('');
    setMinPayment('');
  };

  const fmt = (v) => v != null ? Number(v).toLocaleString() : '-';
  const fmtDollar = (v) => v != null ? `$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '-';

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Utilization</h1>
          <p className="text-gray-600 mt-1">{utilization.length} utilization records</p>
        </div>
        <ExportDialog
          data={filtered.map(u => ({
            npi: u.npi, year: u.year || '', total_services: u.total_services ?? '',
            beneficiaries: u.total_medicare_beneficiaries ?? '', submitted_charges: u.total_submitted_charges ?? '',
            medicare_allowed: u.total_medicare_allowed ?? '', medicare_payment: u.total_medicare_payment ?? '',
            drug_services: u.drug_services ?? '', created_date: u.created_date || '',
          }))}
          fields={[
            { key: 'npi', label: 'NPI' }, { key: 'year', label: 'Year' }, { key: 'total_services', label: 'Services' },
            { key: 'beneficiaries', label: 'Beneficiaries' }, { key: 'submitted_charges', label: 'Submitted Charges' },
            { key: 'medicare_allowed', label: 'Medicare Allowed' }, { key: 'medicare_payment', label: 'Medicare Payment' },
            { key: 'drug_services', label: 'Drug Services' },
          ]}
          fileName="utilization"
          title="CMS Utilization"
          dateField="created_date"
          trigger={<Button variant="outline"><Download className="w-4 h-4 mr-2" /> Export</Button>}
        />
      </div>

      <Card className="mb-6 bg-white">
        <CardContent className="pt-6">
          <SearchFilterBar
            searchTerm={search}
            onSearchChange={setSearch}
            onReset={resetFilters}
            filters={[
              { key: 'year', type: 'select', label: 'Year', value: yearFilter, onChange: setYearFilter, options: years },
              { key: 'minBene', type: 'number', label: 'Min Beneficiaries', value: minBeneficiaries, onChange: setMinBeneficiaries },
              { key: 'minPay', type: 'number', label: 'Min Payment ($)', value: minPayment, onChange: setMinPayment },
            ]}
          />
        </CardContent>
      </Card>

      <Card className="bg-white">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2"><Activity className="w-5 h-5" /> CMS Utilization Records</span>
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
                  <TableHead className="text-right">Services</TableHead>
                  <TableHead className="text-right">Beneficiaries</TableHead>
                  <TableHead className="text-right">Submitted Charges</TableHead>
                  <TableHead className="text-right">Medicare Allowed</TableHead>
                  <TableHead className="text-right">Medicare Payment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array(5).fill(0).map((_, i) => (
                    <TableRow key={i}>
                      {Array(7).fill(0).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>)}
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-gray-500">No utilization records found</TableCell></TableRow>
                ) : (
                  filtered.slice(0, 100).map(u => (
                    <TableRow key={u.id}>
                      <TableCell className="font-mono text-sm">{u.npi}</TableCell>
                      <TableCell>{u.year || '-'}</TableCell>
                      <TableCell className="text-right">{fmt(u.total_services)}</TableCell>
                      <TableCell className="text-right">{fmt(u.total_medicare_beneficiaries)}</TableCell>
                      <TableCell className="text-right">{fmtDollar(u.total_submitted_charges)}</TableCell>
                      <TableCell className="text-right">{fmtDollar(u.total_medicare_allowed)}</TableCell>
                      <TableCell className="text-right font-medium">{fmtDollar(u.total_medicare_payment)}</TableCell>
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
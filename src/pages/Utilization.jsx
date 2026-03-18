import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/shared/PageHeader';
import { Activity, Search, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function Utilization() {
  const [searchTerm, setSearchTerm] = useState('');
  const [yearFilter, setYearFilter] = useState('all');

  const { data: records, isLoading } = useQuery({
    queryKey: ['provider_utilization', yearFilter],
    queryFn: async () => {
      const query = {};
      if (yearFilter !== 'all') {
        query.data_year = parseInt(yearFilter);
      }
      // Fetch some recent utilization data
      return await base44.entities.ProviderServiceUtilization.filter(query, '-data_year', 100);
    },
    initialData: [],
  });

  const filteredRecords = records.filter(record => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      (record.npi && record.npi.toLowerCase().includes(term)) ||
      (record.hcpcs_code && record.hcpcs_code.toLowerCase().includes(term)) ||
      (record.hcpcs_description && record.hcpcs_description.toLowerCase().includes(term))
    );
  });

  return (
    <div className="max-w-[120rem] mx-auto p-6 space-y-6">
      <PageHeader 
        title="Service Utilization" 
        subtitle="View and analyze provider service utilization and Medicare payment metrics"
        icon={Activity}
        breadcrumbs={[
          { label: "Analytics", path: "/advanced-analytics" },
          { label: "Utilization" }
        ]}
      />

      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-card p-4 rounded-xl border">
        <div className="relative flex-1 w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search by NPI, HCPCS code or description..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Year:</span>
          </div>
          <Select value={yearFilter} onValueChange={setYearFilter}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="All Years" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Years</SelectItem>
              <SelectItem value="2023">2023</SelectItem>
              <SelectItem value="2022">2022</SelectItem>
              <SelectItem value="2021">2021</SelectItem>
              <SelectItem value="2020">2020</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="rounded-md border-0">
            <Table>
              <TableHeader className="bg-slate-50/50 dark:bg-slate-900/50">
                <TableRow>
                  <TableHead className="font-semibold text-slate-600 dark:text-slate-300">NPI</TableHead>
                  <TableHead className="font-semibold text-slate-600 dark:text-slate-300">Service / HCPCS</TableHead>
                  <TableHead className="font-semibold text-slate-600 dark:text-slate-300 text-right">Beneficiaries</TableHead>
                  <TableHead className="font-semibold text-slate-600 dark:text-slate-300 text-right">Services</TableHead>
                  <TableHead className="font-semibold text-slate-600 dark:text-slate-300 text-right">Avg Submitted</TableHead>
                  <TableHead className="font-semibold text-slate-600 dark:text-slate-300 text-right">Avg Medicare Paid</TableHead>
                  <TableHead className="font-semibold text-slate-600 dark:text-slate-300">Year</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, idx) => (
                    <TableRow key={idx}>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredRecords.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-48 text-center text-muted-foreground">
                      <div className="flex flex-col items-center justify-center">
                        <Activity className="w-8 h-8 text-slate-300 mb-2" />
                        <p>No utilization data found</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRecords.map((record) => (
                    <TableRow key={record.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                      <TableCell className="font-medium text-cyan-600">{record.npi}</TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-sm">{record.hcpcs_code}</span>
                          <span className="text-xs text-muted-foreground truncate max-w-xs" title={record.hcpcs_description}>
                            {record.hcpcs_description}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{record.total_beneficiaries?.toLocaleString() || '-'}</TableCell>
                      <TableCell className="text-right">{record.total_services?.toLocaleString() || '-'}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {record.avg_submitted_charge ? `$${record.avg_submitted_charge.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : '-'}
                      </TableCell>
                      <TableCell className="text-right font-medium text-green-600">
                        {record.avg_medicare_payment ? `$${record.avg_medicare_payment.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : '-'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{record.data_year || '-'}</Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
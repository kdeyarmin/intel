import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Package, Search, Filter, Download, Mail, Loader2, Square, Building2, MapPin, CheckCircle2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { exportCSV, exportExcel } from '@/components/exports/exportUtils';

const EXPORT_FIELDS = [
  { key: 'name', label: 'Company Name' },
  { key: 'npi', label: 'NPI' },
  { key: 'address', label: 'Address' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'zip', label: 'ZIP' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Primary Email' },
  { key: 'additional_emails', label: 'Additional Emails' },
  { key: 'emails_found', label: 'Emails Found' },
  { key: 'email_status', label: 'Email Status' },
  { key: 'website', label: 'Website' },
];

const PAGE_SIZE = 50;

function StatusBadge({ status }) {
  if (status === 'found' || status === 'directory') {
    return <Badge className="bg-emerald-900/30 text-emerald-400 border-emerald-500/30 text-xs">Found</Badge>;
  }
  if (status === 'not_found') {
    return <Badge className="bg-slate-700/40 text-slate-400 border-slate-600/30 text-xs">No email</Badge>;
  }
  return <Badge className="bg-slate-700/30 text-slate-500 border-slate-600/20 text-xs">Not searched</Badge>;
}

export default function DMEProviderReport() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedState, setSelectedState] = useState('');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(null); // 'csv' | 'excel' | null

  React.useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['dmeReport', selectedState, debouncedSearch, page],
    queryFn: () => base44.functions.invoke('getDMEProviders', {
      state: selectedState || undefined,
      search: debouncedSearch || undefined,
      page,
      limit: PAGE_SIZE,
    }),
    select: (res) => res.data || res,
    placeholderData: keepPreviousData,
  });

  const providers = data?.providers || [];
  const total = data?.total || 0;
  const availableStates = data?.available_states || [];
  const emailStats = data?.email_stats || { total: 0, searched: 0, with_email: 0 };
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Background AI email-finder status (polls while running).
  const { data: jobStatus } = useQuery({
    queryKey: ['dmeEmailStatus'],
    queryFn: () => base44.functions.invoke('dmeEmailSearchStatus').then((r) => r.data || r),
    refetchInterval: (q) => (q.state.data?.running ? 3000 : false),
  });
  const isRunning = jobStatus?.running;
  const jobProgress = jobStatus?.progress;

  // When a running job finishes, refresh the list/coverage once.
  const prevRunning = React.useRef(false);
  React.useEffect(() => {
    if (prevRunning.current && !isRunning) {
      queryClient.invalidateQueries({ queryKey: ['dmeReport'] });
    }
    prevRunning.current = !!isRunning;
  }, [isRunning, queryClient]);

  const startMutation = useMutation({
    mutationFn: () => base44.functions.invoke('startDMEEmailSearch', { state: selectedState || undefined }).then((r) => r.data || r),
    onSuccess: (res) => {
      toast[res?.task_id ? 'success' : 'info'](res?.message || 'Email search started');
      queryClient.invalidateQueries({ queryKey: ['dmeEmailStatus'] });
    },
    onError: (e) => toast.error(e?.data?.detail || e?.message || 'Failed to start email search'),
  });

  const stopMutation = useMutation({
    mutationFn: () => base44.functions.invoke('stopDMEEmailSearch').then((r) => r.data || r),
    onSuccess: () => {
      toast.info('Email search stopped');
      queryClient.invalidateQueries({ queryKey: ['dmeEmailStatus'] });
    },
    onError: (e) => toast.error(e?.message || 'Failed to stop email search'),
  });

  const handleExport = async (format) => {
    setExporting(format);
    try {
      const res = await base44.functions.invoke('getDMEProviders', {
        state: selectedState || undefined,
        search: debouncedSearch || undefined,
        for_export: true,
      });
      const rows = (res.data || res)?.providers || [];
      if (rows.length === 0) {
        toast.info('No DME providers to export for the current filter.');
        return;
      }
      const ts = new Date().toISOString().split('T')[0];
      const scope = selectedState ? `-${selectedState}` : '-all';
      const fileName = `dme-providers${scope}-${ts}`;
      if (format === 'excel') exportExcel(rows, EXPORT_FIELDS, fileName);
      else exportCSV(rows, EXPORT_FIELDS, fileName);
      toast.success(`Exported ${rows.length.toLocaleString()} DME providers to ${format.toUpperCase()}`);
    } catch (e) {
      toast.error(e?.message || 'Export failed');
    } finally {
      setExporting(null);
    }
  };

  const coverage = emailStats.total > 0 ? Math.round((emailStats.with_email / emailStats.total) * 100) : 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-3 flex-1">
          <Package className="w-6 h-6 text-cyan-400" />
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-100">DME Provider Report</h1>
            <p className="text-sm text-slate-400">Durable medical equipment suppliers — names, addresses & emails</p>
          </div>
          <Badge className="bg-slate-700/50 text-slate-400 ml-2">{total.toLocaleString()} suppliers</Badge>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => handleExport('csv')} disabled={!!exporting || total === 0} className="bg-cyan-600 hover:bg-cyan-700">
            {exporting === 'csv' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            {exporting === 'csv' ? 'Exporting…' : 'Export CSV'}
          </Button>
          <Button onClick={() => handleExport('excel')} disabled={!!exporting || total === 0} variant="outline"
            className="border-emerald-500/40 text-emerald-400 hover:bg-emerald-900/20">
            {exporting === 'excel' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            {exporting === 'excel' ? 'Exporting…' : 'Export Excel'}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardContent className="p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wide">Suppliers</p>
            <p className="text-2xl font-bold text-slate-100 mt-1">{(emailStats.total || total).toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardContent className="p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wide">Emails Found</p>
            <p className="text-2xl font-bold text-emerald-400 mt-1">{(emailStats.with_email || 0).toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardContent className="p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wide">Searched</p>
            <p className="text-2xl font-bold text-slate-100 mt-1">{(emailStats.searched || 0).toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardContent className="p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wide">Coverage</p>
            <p className="text-2xl font-bold text-cyan-400 mt-1">{coverage}%</p>
          </CardContent>
        </Card>
      </div>

      {/* AI email finder (admin only) */}
      {isAdmin && (
        <Card className="bg-slate-800/40 border-slate-700/50">
          <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-3 flex-1">
              <div className="w-9 h-9 rounded-lg bg-cyan-900/30 border border-cyan-500/30 flex items-center justify-center">
                <Mail className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-200">AI Email Finder</p>
                <p className="text-xs text-slate-400">
                  {isRunning
                    ? `Searching${jobStatus?.state ? ` ${jobStatus.state}` : ''}… ${jobProgress?.processed?.toLocaleString() || 0}/${jobProgress?.total?.toLocaleString() || 0} · ${jobProgress?.found?.toLocaleString() || 0} found`
                    : `Finds business emails for DME suppliers missing one${selectedState ? ` in ${selectedState}` : ' (all states)'}.`}
                </p>
              </div>
            </div>
            {isRunning && jobProgress?.total > 0 && (
              <div className="w-full sm:w-48">
                <div className="h-2 bg-slate-700/60 rounded-full overflow-hidden">
                  <div className="h-full bg-cyan-500 transition-all" style={{ width: `${jobProgress.percent}%` }} />
                </div>
                <p className="text-[10px] text-slate-400 mt-1 text-right">{jobProgress.percent}%</p>
              </div>
            )}
            {isRunning ? (
              <Button variant="outline" size="sm" onClick={() => stopMutation.mutate()} disabled={stopMutation.isPending}
                className="border-rose-500/40 text-rose-400 hover:bg-rose-900/20">
                <Square className="w-3.5 h-3.5 mr-2" /> Stop
              </Button>
            ) : (
              <Button size="sm" onClick={() => startMutation.mutate()} disabled={startMutation.isPending}
                className="bg-cyan-600 hover:bg-cyan-700">
                {startMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Mail className="w-3.5 h-3.5 mr-2" />}
                Find Emails{selectedState ? ` (${selectedState})` : ' (All)'}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search DME supplier name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-slate-800/50 border-slate-700/50 text-slate-200 placeholder:text-slate-400"
          />
        </div>
        <Select value={selectedState} onValueChange={(v) => { setSelectedState(v === 'all' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-[200px] bg-slate-800/50 border-slate-700/50 text-slate-200">
            <Filter className="w-3.5 h-3.5 mr-2 text-slate-400" />
            <SelectValue placeholder="All States" />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            <SelectItem value="all" className="text-slate-300">All States</SelectItem>
            {availableStates.map((s) => (
              <SelectItem key={s.state} value={s.state} className="text-slate-300">{s.state} ({s.count.toLocaleString()})</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14 bg-slate-800" />)}
        </div>
      ) : providers.length === 0 ? (
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardContent className="py-12 text-center">
            <Building2 className="w-10 h-10 text-slate-400 mx-auto mb-3" />
            <p className="text-slate-300">No DME suppliers found</p>
            <p className="text-sm text-slate-400 mt-1">Try adjusting your search or state filter</p>
          </CardContent>
        </Card>
      ) : (
        <div className={`space-y-1 ${isFetching ? 'opacity-70' : ''}`}>
          <div className="hidden md:grid grid-cols-12 gap-3 px-4 py-2 text-xs text-slate-400 font-medium uppercase tracking-wide">
            <div className="col-span-4">Supplier</div>
            <div className="col-span-3">Address</div>
            <div className="col-span-3">Email</div>
            <div className="col-span-2 text-right">Status</div>
          </div>
          {providers.map((p, i) => (
            <div
              key={p.provider_id || i}
              className="grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-3 bg-slate-800/30 border border-slate-700/30 rounded-lg px-4 py-3 items-center"
            >
              <div className="md:col-span-4 flex items-center gap-3 min-w-0">
                <Package className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-200 truncate">{p.name || p.provider_id}</p>
                  {p.npi ? <p className="text-[10px] text-slate-500">NPI {p.npi}</p> : null}
                </div>
              </div>
              <div className="md:col-span-3 flex items-start gap-1 text-sm text-slate-400 min-w-0">
                <MapPin className="w-3 h-3 flex-shrink-0 mt-1" />
                <span className="truncate">
                  {[p.address, [p.city, p.state].filter(Boolean).join(', '), p.zip].filter(Boolean).join(' · ') || '—'}
                </span>
              </div>
              <div className="md:col-span-3 min-w-0">
                {p.email ? (
                  <div className="min-w-0">
                    <span className="text-sm text-cyan-300 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                      <span className="truncate">{p.email}</span>
                    </span>
                    {p.emails_found > 1 && (
                      <span title={p.all_emails} className="text-[10px] text-slate-400 cursor-help">
                        +{p.emails_found - 1} more email{p.emails_found - 1 === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-sm text-slate-500">—</span>
                )}
              </div>
              <div className="md:col-span-2 flex md:justify-end">
                <StatusBadge status={p.email_status} />
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-slate-400">Page {page} of {totalPages} ({total.toLocaleString()} suppliers)</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((x) => x - 1)} className="border-slate-700 text-slate-300 hover:bg-slate-700">Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((x) => x + 1)} className="border-slate-700 text-slate-300 hover:bg-slate-700">Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}

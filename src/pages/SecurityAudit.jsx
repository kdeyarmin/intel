import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import {
  ShieldCheck, Upload, Download, Calculator, FileText, Search,
  Users, Activity, AlertTriangle, Filter, RefreshCw, UserCheck
} from 'lucide-react';
import PageHeader from '../components/shared/PageHeader';
import { formatDateTimeET } from '../components/utils/dateUtils';

const EVENT_TYPE_CONFIG = {
  import: { label: 'Import', color: 'bg-blue-500/15 text-blue-400 border-blue-500/20', Icon: Upload },
  export: { label: 'Export', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20', Icon: Download },
  scoring_run: { label: 'Scoring Run', color: 'bg-purple-500/15 text-purple-400 border-purple-500/20', Icon: Calculator },
  login: { label: 'Login', color: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20', Icon: UserCheck },
  permission_change: { label: 'Permission Change', color: 'bg-amber-500/15 text-amber-400 border-amber-500/20', Icon: AlertTriangle },
};

function getEventConfig(type) {
  return EVENT_TYPE_CONFIG[type] || { label: type || 'Other', color: 'bg-slate-500/15 text-slate-400 border-slate-500/20', Icon: FileText };
}

export default function SecurityAudit() {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterUser, setFilterUser] = useState('all');

  const { data: events = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['securityAuditEvents'],
    queryFn: () => base44.entities.AuditEvent.list('-created_date', 500),
    staleTime: 30000,
  });

  // Derive unique users and event types for filter dropdowns
  const uniqueUsers = useMemo(() => {
    const emails = [...new Set(events.map(e => e.user_email).filter(Boolean))];
    return emails.sort();
  }, [events]);

  const uniqueTypes = useMemo(() => {
    const types = [...new Set(events.map(e => e.event_type).filter(Boolean))];
    return types.sort();
  }, [events]);

  // Apply filters
  const filtered = useMemo(() => {
    return events.filter(e => {
      if (filterType !== 'all' && e.event_type !== filterType) return false;
      if (filterUser !== 'all' && e.user_email !== filterUser) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          (e.user_email || '').toLowerCase().includes(q) ||
          (e.event_type || '').toLowerCase().includes(q) ||
          (e.details?.action || '').toLowerCase().includes(q) ||
          (e.details?.message || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [events, filterType, filterUser, search]);

  // Summary metrics
  const totalEvents = events.length;
  const uniqueUserCount = uniqueUsers.length;
  const exportCount = events.filter(e => e.event_type === 'export').length;
  const permissionChangeCount = events.filter(e => e.event_type === 'permission_change').length;

  const clearFilters = () => {
    setSearch('');
    setFilterType('all');
    setFilterUser('all');
  };

  const hasActiveFilters = search || filterType !== 'all' || filterUser !== 'all';

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <PageHeader
        title="Security Audit"
        subtitle="Full audit trail of all system activity, user access, and data operations"
        icon={ShieldCheck}
        breadcrumbs={[{ label: 'Admin', page: 'DataCenter' }, { label: 'Security Audit' }]}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-[#141d30] border-slate-700/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-500/10">
              <Activity className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider">Total Events</p>
              {isLoading ? <Skeleton className="h-6 w-16 mt-1" /> : (
                <p className="text-2xl font-bold text-white">{totalEvents.toLocaleString()}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#141d30] border-slate-700/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Users className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider">Active Users</p>
              {isLoading ? <Skeleton className="h-6 w-16 mt-1" /> : (
                <p className="text-2xl font-bold text-white">{uniqueUserCount}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#141d30] border-slate-700/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <Download className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider">Data Exports</p>
              {isLoading ? <Skeleton className="h-6 w-16 mt-1" /> : (
                <p className="text-2xl font-bold text-white">{exportCount}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#141d30] border-slate-700/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider">Permission Changes</p>
              {isLoading ? <Skeleton className="h-6 w-16 mt-1" /> : (
                <p className="text-2xl font-bold text-white">{permissionChangeCount}</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-[#141d30] border-slate-700/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-slate-200 flex items-center gap-2 text-base">
            <Filter className="w-4 h-4 text-cyan-400" />
            Filter Events
            {hasActiveFilters && (
              <Badge variant="outline" className="ml-2 bg-cyan-500/10 text-cyan-400 border-cyan-500/30 text-xs">
                Filtered
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[180px]">
              <label className="text-xs text-slate-500 mb-1 block">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                  placeholder="User, action, or details…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9 bg-slate-800/60 border-slate-700 text-slate-200 placeholder:text-slate-600"
                />
              </div>
            </div>

            <div className="min-w-[160px]">
              <label className="text-xs text-slate-500 mb-1 block">Event Type</label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="bg-slate-800/60 border-slate-700 text-slate-200">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {uniqueTypes.map(t => (
                    <SelectItem key={t} value={t}>{getEventConfig(t).label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-[200px]">
              <label className="text-xs text-slate-500 mb-1 block">User</label>
              <Select value={filterUser} onValueChange={setFilterUser}>
                <SelectTrigger className="bg-slate-800/60 border-slate-700 text-slate-200">
                  <SelectValue placeholder="All users" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All users</SelectItem>
                  {uniqueUsers.map(u => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="text-slate-400 hover:text-white hover:bg-slate-800 mt-4"
              >
                Clear filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Event Table */}
      <Card className="bg-[#141d30] border-slate-700/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-slate-200 flex items-center justify-between">
            <span>Audit Events</span>
            {!isLoading && (
              <span className="text-sm font-normal text-slate-500">
                {filtered.length} of {totalEvents} events
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-700/50 hover:bg-transparent">
                  <TableHead className="text-slate-400 font-medium">Type</TableHead>
                  <TableHead className="text-slate-400 font-medium">User</TableHead>
                  <TableHead className="text-slate-400 font-medium">Action</TableHead>
                  <TableHead className="text-slate-400 font-medium">Details</TableHead>
                  <TableHead className="text-slate-400 font-medium">Timestamp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array(8).fill(0).map((_, i) => (
                    <TableRow key={i} className="border-slate-700/30">
                      <TableCell><Skeleton className="h-6 w-28" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-36" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-44" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-36" /></TableCell>
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-slate-500">
                      {hasActiveFilters ? 'No events match your filters.' : 'No audit events recorded yet.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map(event => {
                    const { color, Icon } = getEventConfig(event.event_type);
                    return (
                      <TableRow key={event.id} className="border-slate-700/30 hover:bg-slate-800/30 transition-colors">
                        <TableCell>
                          <Badge variant="outline" className={`${color} flex items-center gap-1 w-fit`}>
                            <Icon className="w-3 h-3" />
                            {(event.event_type || 'other').replace(/_/g, ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-slate-300 font-mono">{event.user_email || '—'}</TableCell>
                        <TableCell className="text-sm font-medium text-slate-200">
                          {event.details?.action || '—'}
                        </TableCell>
                        <TableCell className="text-sm text-slate-400 max-w-[280px] truncate">
                          {event.details?.row_count != null && (
                            <span className="text-cyan-400 font-semibold mr-1">
                              {event.details.row_count} rows
                            </span>
                          )}
                          {event.details?.message && (
                            <span>{event.details.row_count != null ? '• ' : ''}{event.details.message}</span>
                          )}
                          {!event.details?.row_count && !event.details?.message && '—'}
                        </TableCell>
                        <TableCell className="text-sm text-slate-500 whitespace-nowrap">
                          {formatDateTimeET(event.created_date)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

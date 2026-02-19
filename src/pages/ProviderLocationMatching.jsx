import React, { useState, useMemo, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Sparkles, Search, Loader2, CheckCircle, XCircle, Clock } from 'lucide-react';
import MatchCard from '../components/matching/MatchCard';
import BulkActionsBar from '../components/matching/BulkActionsBar';
import FeedbackStatsCard from '../components/matching/FeedbackStatsCard';

export default function ProviderLocationMatching() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('confidence');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const queryClient = useQueryClient();

  const { data: matches = [], isLoading } = useQuery({
    queryKey: ['providerLocationMatches'],
    queryFn: () => base44.entities.ProviderLocationMatch.list('-created_date', 200),
  });

  const runMatchingMutation = useMutation({
    mutationFn: () => base44.functions.invoke('matchProvidersToLocations', {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providerLocationMatches'] });
    },
  });

  const handleUpdateStatus = async (id, status, notes) => {
    const updateData = { status };
    if (notes !== undefined) updateData.override_notes = notes;
    await base44.entities.ProviderLocationMatch.update(id, updateData);
    queryClient.invalidateQueries({ queryKey: ['providerLocationMatches'] });
  };

  const handleToggleSelect = useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedIds(new Set(filtered.map(m => m.id)));
  }, []);

  const handleBulkAction = async (status) => {
    const ids = [...selectedIds];
    await Promise.all(ids.map(id =>
      base44.entities.ProviderLocationMatch.update(id, { status })
    ));
    setSelectedIds(new Set());
    queryClient.invalidateQueries({ queryKey: ['providerLocationMatches'] });
  };

  const filtered = useMemo(() => {
    let result = matches;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(m =>
        (m.provider_name || '').toLowerCase().includes(q) ||
        (m.npi || '').includes(q) ||
        (m.location_display || '').toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'all') {
      result = result.filter(m => m.status === statusFilter);
    }
    if (sortBy === 'confidence') {
      result = [...result].sort((a, b) => (b.confidence_score || 0) - (a.confidence_score || 0));
    } else if (sortBy === 'newest') {
      result = [...result].sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
    }
    return result;
  }, [matches, search, statusFilter, sortBy]);

  const stats = useMemo(() => ({
    total: matches.length,
    suggested: matches.filter(m => m.status === 'suggested').length,
    approved: matches.filter(m => m.status === 'approved').length,
    rejected: matches.filter(m => m.status === 'rejected').length,
    override: matches.filter(m => m.status === 'override').length,
    avgConfidence: matches.length ? Math.round(matches.reduce((sum, m) => sum + (m.confidence_score || 0), 0) / matches.length) : 0,
  }), [matches]);

  const statCards = [
    { label: 'Total Matches', value: stats.total, icon: Sparkles, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Pending Review', value: stats.suggested, icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-50' },
    { label: 'Approved', value: stats.approved, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Rejected', value: stats.rejected, icon: XCircle, color: 'text-red-600', bg: 'bg-red-50' },
  ];

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Provider-Location Matching</h1>
          <p className="text-gray-600 mt-1">AI-powered matching with feedback learning &amp; bulk controls</p>
        </div>
        <Button
          onClick={() => runMatchingMutation.mutate()}
          disabled={runMatchingMutation.isPending}
          className="bg-blue-600 hover:bg-blue-700"
        >
          {runMatchingMutation.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4 mr-2" />
          )}
          {runMatchingMutation.isPending ? 'Matching...' : 'Run AI Matching'}
        </Button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {statCards.map(s => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="bg-gray-100">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`p-2 rounded-lg ${s.bg}`}>
                  <Icon className={`w-5 h-5 ${s.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{s.value}</p>
                  <p className="text-xs text-gray-500">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Feedback Learning Stats */}
      <FeedbackStatsCard matches={matches} />

      {/* Avg Confidence */}
      {matches.length > 0 && (
        <Card className="mb-6 bg-gray-100">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600">Average Confidence Score</span>
              <span className={`text-2xl font-bold ${stats.avgConfidence >= 75 ? 'text-green-600' : stats.avgConfidence >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                {stats.avgConfidence}%
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="bg-blue-100 text-blue-700">{stats.override} overrides</Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card className="mb-6 bg-gray-100">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search providers or locations..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="suggested">Suggested</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="override">Override</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="confidence">Highest Confidence</SelectItem>
                <SelectItem value="newest">Newest First</SelectItem>
              </SelectContent>
            </Select>
            {filtered.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (selectedIds.size === filtered.length) {
                    setSelectedIds(new Set());
                  } else {
                    setSelectedIds(new Set(filtered.map(m => m.id)));
                  }
                }}
              >
                {selectedIds.size === filtered.length ? 'Deselect All' : `Select All (${filtered.length})`}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Bulk Actions Bar */}
      <BulkActionsBar
        selectedCount={selectedIds.size}
        onBulkAction={handleBulkAction}
        onClearSelection={() => setSelectedIds(new Set())}
      />

      {/* Match Results */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="bg-gray-100">
          <CardContent className="py-16 text-center">
            <Sparkles className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No matches found</p>
            <p className="text-sm text-gray-400 mt-1">Click "Run AI Matching" to generate provider-location suggestions</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(match => (
            <MatchCard
              key={match.id}
              match={match}
              onUpdateStatus={handleUpdateStatus}
              selected={selectedIds.has(match.id)}
              onToggleSelect={handleToggleSelect}
            />
          ))}
          {filtered.length < matches.length && (
            <p className="text-xs text-gray-400 text-center pt-2">
              Showing {filtered.length} of {matches.length} matches
            </p>
          )}
        </div>
      )}
    </div>
  );
}
import React, { useState, useMemo, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { invokeOrThrow } from '@/api/functionResult';
import { toast } from 'sonner';
import { US_STATES } from '@/lib/usStates';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Sparkles, Search, Loader2, CheckCircle, XCircle, Clock, Building2 } from 'lucide-react';
import MatchCard from '../components/matching/MatchCard';
import BulkActionsBar from '../components/matching/BulkActionsBar';
import FeedbackStatsCard from '../components/matching/FeedbackStatsCard';

const FACILITY_TYPES = [
  { key: 'hospital', label: 'Hospitals' },
  { key: 'snf', label: 'Skilled nursing' },
  { key: 'home_health', label: 'Home health' },
  { key: 'hospice', label: 'Hospice' },
  { key: 'irf', label: 'Inpatient rehab' },
  { key: 'ltch', label: 'Long-term care' },
  { key: 'community_health', label: 'Community health' },
];

// A matching run suggests at most 1,500 pairs (3 for each of 500 providers),
// so the page loads enough rows to show a whole run.
const MATCH_LIMIT = 2000;

export default function ProviderLocationMatching() {
  const [matchState, setMatchState] = useState('');
  const [facilityTypes, setFacilityTypes] = useState(['hospital', 'snf', 'home_health', 'hospice']);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('confidence');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const queryClient = useQueryClient();

  const { data: matches = [], isLoading } = useQuery({
    queryKey: ['providerLocationMatches'],
    queryFn: () => base44.entities.ProviderLocationMatch.list('-created_date', MATCH_LIMIT),
  });

  const runMatchingMutation = useMutation({
    // Failures (including "not available yet") surface via the global mutation toast.
    mutationFn: () => invokeOrThrow('matchProvidersToLocations', { state: matchState, facility_types: facilityTypes }),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['providerLocationMatches'] });
      toast.success(
        `Checked ${r.providers_checked.toLocaleString()} providers in ${r.state} against ${r.facilities_considered.toLocaleString()} facilities: `
        + `${r.suggestions_created.toLocaleString()} suggestions for ${r.matched.toLocaleString()} providers.`
        + (r.capped ? ' (Capped at 500 providers per run.)' : ''),
      );
    },
  });

  const toggleFacilityType = (key) => {
    setFacilityTypes(prev => (prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]));
  };

  const handleUpdateStatus = async (id, status, notes) => {
    try {
      const updateData = { status };
      if (notes !== undefined) updateData.override_notes = notes;
      await base44.entities.ProviderLocationMatch.update(id, updateData);
      queryClient.invalidateQueries({ queryKey: ['providerLocationMatches'] });
    } catch (err) {
      toast.error(`Unable to update the match: ${err.message}`);
    }
  };

  const handleToggleSelect = useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleBulkAction = async (status) => {
    const ids = [...selectedIds];
    try {
      await Promise.all(ids.map(id =>
        base44.entities.ProviderLocationMatch.update(id, { status })
      ));
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['providerLocationMatches'] });
    } catch (err) {
      toast.error(`Bulk update failed: ${err.message}`);
      queryClient.invalidateQueries({ queryKey: ['providerLocationMatches'] });
    }
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
    { label: 'Total Matches', value: stats.total, icon: Sparkles, color: 'text-blue-400', bg: 'bg-blue-900/15' },
    { label: 'Pending Review', value: stats.suggested, icon: Clock, color: 'text-yellow-400', bg: 'bg-yellow-900/15' },
    { label: 'Approved', value: stats.approved, icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-900/15' },
    { label: 'Rejected', value: stats.rejected, icon: XCircle, color: 'text-red-400', bg: 'bg-red-900/15' },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Provider-Facility Matching</h1>
          <p className="text-slate-400 mt-1">
            Suggests which Medicare facilities each provider likely works with, from address, location, specialty and referral ties. Review each suggestion.
          </p>
        </div>
      </div>

      <Card className="bg-slate-800/40 mb-6">
        <CardContent className="p-4 flex flex-col lg:flex-row lg:items-end gap-4">
          <div className="space-y-1.5">
            <label htmlFor="match-state" className="text-xs font-medium text-slate-400">State</label>
            <Select value={matchState} onValueChange={setMatchState}>
              <SelectTrigger id="match-state" className="w-32" aria-label="State to match in">
                <SelectValue placeholder="Choose…" />
              </SelectTrigger>
              <SelectContent>
                {US_STATES.map(st => <SelectItem key={st} value={st}>{st}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <fieldset className="space-y-1.5 flex-1">
            <legend className="text-xs font-medium text-slate-400 mb-1.5">Facility types</legend>
            <div className="flex flex-wrap gap-2">
              {FACILITY_TYPES.map(t => {
                const on = facilityTypes.includes(t.key);
                return (
                  <button
                    key={t.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleFacilityType(t.key)}
                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${on ? 'border-blue-500/50 bg-blue-900/30 text-blue-300' : 'border-slate-600 text-slate-400 hover:border-slate-500'}`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <Button
            onClick={() => runMatchingMutation.mutate()}
            disabled={runMatchingMutation.isPending || !matchState || facilityTypes.length === 0}
            className="text-white bg-blue-600 hover:bg-blue-700 shrink-0"
          >
            {runMatchingMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Building2 className="w-4 h-4 mr-2" />}
            {runMatchingMutation.isPending ? 'Matching…' : 'Find matches'}
          </Button>
        </CardContent>
      </Card>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {statCards.map(s => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="bg-slate-800/40">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`p-2 rounded-lg ${s.bg}`}>
                  <Icon className={`w-5 h-5 ${s.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{s.value}</p>
                  <p className="text-xs text-slate-400">{s.label}</p>
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
        <Card className="mb-6 bg-slate-800/40">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-400">Average Confidence Score</span>
              <span className={`text-2xl font-bold ${stats.avgConfidence >= 75 ? 'text-green-400' : stats.avgConfidence >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                {stats.avgConfidence}%
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="bg-blue-900/20 text-blue-400">{stats.override} overrides</Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card className="mb-6 bg-slate-800/40">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
              <Input
                placeholder="Search providers or locations..."
                aria-label="Search providers or locations"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger aria-label="Filter by status" className="w-40">
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
              <SelectTrigger aria-label="Sort by" className="w-40">
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
        <Card className="bg-slate-800/40">
          <CardContent className="py-16 text-center">
            <Sparkles className="w-10 h-10 text-slate-400 mx-auto mb-3" />
            <p className="text-slate-400 font-medium">No matches found</p>
            <p className="text-sm text-slate-400 mt-1">Choose a state and click &quot;Find matches&quot; to get suggestions.</p>
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
            <p className="text-xs text-slate-400 text-center pt-2">
              Showing {filtered.length} of {matches.length} matches
            </p>
          )}
          {matches.length >= MATCH_LIMIT && (
            <p className="text-xs text-slate-400 text-center">
              Only the newest {MATCH_LIMIT.toLocaleString()} matches are loaded, and the totals above count those.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
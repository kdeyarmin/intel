import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Bot, Mail, AlertTriangle, CheckCircle2, Download, ShieldCheck, Search, Send, Sparkles, Users } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import EmailBotControls from '../components/emailBot/EmailBotControls';
import EmailBotResults from '../components/emailBot/EmailBotResults';
import EmailValidationBadge from '../components/emailBot/EmailValidationBadge';
import EmailQualityDetails from '../components/emailBot/EmailQualityDetails';
import EmailVerificationPanel from '../components/emailBot/EmailVerificationPanel';
import EmailResultFilters from '../components/emailBot/EmailResultFilters';
import EnrichedProviderCard from '../components/emailBot/EnrichedProviderCard';
import QuickCampaignLauncher from '../components/emailBot/QuickCampaignLauncher';
import PageHeader from '../components/shared/PageHeader';

export default function EmailSearchBot() {
  const [batchSize, setBatchSize] = useState(5);
  const [skipSearched, setSkipSearched] = useState(true);
  const [singleNpi, setSingleNpi] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [isRunningAll, setIsRunningAll] = useState(false);
  const [stopRequested, setStopRequested] = useState(false);
  const [lastResults, setLastResults] = useState(null);
  const [allRunProgress, setAllRunProgress] = useState(null);
  const [activeTab, setActiveTab] = useState('search');
  const [filters, setFilters] = useState({ validation: 'all', confidence: 'all', source: 'all' });
  const [selectedNpis, setSelectedNpis] = useState(new Set());
  const [showCampaignLauncher, setShowCampaignLauncher] = useState(false);
  const queryClient = useQueryClient();
  const stopRef = React.useRef(false);

  const { data: activeTask } = useQuery({
    queryKey: ['emailSearchTask'],
    queryFn: async () => {
      const tasks = await base44.entities.BackgroundTask.list('-created_date', 1);
      const active = tasks.find(t => t.task_type === 'email_search' && t.status === 'processing');
      return active || tasks.find(t => t.task_type === 'email_search');
    },
    refetchInterval: 3000
  });

  const { data: dashStats } = useQuery({
    queryKey: ['emailBotDashStats'],
    queryFn: async () => {
      const res = await base44.functions.invoke('getDashboardStats');
      return res.data;
    },
    staleTime: 120000,
    retry: 1,
  });

  const { data: providers = [], isLoading } = useQuery({
    queryKey: ['emailBotProviders'],
    queryFn: () => base44.entities.Provider.list('-created_date', 500),
    staleTime: 60000,
  });

  const { data: allLocations = [] } = useQuery({
    queryKey: ['emailBotLocations'],
    queryFn: () => base44.entities.ProviderLocation.list('-created_date', 500),
    staleTime: 120000,
  });

  const { data: allTaxonomies = [] } = useQuery({
    queryKey: ['emailBotTaxonomies'],
    queryFn: () => base44.entities.ProviderTaxonomy.list('-created_date', 500),
    staleTime: 120000,
  });

  const stats = useMemo(() => {
    const total = dashStats?.totalProviders || providers.length;
    const es = dashStats?.emailStats;
    if (es) {
      const searched = es.searched || 0;
      const remaining = Math.max(0, total - searched);
      return {
        total,
        withEmail: es.withEmail || 0,
        searched,
        remaining,
        validated: (es.valid || 0) + (es.risky || 0) + (es.invalid || 0),
        valid: es.valid || 0,
        risky: es.risky || 0,
        invalid: es.invalid || 0,
        isEstimated: es.isEstimated || false,
      };
    }
    const withEmail = providers.filter(p => p.email).length;
    const searched = providers.filter(p => p.email_searched_at).length;
    const remaining = Math.max(0, total - searched);
    return {
      total,
      withEmail,
      searched,
      remaining,
      validated: providers.filter(p => p.email_validation_status && p.email_validation_status !== '').length,
      valid: providers.filter(p => p.email_validation_status === 'valid').length,
      risky: providers.filter(p => p.email_validation_status === 'risky').length,
      invalid: providers.filter(p => p.email_validation_status === 'invalid').length,
      isEstimated: false,
    };
  }, [providers, dashStats]);

  const runSearch = async (mode, npi) => {
    setIsRunning(true);
    setLastResults(null);
    const response = await base44.functions.invoke('emailSearchBot', {
      mode,
      npi: npi || null,
      batch_size: batchSize,
      skip_already_searched: skipSearched,
    });
    const data = response.data;
    setLastResults(data.results || []);
    toast.success(`Searched ${data.searched} providers, found emails for ${data.found}`);
    queryClient.invalidateQueries({ queryKey: ['emailBotProviders'] });
    queryClient.invalidateQueries({ queryKey: ['emailBotDashStats'] });
    setIsRunning(false);
  };

  const runSearchAll = async () => {
    setIsRunningAll(true);
    setIsRunning(true);
    setStopRequested(false);
    
    try {
      await base44.functions.invoke('emailSearchBot', {
        mode: 'start_background',
        batch_size: batchSize,
        skip_already_searched: skipSearched,
        total_items: stats.remaining
      });
      toast.success('Background search started. You can safely navigate away.');
      queryClient.invalidateQueries({ queryKey: ['emailSearchTask'] });
    } catch (e) {
      toast.error('Failed to start background search');
      setIsRunning(false);
      setIsRunningAll(false);
    }
  };

  const handleStopAll = async () => {
    setStopRequested(true);
    if (activeTask?.id) {
      await base44.functions.invoke('emailSearchBot', {
        mode: 'stop_background',
        task_id: activeTask.id
      });
      queryClient.invalidateQueries({ queryKey: ['emailSearchTask'] });
      setIsRunning(false);
      setIsRunningAll(false);
    }
  };

  const isBackgroundRunning = activeTask?.status === 'processing';
  const derivedRunProgress = useMemo(() => {
    if (!activeTask) return allRunProgress;
    return {
      totalSearched: activeTask.processed_items || 0,
      totalFound: activeTask.success_count || 0,
      batchNumber: activeTask.current_batch_number || 0,
      status: activeTask.status === 'cancelled' ? 'stopped' : activeTask.status === 'processing' ? 'running' : 'complete',
      startTime: activeTask.started_at ? new Date(activeTask.started_at).getTime() : Date.now(),
      batchTimes: []
    };
  }, [activeTask, allRunProgress]);

  const downloadFullEmailCSV = () => {
    const withEmail = providers.filter(p => p.email);
    if (withEmail.length === 0) { toast.error('No providers with emails to export'); return; }

    const headers = ['NPI','Name','Credential','Type','Specialty','Email','Confidence','Validation','Source','City','State','ZIP','Phone'];
    const rows = withEmail.map(p => {
      const name = p.entity_type === 'Individual' ? `${p.first_name || ''} ${p.last_name || ''}`.trim() : p.organization_name || '';
      const loc = allLocations.find(l => l.npi === p.npi && l.is_primary) || allLocations.find(l => l.npi === p.npi);
      const tax = allTaxonomies.find(t => t.npi === p.npi && t.primary_flag) || allTaxonomies.find(t => t.npi === p.npi);
      return [p.npi, name, p.credential||'', p.entity_type||'', tax?.taxonomy_description||'', p.email, p.email_confidence||'', p.email_validation_status||'', p.email_source||'', loc?.city||'', loc?.state||'', loc?.zip||'', loc?.phone||''];
    });

    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${(c||'').replace(/"/g,'""')}"`).join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `provider_emails_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    a.remove();
    toast.success(`Exported ${withEmail.length} provider emails`);
  };

  const recentFinds = useMemo(() => {
    return providers
      .filter(p => p.email && p.email_searched_at)
      .sort((a, b) => new Date(b.email_searched_at) - new Date(a.email_searched_at))
      .slice(0, 10);
  }, [providers]);

  const filterCounts = useMemo(() => {
    const withEmail = providers.filter(p => p.email);
    const sources = [...new Set(withEmail.map(p => p.email_source).filter(Boolean))];
    return {
      valid: withEmail.filter(p => p.email_validation_status === 'valid').length,
      risky: withEmail.filter(p => p.email_validation_status === 'risky').length,
      invalid: withEmail.filter(p => p.email_validation_status === 'invalid').length,
      unknown: withEmail.filter(p => !p.email_validation_status || p.email_validation_status === '').length,
      highConf: withEmail.filter(p => p.email_confidence === 'high').length,
      medConf: withEmail.filter(p => p.email_confidence === 'medium').length,
      lowConf: withEmail.filter(p => p.email_confidence === 'low').length,
      sources,
    };
  }, [providers]);

  const filteredProviders = useMemo(() => {
    return providers.filter(p => {
      if (!p.email) return false;
      if (filters.validation !== 'all') {
        if (filters.validation === 'unknown') {
          if (p.email_validation_status && p.email_validation_status !== '') return false;
        } else {
          if (p.email_validation_status !== filters.validation) return false;
        }
      }
      if (filters.confidence !== 'all' && p.email_confidence !== filters.confidence) return false;
      if (filters.source !== 'all' && p.email_source !== filters.source) return false;
      return true;
    }).sort((a, b) => new Date(b.email_searched_at || 0) - new Date(a.email_searched_at || 0));
  }, [providers, filters]);

  const selectedProviderObjects = useMemo(() => {
    return providers.filter(p => selectedNpis.has(p.npi));
  }, [providers, selectedNpis]);

  const toggleSelectProvider = (npi) => {
    setSelectedNpis(prev => {
      const next = new Set(prev);
      if (next.has(npi)) next.delete(npi); else next.add(npi);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedNpis.size === filteredProviders.length) {
      setSelectedNpis(new Set());
    } else {
      setSelectedNpis(new Set(filteredProviders.map(p => p.npi)));
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-5">
        <Skeleton className="h-10 w-72" />
        <div className="grid grid-cols-2 gap-5">{[1,2].map(i => <Skeleton key={i} className="h-40" />)}</div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-5">
      <PageHeader
        title="Email Search Bot"
        subtitle="AI-powered email discovery for providers"
        icon={Bot}
        breadcrumbs={[{ label: 'Sales & Outreach', page: 'ProviderOutreach' }, { label: 'Email Bot' }]}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full grid grid-cols-4 h-10 bg-slate-800/50 p-1 mb-5">
          <TabsTrigger value="search" className="gap-1.5 h-8 text-xs data-[state=active]:bg-slate-700 data-[state=active]:text-cyan-400">
            <Search className="w-3.5 h-3.5" /> Search
          </TabsTrigger>
          <TabsTrigger value="providers" className="gap-1.5 h-8 text-xs data-[state=active]:bg-slate-700 data-[state=active]:text-cyan-400">
            <Users className="w-3.5 h-3.5" /> Providers
            {stats.withEmail > 0 && <Badge className="bg-cyan-500/20 text-cyan-400 text-[9px] ml-1">{stats.withEmail}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="verify" className="gap-1.5 h-8 text-xs data-[state=active]:bg-slate-700 data-[state=active]:text-cyan-400">
            <ShieldCheck className="w-3.5 h-3.5" /> Verify
            {stats.risky + stats.invalid > 0 && (
              <Badge className="bg-amber-500/20 text-amber-400 text-[9px] ml-1">{stats.risky + stats.invalid}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="outreach" className="gap-1.5 h-8 text-xs data-[state=active]:bg-slate-700 data-[state=active]:text-cyan-400">
            <Send className="w-3.5 h-3.5" /> Outreach
          </TabsTrigger>
        </TabsList>

        <TabsContent value="search" className="space-y-5">
          {/* Stats Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
            <Card className="bg-[#141d30] border-slate-700/50">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-white">{stats.total.toLocaleString()}</div>
                <div className="text-xs text-slate-500">Total Providers</div>
              </CardContent>
            </Card>
            <Card className="bg-[#141d30] border-slate-700/50">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-emerald-400">{stats.withEmail.toLocaleString()}{stats.isEstimated ? '~' : ''}</div>
                <div className="text-xs text-emerald-500/80">Have Email</div>
              </CardContent>
            </Card>
            <Card className="bg-[#141d30] border-slate-700/50">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-cyan-400">{stats.searched.toLocaleString()}{stats.isEstimated ? '~' : ''}</div>
                <div className="text-xs text-cyan-500/80">Already Searched</div>
              </CardContent>
            </Card>
            <Card className="bg-[#141d30] border-slate-700/50">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-amber-400">{stats.remaining.toLocaleString()}{stats.isEstimated ? '~' : ''}</div>
                <div className="text-xs text-amber-500/80">Remaining</div>
              </CardContent>
            </Card>
            <Card className="bg-[#141d30] border-cyan-500/30 col-span-2 sm:col-span-1 flex items-center justify-center">
              <CardContent className="p-4 text-center">
                <Button onClick={downloadFullEmailCSV} disabled={stats.withEmail === 0} size="sm" className="bg-cyan-600 hover:bg-cyan-700 gap-2">
                  <Download className="w-3.5 h-3.5" /> Export CSV
                </Button>
                <div className="text-[10px] text-slate-500 mt-1.5">{stats.withEmail.toLocaleString()} ready</div>
              </CardContent>
            </Card>
          </div>

          {stats.isEstimated && (
            <p className="text-[10px] text-slate-500 text-center -mt-2">~ counts are estimated</p>
          )}

          {/* Controls */}
          <EmailBotControls
            batchSize={batchSize}
            setBatchSize={setBatchSize}
            skipSearched={skipSearched}
            setSkipSearched={setSkipSearched}
            singleNpi={singleNpi}
            setSingleNpi={setSingleNpi}
            isRunning={isRunning || isBackgroundRunning}
            isRunningAll={isRunningAll || isBackgroundRunning}
            onRunAll={runSearchAll}
            onStopAll={handleStopAll}
            stopRequested={stopRequested}
            onRunSingle={() => runSearch('single', singleNpi.trim())}
            stats={stats}
            allRunProgress={derivedRunProgress}
          />

          {/* Running indicator */}
          {isRunning && !isRunningAll && (
            <Card className="border-cyan-500/20 bg-cyan-500/5">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="animate-pulse"><Bot className="w-5 h-5 text-cyan-400" /></div>
                <div>
                  <p className="text-sm font-medium text-cyan-300">Searching for emails...</p>
                  <p className="text-xs text-cyan-500/70">Each provider requires an AI web search. This may take a moment.</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Results */}
          {lastResults && (
            <div>
              <h2 className="text-base font-semibold text-slate-200 mb-3 flex items-center gap-2">
                <Mail className="w-4 h-4 text-cyan-400" />
                Results
                <Badge className="bg-cyan-500/15 text-cyan-400 border border-cyan-500/20 text-[10px]">{lastResults.length} searched</Badge>
                <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 text-[10px]">
                  {lastResults.filter(r => r.best_email).length} found
                </Badge>
              </h2>
              <EmailBotResults results={lastResults} />
            </div>
          )}

          {/* Recent Finds */}
          {recentFinds.length > 0 && !lastResults && (
            <Card className="bg-[#141d30] border-slate-700/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-slate-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Recently Found Emails
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {recentFinds.map((p, idx) => {
                    const name = p.entity_type === 'Individual'
                      ? `${p.first_name || ''} ${p.last_name || ''}`.trim()
                      : p.organization_name || p.npi;
                    const confColor = {
                      high: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20',
                      medium: 'bg-amber-500/15 text-amber-400 border border-amber-500/20',
                      low: 'bg-red-500/15 text-red-400 border border-red-500/20',
                    }[p.email_confidence] || 'bg-slate-500/15 text-slate-400 border border-slate-500/20';

                    return (
                      <div key={idx} className="flex items-center justify-between p-2.5 bg-slate-800/40 rounded-lg border border-slate-700/30">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-slate-200 truncate">{name}</div>
                          <div className="text-xs text-slate-500">{p.email}</div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {p.email_validation_status && p.email_validation_status !== '' && (
                            <EmailValidationBadge status={p.email_validation_status} reason={p.email_validation_reason} size="sm" />
                          )}
                          <Badge className={`${confColor} text-[10px]`}>{p.email_confidence}</Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Disclaimer */}
          <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
            <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-400/80">
              Email addresses are found via AI web search and may not be 100% accurate.
              Always verify before using for outreach.
            </p>
          </div>
        </TabsContent>

        {/* Providers with enriched data and filters */}
        <TabsContent value="providers" className="space-y-4">
          <EmailResultFilters filters={filters} onFiltersChange={setFilters} counts={filterCounts} />

          {/* Selection actions bar */}
          {selectedNpis.size > 0 && (
            <div className="flex items-center gap-3 p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
              <span className="text-xs text-cyan-300">{selectedNpis.size} selected</span>
              <Button onClick={() => setShowCampaignLauncher(true)} size="sm" className="h-7 text-xs bg-cyan-600 hover:bg-cyan-700 gap-1">
                <Send className="w-3 h-3" /> Email Campaign
              </Button>
              <Button onClick={() => setSelectedNpis(new Set())} variant="ghost" size="sm" className="h-7 text-xs text-slate-400 ml-auto">
                Clear selection
              </Button>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={filteredProviders.length > 0 && selectedNpis.size === filteredProviders.length}
                onChange={toggleSelectAll}
                className="rounded border-slate-600"
              />
              <span className="text-xs text-slate-500">
                {filteredProviders.length} provider{filteredProviders.length !== 1 ? 's' : ''} with email
              </span>
            </div>
            <Button onClick={() => setShowCampaignLauncher(true)} disabled={selectedNpis.size === 0} variant="outline" size="sm" className="h-7 text-xs gap-1 border-slate-700 text-slate-300">
              <Send className="w-3 h-3" /> Send to Selected
            </Button>
          </div>

          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {filteredProviders.slice(0, 50).map((p) => {
              const loc = allLocations.find(l => l.npi === p.npi && l.is_primary) || allLocations.find(l => l.npi === p.npi);
              const tax = allTaxonomies.find(t => t.npi === p.npi && t.primary_flag) || allTaxonomies.find(t => t.npi === p.npi);
              return (
                <div key={p.id} className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={selectedNpis.has(p.npi)}
                    onChange={() => toggleSelectProvider(p.npi)}
                    className="rounded border-slate-600 mt-3.5"
                  />
                  <div className="flex-1">
                    <EnrichedProviderCard
                      provider={p}
                      location={loc}
                      taxonomy={tax}
                      onEnriched={() => queryClient.invalidateQueries({ queryKey: ['emailBotProviders'] })}
                    />
                  </div>
                </div>
              );
            })}
            {filteredProviders.length > 50 && (
              <p className="text-xs text-slate-500 text-center py-2">Showing 50 of {filteredProviders.length} — use filters to narrow results</p>
            )}
            {filteredProviders.length === 0 && (
              <div className="text-center py-8 text-slate-500 text-sm">No providers match current filters</div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="verify" className="space-y-5">
          <EmailVerificationPanel
            providers={providers}
            onRefresh={() => queryClient.invalidateQueries({ queryKey: ['emailBotProviders'] })}
          />
        </TabsContent>

        {/* Outreach tab - quick campaign creation */}
        <TabsContent value="outreach" className="space-y-5">
          <Card className="bg-[#141d30] border-slate-700/50">
            <CardContent className="p-6 text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-full bg-cyan-500/10 flex items-center justify-center">
                <Send className="w-7 h-7 text-cyan-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-200">Email Campaigns</h3>
                <p className="text-sm text-slate-400 mt-1">
                  Select providers from the "Providers" tab and launch personalized email campaigns
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3 max-w-md mx-auto">
                <div className="p-3 bg-slate-800/40 rounded-lg border border-slate-700/30">
                  <div className="text-xl font-bold text-emerald-400">{stats.valid}</div>
                  <div className="text-[10px] text-slate-500">Valid Emails</div>
                </div>
                <div className="p-3 bg-slate-800/40 rounded-lg border border-slate-700/30">
                  <div className="text-xl font-bold text-amber-400">{stats.risky}</div>
                  <div className="text-[10px] text-slate-500">Risky Emails</div>
                </div>
                <div className="p-3 bg-slate-800/40 rounded-lg border border-slate-700/30">
                  <div className="text-xl font-bold text-red-400">{stats.invalid}</div>
                  <div className="text-[10px] text-slate-500">Invalid Emails</div>
                </div>
              </div>
              <div className="flex justify-center gap-3">
                <Button onClick={() => setActiveTab('providers')} className="gap-2 bg-cyan-600 hover:bg-cyan-700">
                  <Users className="w-4 h-4" /> Select Providers
                </Button>
              </div>
              <p className="text-[10px] text-slate-500">
                Tip: Use the Providers tab to filter by validation status, then select providers and click "Email Campaign"
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <QuickCampaignLauncher
        selectedProviders={selectedProviderObjects}
        open={showCampaignLauncher}
        onOpenChange={setShowCampaignLauncher}
      />
    </div>
  );
}
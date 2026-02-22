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
      return {
        total,
        withEmail: es.withEmail || 0,
        searched,
        remaining: total - searched,
        validated: (es.valid || 0) + (es.risky || 0) + (es.invalid || 0),
        valid: es.valid || 0,
        risky: es.risky || 0,
        invalid: es.invalid || 0,
        isEstimated: es.isEstimated || false,
      };
    }
    const withEmail = providers.filter(p => p.email).length;
    const searched = providers.filter(p => p.email_searched_at).length;
    return {
      total,
      withEmail,
      searched,
      remaining: total - searched,
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
    stopRef.current = false;
    setStopRequested(false);
    setLastResults(null);

    let totalSearched = 0;
    let totalFound = 0;
    let allResults = [];
    let batchNumber = 0;
    let hasMore = true;
    let consecutiveErrors = 0;

    const startTime = Date.now();
    const batchTimesArr = [];
    setAllRunProgress({ totalSearched: 0, totalFound: 0, batchNumber: 0, status: 'running', startTime, batchTimes: [] });

    while (hasMore && !stopRef.current) {
      batchNumber++;
      setAllRunProgress(prev => ({ ...prev, batchNumber, status: 'running' }));

      const batchStart = Date.now();
      try {
        const response = await base44.functions.invoke('emailSearchBot', {
          mode: 'batch',
          batch_size: batchSize,
          skip_already_searched: skipSearched,
        });
        const data = response.data;
        consecutiveErrors = 0; // Reset on success

        const batchDuration = (Date.now() - batchStart) / 1000;
        batchTimesArr.push(batchDuration);

        totalSearched += data.searched || 0;
        totalFound += data.found || 0;
        allResults = [...allResults, ...(data.results || [])];
        setAllRunProgress({ totalSearched, totalFound, batchNumber, status: 'running', startTime, batchTimes: [...batchTimesArr] });
        setLastResults(allResults);

        if (!data.has_more || data.searched === 0) {
          hasMore = false;
        }

        queryClient.invalidateQueries({ queryKey: ['emailBotProviders'] });
        queryClient.invalidateQueries({ queryKey: ['emailBotDashStats'] });

        // Brief pause between batches to avoid hammering the API
        if (hasMore && !stopRef.current) {
          await new Promise(r => setTimeout(r, 2000));
        }
      } catch (err) {
        consecutiveErrors++;
        console.error(`Batch ${batchNumber} failed:`, err);
        toast.error(`Batch ${batchNumber} failed: ${err.response?.data?.error || err.message}`);
        
        if (consecutiveErrors >= 3) {
          toast.error('Stopped after 3 consecutive errors.');
          hasMore = false;
        } else {
          // Wait longer after an error before retrying
          await new Promise(r => setTimeout(r, 5000));
        }
      }
    }

    setAllRunProgress(prev => ({ ...prev, status: stopRef.current ? 'stopped' : 'complete' }));
    setIsRunning(false);
    setIsRunningAll(false);
    toast.success(`Done! Searched ${totalSearched} providers, found ${totalFound} emails.`);
    queryClient.invalidateQueries({ queryKey: ['emailBotProviders'] });
    queryClient.invalidateQueries({ queryKey: ['emailBotDashStats'] });
  };

  const handleStopAll = () => {
    stopRef.current = true;
    setStopRequested(true);
  };

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
        <TabsList className="w-full grid grid-cols-2 h-10 bg-slate-800/50 p-1 mb-5">
          <TabsTrigger value="search" className="gap-2 h-8 data-[state=active]:bg-slate-700 data-[state=active]:text-cyan-400">
            <Search className="w-3.5 h-3.5" /> Email Search
          </TabsTrigger>
          <TabsTrigger value="verify" className="gap-2 h-8 data-[state=active]:bg-slate-700 data-[state=active]:text-cyan-400">
            <ShieldCheck className="w-3.5 h-3.5" /> Email Verification
            {stats.risky + stats.invalid > 0 && (
              <Badge className="bg-amber-500/20 text-amber-400 text-[9px] ml-1">{stats.risky + stats.invalid}</Badge>
            )}
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
            <p className="text-[10px] text-slate-600 text-center -mt-2">~ counts are estimated</p>
          )}

          {/* Controls */}
          <EmailBotControls
            batchSize={batchSize}
            setBatchSize={setBatchSize}
            skipSearched={skipSearched}
            setSkipSearched={setSkipSearched}
            singleNpi={singleNpi}
            setSingleNpi={setSingleNpi}
            isRunning={isRunning}
            isRunningAll={isRunningAll}
            onRunAll={runSearchAll}
            onStopAll={handleStopAll}
            stopRequested={stopRequested}
            onRunSingle={() => runSearch('single', singleNpi.trim())}
            stats={stats}
            allRunProgress={allRunProgress}
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

        <TabsContent value="verify" className="space-y-5">
          <EmailVerificationPanel
            providers={providers}
            onRefresh={() => queryClient.invalidateQueries({ queryKey: ['emailBotProviders'] })}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
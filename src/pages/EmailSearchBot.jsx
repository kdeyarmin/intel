import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Bot, Mail, AlertTriangle, CheckCircle2, Download, ShieldCheck, Sparkles, Search } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import EmailBotControls from '../components/emailBot/EmailBotControls';
import EmailBotResults from '../components/emailBot/EmailBotResults';
import EmailValidationBadge from '../components/emailBot/EmailValidationBadge';
import EmailQualityDetails from '../components/emailBot/EmailQualityDetails';
import EmailDeduplicationPanel from '../components/emailBot/EmailDeduplicationPanel';
import OutreachEmailPreview from '../components/emailBot/OutreachEmailPreview';
import EmailVerificationPanel from '../components/emailBot/EmailVerificationPanel';

export default function EmailSearchBot() {
  const [batchSize, setBatchSize] = useState(10);
  const [skipSearched, setSkipSearched] = useState(true);
  const [singleNpi, setSingleNpi] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [isRunningAll, setIsRunningAll] = useState(false);
  const [stopRequested, setStopRequested] = useState(false);
  const [lastResults, setLastResults] = useState(null);
  const [allRunProgress, setAllRunProgress] = useState(null);
  const [emailAnalysis, setEmailAnalysis] = useState({});
  const [analyzingEmails, setAnalyzingEmails] = useState(false);
  const [deduplicationResults, setDeduplicationResults] = useState({});
  const [outreachPreview, setOutreachPreview] = useState(null);
  const [selectedProviderId, setSelectedProviderId] = useState(null);
  const [activeTab, setActiveTab] = useState('search');
  const queryClient = useQueryClient();
  const stopRef = React.useRef(false);

  // Use backend to get accurate total counts across ALL providers
  const { data: dashStats, isLoading: isLoadingStats } = useQuery({
    queryKey: ['emailBotDashStats'],
    queryFn: async () => {
      const res = await base44.functions.invoke('getDashboardStats');
      return res.data;
    },
    staleTime: 60000,
  });

  // Local sample for recent finds, export, and display purposes
  const { data: providers = [], isLoading: isLoadingProviders } = useQuery({
    queryKey: ['emailBotProviders'],
    queryFn: () => base44.entities.Provider.list('-created_date', 500),
    staleTime: 60000,
  });

  const isLoading = isLoadingStats || isLoadingProviders;

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
    // Fallback to local sample
    const withEmail = providers.filter(p => p.email).length;
    const searched = providers.filter(p => p.email_searched_at).length;
    const remaining = total - searched;
    const validated = providers.filter(p => p.email_validation_status && p.email_validation_status !== '').length;
    const valid = providers.filter(p => p.email_validation_status === 'valid').length;
    const risky = providers.filter(p => p.email_validation_status === 'risky').length;
    const invalid = providers.filter(p => p.email_validation_status === 'invalid').length;
    return { total, withEmail, searched, remaining, validated, valid, risky, invalid, isEstimated: false };
  }, [providers, dashStats]);

  const triggerEmailDeduplication = async (providerId) => {
    try {
      const response = await base44.functions.invoke('deduplicateProviderEmails', {
        provider_id: providerId
      });
      
      if (response.data.success) {
        setDeduplicationResults(prev => ({
          ...prev,
          [providerId]: response.data.email_groups
        }));
        return response.data;
      }
    } catch (error) {
      console.error('Deduplication error:', error);
    }
  };

  const generateOutreachEmail = async (providerId, email, outreachType) => {
    try {
      setSelectedProviderId(providerId);
      const response = await base44.functions.invoke('generatePersonalizedOutreach', {
        provider_id: providerId,
        email,
        outreach_type: outreachType
      });
      
      if (response.data.success) {
        setOutreachPreview(response.data);
        return response.data;
      }
    } catch (error) {
      console.error('Outreach generation error:', error);
    }
  };

  const analyzeEmails = async (emails) => {
    if (!emails || emails.length === 0) return;
    setAnalyzingEmails(true);
    try {
      const response = await base44.functions.invoke('analyzeEmailQuality', {
        emails: emails.filter(Boolean)
      });
      const analysisMap = {};
      (response.data.results || []).forEach(result => {
        analysisMap[result.email] = result;
      });
      setEmailAnalysis(analysisMap);
    } catch (err) {
      console.warn('Email analysis failed:', err.message);
    } finally {
      setAnalyzingEmails(false);
    }
  };

  const runSearch = async (mode, npi) => {
    setIsRunning(true);
    setLastResults(null);
    try {
      const response = await base44.functions.invoke('emailSearchBot', {
        mode,
        npi: npi || null,
        batch_size: batchSize,
        skip_already_searched: skipSearched,
      });
      const data = response.data;
      setLastResults(data.results || []);
      
      // Analyze emails found
      const foundEmails = (data.results || [])
        .filter(r => r.best_email)
        .map(r => r.best_email);
      await analyzeEmails(foundEmails);
      
      toast.success(`Searched ${data.searched} providers, found emails for ${data.found}`);
      queryClient.invalidateQueries({ queryKey: ['emailBotProviders'] });
    } catch (err) {
      toast.error('Search failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setIsRunning(false);
    }
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

    setAllRunProgress({ totalSearched: 0, totalFound: 0, batchNumber: 0, status: 'running' });

    while (hasMore && !stopRef.current) {
      batchNumber++;
      setAllRunProgress(prev => ({ ...prev, batchNumber, status: 'running' }));

      try {
        const response = await base44.functions.invoke('emailSearchBot', {
          mode: 'batch',
          batch_size: batchSize,
          skip_already_searched: skipSearched,
        });
        const data = response.data;
        
        totalSearched += data.searched || 0;
        totalFound += data.found || 0;
        allResults = [...allResults, ...(data.results || [])];
        setAllRunProgress({ totalSearched, totalFound, batchNumber, status: 'running' });
        setLastResults(allResults);

        // Stop only when backend confirms no more providers remain
        if (!data.has_more || data.searched === 0) {
          hasMore = false;
        }

        // Refresh stats
        queryClient.invalidateQueries({ queryKey: ['emailBotProviders'] });
      } catch (err) {
        console.error('Batch failed:', err);
        toast.error(`Batch ${batchNumber} failed: ${err.response?.data?.error || err.message}. Continuing...`);
        // If a batch fails, we stop to avoid infinite loops on persistent errors
        hasMore = false;
      }
    }

    setAllRunProgress(prev => ({ ...prev, status: stopRef.current ? 'stopped' : 'complete' }));
    setIsRunning(false);
    setIsRunningAll(false);
    toast.success(`Done! Searched ${totalSearched} providers across ${batchNumber} batches, found ${totalFound} emails.`);
    queryClient.invalidateQueries({ queryKey: ['emailBotProviders'] });
  };

  const handleStopAll = () => {
    stopRef.current = true;
    setStopRequested(true);
  };

  // Full export CSV
  const downloadFullEmailCSV = () => {
    const withEmail = providers.filter(p => p.email);
    if (withEmail.length === 0) { toast.error('No providers with emails to export'); return; }

    const headers = ['NPI','Name','Credential','Type','Specialty','Email','Email Confidence','Validation','Validation Reason','Email Source','City','State','ZIP','Phone'];
    const rows = withEmail.map(p => {
      const name = p.entity_type === 'Individual' ? `${p.first_name || ''} ${p.last_name || ''}`.trim() : p.organization_name || '';
      const loc = allLocations.find(l => l.npi === p.npi && l.is_primary) || allLocations.find(l => l.npi === p.npi);
      const tax = allTaxonomies.find(t => t.npi === p.npi && t.primary_flag) || allTaxonomies.find(t => t.npi === p.npi);
      return [p.npi, name, p.credential||'', p.entity_type||'', tax?.taxonomy_description||'', p.email, p.email_confidence||'', p.email_validation_status||'', p.email_validation_reason||'', p.email_source||'', loc?.city||'', loc?.state||'', loc?.zip||'', loc?.phone||''];
    });

    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${(c||'').replace(/"/g,'""')}"`).join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `all_provider_emails_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    a.remove();
    toast.success(`Exported ${withEmail.length} provider emails to CSV`);
  };

  // Recent email finds from provider data
  const recentFinds = useMemo(() => {
    return providers
      .filter(p => p.email && p.email_searched_at)
      .sort((a, b) => new Date(b.email_searched_at) - new Date(a.email_searched_at))
      .slice(0, 10);
  }, [providers]);

  if (isLoading) {
    return (
      <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-5">
        <Skeleton className="h-10 w-72" />
        <div className="grid grid-cols-2 gap-5">{[1, 2].map(i => <Skeleton key={i} className="h-64" />)}</div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
            <Bot className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Email Search Bot</h1>
            <p className="text-sm text-slate-500">
              AI-powered search to find email addresses for providers and practices
            </p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full justify-start h-10 bg-slate-800/50 p-1 mb-5">
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

      {/* Stats Overview + Export */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
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
            <Button onClick={downloadFullEmailCSV} disabled={stats.withEmail === 0} className="bg-cyan-600 hover:bg-cyan-700 gap-2">
              <Download className="w-4 h-4" /> Export Emails CSV
            </Button>
            <div className="text-[10px] text-slate-500 mt-1.5">{stats.withEmail.toLocaleString()} ready</div>
          </CardContent>
        </Card>
      </div>

      {stats.isEstimated && (
        <p className="text-[10px] text-slate-600 text-center -mt-2">~ counts are estimated from a sample — actual numbers may differ slightly</p>
      )}

      {/* Validation Stats */}
      {stats.validated > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <Card className="bg-[#141d30] border-emerald-500/20">
            <CardContent className="p-3 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span className="text-lg font-bold text-emerald-400">{stats.valid.toLocaleString()}{stats.isEstimated ? '~' : ''}</span>
              </div>
              <div className="text-[10px] text-emerald-500/80">Valid Emails</div>
            </CardContent>
          </Card>
          <Card className="bg-[#141d30] border-amber-500/20">
            <CardContent className="p-3 text-center">
              <div className="text-lg font-bold text-amber-400">{stats.risky.toLocaleString()}{stats.isEstimated ? '~' : ''}</div>
              <div className="text-[10px] text-amber-500/80">Risky Emails</div>
            </CardContent>
          </Card>
          <Card className="bg-[#141d30] border-red-500/20">
            <CardContent className="p-3 text-center">
              <div className="text-lg font-bold text-red-400">{stats.invalid.toLocaleString()}{stats.isEstimated ? '~' : ''}</div>
              <div className="text-[10px] text-red-500/80">Invalid Emails</div>
            </CardContent>
          </Card>
        </div>
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
        onRunBatch={() => runSearch('batch')}
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
            <div className="animate-pulse">
              <Bot className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-cyan-300">Bot is searching for email addresses...</p>
              <p className="text-xs text-cyan-500/70">This may take a few minutes depending on batch size. Each provider requires a web search.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Latest Run Results */}
      {lastResults && (
        <div>
          <h2 className="text-base font-semibold text-slate-200 mb-3 flex items-center gap-2">
            <Mail className="w-4 h-4 text-cyan-400" />
            Latest Run Results
            <Badge className="bg-cyan-500/15 text-cyan-400 border border-cyan-500/20 text-[10px]">{lastResults.length} searched</Badge>
            <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 text-[10px]">
              {lastResults.filter(r => r.best_email).length} found
            </Badge>
          </h2>
          <EmailBotResults results={lastResults} />
        </div>
      )}

      {/* Recent Finds */}
      {recentFinds.length > 0 && (
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
                  high: 'bg-green-100 text-green-800',
                  medium: 'bg-yellow-100 text-yellow-800',
                  low: 'bg-red-100 text-red-800',
                }[p.email_confidence] || 'bg-slate-100 text-slate-600';

                return (
                  <div key={idx} className="flex flex-col gap-2">
                    <div className="flex items-center justify-between p-2.5 bg-slate-800/40 rounded-lg border border-slate-700/30">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-slate-200 truncate">{name}</div>
                        <div className="text-xs text-slate-500 mb-1.5">{p.email}</div>
                        {p.email_quality_confidence && (
                          <EmailQualityDetails 
                            analysis={{
                              score: p.email_quality_score,
                              confidence: p.email_quality_confidence,
                              reasons: p.email_quality_reasons,
                              riskFlags: p.email_quality_risk_flags,
                              analysis: p.email_quality_analysis
                            }} 
                            email={p.email}
                            compact={true}
                          />
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {p.email_validation_status && p.email_validation_status !== '' && (
                          <EmailValidationBadge
                            status={p.email_validation_status}
                            reason={p.email_validation_reason}
                            size="sm"
                          />
                        )}
                        <Badge className={`${confColor} text-[10px]`}>{p.email_confidence}</Badge>
                      </div>
                    </div>
                    {emailAnalysis[p.email] && (
                      <EmailQualityDetails analysis={emailAnalysis[p.email]} email={p.email} />
                    )}
                    {p.additional_emails && p.additional_emails.length > 0 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => triggerEmailDeduplication(p.id)}
                        className="text-[10px] h-6 gap-1 text-purple-400 hover:text-purple-300 mt-1"
                      >
                        <Sparkles className="w-3 h-3" />
                        Deduplicate
                      </Button>
                    )}
                    {deduplicationResults[p.id] && (
                      <div className="mt-2">
                        <EmailDeduplicationPanel 
                          emailGroups={deduplicationResults[p.id]}
                          providerId={p.id}
                          onGenerateOutreach={generateOutreachEmail}
                        />
                      </div>
                    )}
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
          Email addresses are found via AI-powered web search and may not be 100% accurate. 
          Always verify before using for outreach. High confidence means found on a public page; 
          medium means inferred from a domain pattern; low means best guess.
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

      {/* Outreach Preview Modal */}
      {outreachPreview && (
        <OutreachEmailPreview
          outreach={outreachPreview.outreach}
          provider={outreachPreview.provider}
          onClose={() => setOutreachPreview(null)}
          onSend={() => {
            setOutreachPreview(null);
            toast.success('Email is ready to send!');
          }}
        />
      )}
    </div>
  );
}
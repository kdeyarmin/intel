import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Bot, Mail, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import EmailBotControls from '../components/emailBot/EmailBotControls';
import EmailBotResults from '../components/emailBot/EmailBotResults';
import ComplianceDisclaimer from '../components/compliance/ComplianceDisclaimer';

export default function EmailSearchBot() {
  const [batchSize, setBatchSize] = useState(10);
  const [skipSearched, setSkipSearched] = useState(true);
  const [singleNpi, setSingleNpi] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [lastResults, setLastResults] = useState(null);
  const queryClient = useQueryClient();

  const { data: providers = [], isLoading } = useQuery({
    queryKey: ['emailBotProviders'],
    queryFn: () => base44.entities.Provider.list('-created_date', 500),
    staleTime: 60000,
  });

  const stats = useMemo(() => {
    const total = providers.length;
    const withEmail = providers.filter(p => p.email).length;
    const searched = providers.filter(p => p.email_searched_at).length;
    const remaining = total - searched;
    return { total, withEmail, searched, remaining };
  }, [providers]);

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
      toast.success(`Searched ${data.searched} providers, found emails for ${data.found}`);
      queryClient.invalidateQueries({ queryKey: ['emailBotProviders'] });
    } catch (err) {
      toast.error('Search failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setIsRunning(false);
    }
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
          <div className="p-2 rounded-xl bg-gradient-to-br from-blue-100 to-teal-100">
            <Bot className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Email Search Bot</h1>
            <p className="text-sm text-slate-500">
              AI-powered search to find email addresses for providers and practices
            </p>
          </div>
        </div>
      </div>

      <ComplianceDisclaimer />

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-slate-50">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-slate-900">{stats.total}</div>
            <div className="text-xs text-slate-500">Total Providers</div>
          </CardContent>
        </Card>
        <Card className="bg-green-50">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-700">{stats.withEmail}</div>
            <div className="text-xs text-green-600">Have Email</div>
          </CardContent>
        </Card>
        <Card className="bg-blue-50">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-700">{stats.searched}</div>
            <div className="text-xs text-blue-600">Already Searched</div>
          </CardContent>
        </Card>
        <Card className="bg-amber-50">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-amber-700">{stats.remaining}</div>
            <div className="text-xs text-amber-600">Remaining</div>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <EmailBotControls
        batchSize={batchSize}
        setBatchSize={setBatchSize}
        skipSearched={skipSearched}
        setSkipSearched={setSkipSearched}
        singleNpi={singleNpi}
        setSingleNpi={setSingleNpi}
        isRunning={isRunning}
        onRunBatch={() => runSearch('batch')}
        onRunSingle={() => runSearch('single', singleNpi.trim())}
        stats={stats}
      />

      {/* Running indicator */}
      {isRunning && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="animate-pulse">
              <Bot className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-blue-800">Bot is searching for email addresses...</p>
              <p className="text-xs text-blue-600">This may take a few minutes depending on batch size. Each provider requires a web search.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Latest Run Results */}
      {lastResults && (
        <div>
          <h2 className="text-base font-semibold text-slate-800 mb-3 flex items-center gap-2">
            <Mail className="w-4 h-4 text-blue-600" />
            Latest Run Results
            <Badge className="bg-blue-100 text-blue-700 text-[10px]">{lastResults.length} searched</Badge>
            <Badge className="bg-green-100 text-green-700 text-[10px]">
              {lastResults.filter(r => r.best_email).length} found
            </Badge>
          </h2>
          <EmailBotResults results={lastResults} />
        </div>
      )}

      {/* Recent Finds */}
      {recentFinds.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
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
                  <div key={idx} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-slate-900 truncate">{name}</div>
                      <div className="text-xs text-slate-500">{p.email}</div>
                    </div>
                    <Badge className={`${confColor} text-[10px] shrink-0`}>{p.email_confidence}</Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Disclaimer */}
      <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
        <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
        <p className="text-xs text-amber-700">
          Email addresses are found via AI-powered web search and may not be 100% accurate. 
          Always verify before using for outreach. High confidence means found on a public page; 
          medium means inferred from a domain pattern; low means best guess.
        </p>
      </div>
    </div>
  );
}
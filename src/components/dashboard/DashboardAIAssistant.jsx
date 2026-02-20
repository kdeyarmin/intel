import React, { useState, useRef, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import ReactMarkdown from 'react-markdown';
import {
  Sparkles, Send, Loader2, RefreshCw, TrendingUp,
  AlertTriangle, FileText, ChevronDown, ChevronUp
} from 'lucide-react';

const QUICK_PROMPTS = [
  { label: 'Summarize dashboard', icon: FileText, prompt: 'Give me a concise executive summary of the current dashboard metrics, recent activity, and overall data health.' },
  { label: 'Find anomalies', icon: AlertTriangle, prompt: 'Analyze the provider, referral, and utilization data for any anomalies, outliers, or unusual patterns that need attention.' },
  { label: 'Trend analysis', icon: TrendingUp, prompt: 'Identify the most important trends in the data — referral growth, provider additions, utilization changes, and data quality trajectory.' },
  { label: 'Data quality audit', icon: AlertTriangle, prompt: 'Perform a thorough data quality audit. Check for missing fields, invalid formats, stale records, and suggest specific fixes.' },
];

function buildDataContext(providers, locations, referrals, utilization, taxonomies, batches, auditEvents) {
  const total = providers.length;
  const orgCount = providers.filter(p => p.entity_type === 'Organization').length;
  const indCount = providers.filter(p => p.entity_type === 'Individual').length;
  const deactivated = providers.filter(p => p.status === 'Deactivated').length;
  const needEnrichment = providers.filter(p => p.needs_nppes_enrichment).length;
  const withEmail = providers.filter(p => p.email).length;

  const stateMap = {};
  locations.forEach(l => { if (l.state) stateMap[l.state] = (stateMap[l.state] || 0) + 1; });
  const topStates = Object.entries(stateMap).sort((a, b) => b[1] - a[1]).slice(0, 10);

  const locNPIs = new Set(locations.map(l => l.npi));
  const noLocation = providers.filter(p => !locNPIs.has(p.npi)).length;
  const taxNPIs = new Set(taxonomies.map(t => t.npi));
  const noTaxonomy = providers.filter(p => !taxNPIs.has(p.npi)).length;

  // Referral trends
  const refByYear = {};
  referrals.forEach(r => {
    if (!r.year) return;
    refByYear[r.year] = (refByYear[r.year] || 0) + (r.total_referrals || 0);
  });

  // Utilization trends
  const utilByYear = {};
  utilization.forEach(u => {
    if (!u.year) return;
    if (!utilByYear[u.year]) utilByYear[u.year] = { services: 0, beneficiaries: 0, payment: 0, providers: new Set() };
    utilByYear[u.year].services += (u.total_services || 0);
    utilByYear[u.year].beneficiaries += (u.total_medicare_beneficiaries || 0);
    utilByYear[u.year].payment += (u.total_medicare_payment || 0);
    utilByYear[u.year].providers.add(u.npi);
  });
  const utilSummary = Object.entries(utilByYear).map(([y, d]) => ({
    year: y, services: d.services, beneficiaries: d.beneficiaries, payment: Math.round(d.payment), providers: d.providers.size
  })).sort((a, b) => Number(a.year) - Number(b.year));

  // Recent batches
  const recentBatches = batches.slice(0, 10).map(b => ({
    type: b.import_type, status: b.status, rows: b.total_rows || 0,
    imported: b.imported_rows || 0, failed: b.invalid_rows || 0,
    date: b.created_date
  }));

  // Top specialties
  const specMap = {};
  taxonomies.forEach(t => {
    if (t.taxonomy_description) specMap[t.taxonomy_description] = (specMap[t.taxonomy_description] || 0) + 1;
  });
  const topSpecialties = Object.entries(specMap).sort((a, b) => b[1] - a[1]).slice(0, 10);

  return `DASHBOARD DATA SNAPSHOT (as of ${new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' })}):

PROVIDERS: ${total} total (${indCount} individuals, ${orgCount} organizations)
- Deactivated: ${deactivated}
- Need NPPES enrichment: ${needEnrichment}
- With email: ${withEmail} (${total > 0 ? Math.round(withEmail/total*100) : 0}%)
- Missing location: ${noLocation} (${total > 0 ? Math.round(noLocation/total*100) : 0}%)
- Missing taxonomy: ${noTaxonomy} (${total > 0 ? Math.round(noTaxonomy/total*100) : 0}%)

TOP STATES: ${topStates.map(([s, c]) => `${s}:${c}`).join(', ')}

TOP SPECIALTIES: ${topSpecialties.map(([s, c]) => `${s}:${c}`).join(', ')}

REFERRALS BY YEAR: ${Object.entries(refByYear).sort((a,b) => Number(a[0])-Number(b[0])).map(([y, c]) => `${y}:${c.toLocaleString()}`).join(', ')}

UTILIZATION BY YEAR:
${utilSummary.map(u => `${u.year}: ${u.providers} providers, ${u.services.toLocaleString()} services, ${u.beneficiaries.toLocaleString()} beneficiaries, $${u.payment.toLocaleString()} payment`).join('\n')}

LOCATIONS: ${locations.length} total
- Missing phone: ${locations.filter(l => !l.phone).length}
- Missing zip: ${locations.filter(l => !l.zip).length}

RECENT IMPORTS: ${recentBatches.map(b => `${b.type}(${b.status}, ${b.imported}/${b.rows} rows, ${b.date?.split('T')[0]})`).join('; ')}

RECENT ACTIVITY: ${(auditEvents || []).slice(0, 5).map(e => `${e.event_type} by ${e.user_email?.split('@')[0]} at ${e.created_date}`).join('; ')}`;
}

export default function DashboardAIAssistant() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [hasAutoRun, setHasAutoRun] = useState(false);
  const messagesEndRef = useRef(null);

  const { data: providers = [] } = useQuery({ queryKey: ['providers'], queryFn: () => base44.entities.Provider.list('-created_date', 10000), staleTime: 60000 });
  const { data: locations = [] } = useQuery({ queryKey: ['locations'], queryFn: () => base44.entities.ProviderLocation.list('-created_date', 10000), staleTime: 60000 });
  const { data: referrals = [] } = useQuery({ queryKey: ['referrals'], queryFn: () => base44.entities.CMSReferral.list('-created_date', 10000), staleTime: 60000 });
  const { data: utilization = [] } = useQuery({ queryKey: ['utilization'], queryFn: () => base44.entities.CMSUtilization.list('-created_date', 10000), staleTime: 60000 });
  const { data: taxonomies = [] } = useQuery({ queryKey: ['taxonomies'], queryFn: () => base44.entities.ProviderTaxonomy.list('-created_date', 10000), staleTime: 60000 });
  const { data: batches = [] } = useQuery({ queryKey: ['importBatches'], queryFn: () => base44.entities.ImportBatch.list('-created_date', 100), staleTime: 60000 });
  const { data: auditEvents = [] } = useQuery({ queryKey: ['auditEvents'], queryFn: () => base44.entities.AuditEvent.list('-created_date', 5), staleTime: 60000 });

  const dataLoaded = providers.length > 0;

  const dataContext = useMemo(() => {
    if (!dataLoaded) return '';
    return buildDataContext(providers, locations, referrals, utilization, taxonomies, batches, auditEvents);
  }, [dataLoaded, providers, locations, referrals, utilization, taxonomies, batches, auditEvents]);

  useEffect(() => {
    const container = messagesEndRef.current?.parentElement;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  // Auto-generate initial briefing
  useEffect(() => {
    if (dataLoaded && !hasAutoRun && messages.length === 0) {
      setHasAutoRun(true);
      runQuery('Give me a concise executive briefing of the dashboard. Highlight the top 3 most important findings — including any data quality concerns, notable trends, and actionable recommendations. Keep it under 200 words.');
    }
  }, [dataLoaded, hasAutoRun]);

  const runQuery = async (prompt) => {
    if (!prompt.trim() || isGenerating) return;

    const userMsg = { role: 'user', content: prompt };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsGenerating(true);

    const fullPrompt = `You are CareMetric AI, an expert healthcare data analyst assistant embedded in a provider intelligence dashboard. You analyze CMS Medicare data, NPPES provider registries, referral patterns, and utilization trends.

Your style: concise, data-driven, actionable. Use specific numbers from the data. Format with markdown — use **bold** for key metrics, bullet points for lists, and keep paragraphs short. When identifying issues, always suggest a specific next step.

${dataContext}

USER QUESTION: ${prompt}`;

    const response = await base44.integrations.Core.InvokeLLM({ prompt: fullPrompt });
    setMessages(prev => [...prev, { role: 'assistant', content: response }]);
    setIsGenerating(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    runQuery(input);
  };

  return (
    <Card className="bg-[#141d30] border-slate-700/50 shadow-lg shadow-black/10">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2 text-slate-200 font-semibold">
            <div className="w-6 h-6 rounded-lg bg-violet-500/20 flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-violet-400" />
            </div>
            CareMetric AI Assistant
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge className="bg-violet-500/15 text-violet-400 border border-violet-500/20 text-[10px]">
              Live Data
            </Badge>
            <Button
              variant="ghost" size="icon"
              className="h-7 w-7 text-slate-400 hover:text-slate-200"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-3 pt-0">
          {/* Quick prompts */}
          <div className="flex gap-2 flex-wrap">
            {QUICK_PROMPTS.map((qp) => {
              const Icon = qp.icon;
              return (
                <Button
                  key={qp.label}
                  variant="outline"
                  size="sm"
                  disabled={isGenerating}
                  onClick={() => runQuery(qp.prompt)}
                  className="text-[11px] h-7 bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-violet-400 hover:border-violet-500/30"
                >
                  <Icon className="w-3 h-3 mr-1" />
                  {qp.label}
                </Button>
              );
            })}
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setMessages([]); setHasAutoRun(false); }}
                className="text-[11px] h-7 text-slate-500 hover:text-slate-300"
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                Reset
              </Button>
            )}
          </div>

          {/* Messages */}
          {messages.length > 0 && (
            <div className="max-h-[400px] overflow-y-auto space-y-3 pr-1 scroll-smooth">
              {messages.map((msg, i) => (
                <div key={i} className={`${msg.role === 'user' ? 'flex justify-end' : ''}`}>
                  {msg.role === 'user' ? (
                    <div className="max-w-[85%] bg-slate-800 border border-slate-700/50 rounded-xl px-3.5 py-2 text-sm text-slate-200">
                      {msg.content}
                    </div>
                  ) : (
                    <div className="bg-slate-800/40 border border-violet-500/10 rounded-xl px-4 py-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles className="w-3 h-3 text-violet-400" />
                        <span className="text-[10px] font-semibold text-violet-400 uppercase tracking-wider">AI Analysis</span>
                      </div>
                      <div className="text-sm text-slate-300 leading-relaxed prose prose-sm prose-invert max-w-none
                        [&_strong]:text-white [&_strong]:font-semibold
                        [&_ul]:space-y-1 [&_ul]:my-2 [&_li]:text-slate-300
                        [&_h1]:text-base [&_h1]:font-semibold [&_h1]:text-slate-200 [&_h1]:mt-3 [&_h1]:mb-1
                        [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-slate-200 [&_h2]:mt-3 [&_h2]:mb-1
                        [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-slate-300 [&_h3]:mt-2 [&_h3]:mb-1
                        [&_p]:my-1.5 [&_p]:text-slate-300
                        [&_code]:bg-slate-700/50 [&_code]:px-1 [&_code]:rounded [&_code]:text-cyan-400 [&_code]:text-xs
                      ">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {isGenerating && (
                <div className="bg-slate-800/40 border border-violet-500/10 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 text-violet-400 animate-spin" />
                    <span className="text-xs text-violet-400">Analyzing data...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Initial state */}
          {messages.length === 0 && !isGenerating && (
            <div className="text-center py-6">
              <Sparkles className="w-8 h-8 mx-auto mb-2 text-violet-400/40" />
              <p className="text-sm text-slate-400">Loading initial briefing...</p>
            </div>
          )}
          {messages.length === 0 && isGenerating && (
            <div className="text-center py-6">
              <Loader2 className="w-8 h-8 mx-auto mb-2 text-violet-400 animate-spin" />
              <p className="text-sm text-slate-400">Generating your daily briefing...</p>
            </div>
          )}

          {/* Input */}
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about trends, anomalies, data quality..."
              disabled={isGenerating}
              className="flex-1 h-9 text-sm bg-slate-800/50 border-slate-700 text-slate-200 placeholder:text-slate-500"
            />
            <Button
              type="submit"
              disabled={!input.trim() || isGenerating}
              size="sm"
              className="h-9 px-3 bg-violet-600 hover:bg-violet-700 text-white"
            >
              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </form>
        </CardContent>
      )}
    </Card>
  );
}
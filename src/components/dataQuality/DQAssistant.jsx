import React, { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import ReactMarkdown from 'react-markdown';
import {
  Bot, Send, Loader2, Sparkles, Zap, TrendingUp,
  AlertTriangle, CheckCircle2, Wrench
} from 'lucide-react';

const QUICK_ACTIONS = [
  { label: 'What needs fixing?', icon: AlertTriangle, question: 'What are the most critical data quality issues right now? What should I fix first?' },
  { label: 'Auto-fix safe alerts', icon: Zap, action: 'auto_fix' },
  { label: 'Pattern analysis', icon: TrendingUp, action: 'analyze_patterns' },
  { label: 'Scan summary', icon: Sparkles, question: 'Summarize the latest scan results and overall data health.' },
];

export default function DQAssistant() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [_autoFixResult, setAutoFixResult] = useState(null);
  const [patternResult, setPatternResult] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const addMessage = (role, content, data) => {
    setMessages(prev => [...prev, { role, content, data, time: new Date() }]);
  };

  const handleAsk = async (question) => {
    if (!question?.trim()) return;
    addMessage('user', question);
    setInput('');
    setLoading(true);

    const res = await base44.functions.invoke('runDataQualityScan', {
      action: 'assistant_query',
      question,
    });

    const data = res.data;
    if (data.success && data.response) {
      addMessage('assistant', data.response.answer, {
        actions: data.response.suggested_actions,
        stats: data.response.related_stats,
      });
    } else {
      addMessage('assistant', data.error || 'Sorry, I could not process that request.');
    }
    setLoading(false);
  };

  const handleAutoFix = async () => {
    addMessage('user', '🔧 Run auto-fix on eligible alerts');
    setLoading(true);
    setAutoFixResult(null);

    const res = await base44.functions.invoke('runDataQualityScan', {
      action: 'auto_fix_eligible',
    });

    const data = res.data;
    setAutoFixResult(data);
    addMessage('assistant', data.message || `Auto-fix complete: ${data.fixed || 0} fixed, ${data.skipped || 0} skipped.`, {
      autoFix: data,
    });
    setLoading(false);
  };

  const handlePatternAnalysis = async () => {
    addMessage('user', '📊 Analyze recurring data quality patterns');
    setLoading(true);
    setPatternResult(null);

    const res = await base44.functions.invoke('runDataQualityScan', {
      action: 'analyze_patterns',
    });

    const data = res.data;
    if (data.success && data.analysis) {
      setPatternResult(data.analysis);
      addMessage('assistant', data.analysis.summary || 'Pattern analysis complete.', {
        patterns: data.analysis,
      });
    } else {
      addMessage('assistant', 'Pattern analysis failed. Please try again.');
    }
    setLoading(false);
  };

  const handleQuickAction = (qa) => {
    if (qa.action === 'auto_fix') handleAutoFix();
    else if (qa.action === 'analyze_patterns') handlePatternAnalysis();
    else if (qa.question) handleAsk(qa.question);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    handleAsk(input);
  };

  return (
    <Card className="border-indigo-200 flex flex-col" style={{ maxHeight: '700px' }}>
      <CardHeader className="pb-2 border-b flex-shrink-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Bot className="w-5 h-5 text-indigo-600" />
          AI Data Quality Assistant
          <Badge variant="outline" className="text-[9px] ml-1">Beta</Badge>
        </CardTitle>
        <p className="text-xs text-slate-500 mt-0.5">
          Ask questions, auto-fix issues, or analyze patterns
        </p>
      </CardHeader>
      <CardContent className="flex flex-col flex-1 overflow-hidden p-0">
        {/* Quick Actions */}
        <div className="flex gap-1.5 p-3 pb-2 flex-wrap flex-shrink-0">
          {QUICK_ACTIONS.map((qa, i) => {
            const Icon = qa.icon;
            return (
              <Button
                key={i}
                variant="outline"
                size="sm"
                disabled={loading}
                onClick={() => handleQuickAction(qa)}
                className="text-[10px] h-7 gap-1 border-slate-700/50 hover:border-indigo-300 hover:bg-indigo-50"
              >
                <Icon className="w-3 h-3" />
                {qa.label}
              </Button>
            );
          })}
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-3 min-h-0">
          {messages.length === 0 && !loading && (
            <div className="text-center py-8 text-slate-400">
              <Bot className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-medium">Hi! I'm your Data Quality Assistant.</p>
              <p className="text-xs mt-1">Ask me about data issues, or use the quick actions above.</p>
            </div>
          )}

          {messages.map((msg, i) => (
            <MessageBubble key={i} message={msg} />
          ))}

          {loading && (
            <div className="flex gap-2 items-start">
              <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                <Bot className="w-3.5 h-3.5 text-indigo-600" />
              </div>
              <div className="space-y-1.5 flex-1">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          )}
        </div>

        {/* Pattern Analysis Results (if present) */}
        {patternResult && (
          <PatternResultsPanel result={patternResult} onClose={() => setPatternResult(null)} />
        )}

        {/* Input */}
        <form onSubmit={handleSubmit} className="p-3 pt-2 border-t flex gap-2 flex-shrink-0">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about data quality issues..."
            className="text-xs h-8"
            disabled={loading}
          />
          <Button type="submit" size="icon" disabled={loading || !input.trim()} className="h-8 w-8 bg-indigo-600 hover:bg-indigo-700">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function MessageBubble({ message }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex gap-2 ${isUser ? 'justify-end' : 'items-start'}`}>
      {!isUser && (
        <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center shrink-0 mt-0.5">
          <Bot className="w-3.5 h-3.5 text-indigo-600" />
        </div>
      )}
      <div className={`max-w-[85%] ${isUser ? 'order-first' : ''}`}>
        <div className={`rounded-xl px-3 py-2 text-xs leading-relaxed ${
          isUser
            ? 'bg-indigo-600 text-white ml-auto'
            : 'bg-slate-100 text-slate-800'
        }`}>
          {isUser ? (
            <p>{message.content}</p>
          ) : (
            <ReactMarkdown className="prose prose-xs max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-1 [&_ul]:my-1 [&_li]:my-0.5">
              {message.content}
            </ReactMarkdown>
          )}
        </div>

        {/* Suggested Actions */}
        {message.data?.actions?.length > 0 && (
          <div className="mt-2 space-y-1">
            {message.data.actions.map((a, i) => (
              <div key={i} className="flex items-start gap-1.5 bg-blue-500/10 rounded-lg px-2.5 py-1.5 border border-blue-100">
                {a.auto_executable ? (
                  <Zap className="w-3 h-3 text-amber-500 mt-0.5 shrink-0" />
                ) : (
                  <Wrench className="w-3 h-3 text-blue-500 mt-0.5 shrink-0" />
                )}
                <div>
                  <p className="text-[10px] font-semibold text-slate-700">{a.action}</p>
                  <p className="text-[10px] text-slate-500">{a.description}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Auto-fix Results */}
        {message.data?.autoFix && (
          <AutoFixSummary data={message.data.autoFix} />
        )}

        {/* Stats */}
        {message.data?.stats && (
          <div className="flex gap-2 mt-1.5">
            {message.data.stats.open_alerts != null && (
              <Badge variant="outline" className="text-[8px]">
                <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
                {message.data.stats.open_alerts} open
              </Badge>
            )}
            {message.data.stats.auto_fixable != null && (
              <Badge variant="outline" className="text-[8px]">
                <Zap className="w-2.5 h-2.5 mr-0.5" />
                {message.data.stats.auto_fixable} fixable
              </Badge>
            )}
            {message.data.stats.overall_score != null && (
              <Badge variant="outline" className="text-[8px]">
                {message.data.stats.overall_score}% health
              </Badge>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function AutoFixSummary({ data }) {
  return (
    <div className="mt-2 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
      <div className="flex items-center gap-2 mb-1.5">
        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
        <span className="text-[11px] font-semibold text-emerald-800">Auto-Fix Results</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-slate-800/40 rounded p-1.5">
          <p className="text-lg font-bold text-emerald-700">{data.fixed || 0}</p>
          <p className="text-[9px] text-emerald-600">Fixed</p>
        </div>
        <div className="bg-slate-800/40 rounded p-1.5">
          <p className="text-lg font-bold text-slate-500">{data.skipped || 0}</p>
          <p className="text-[9px] text-slate-500">Skipped</p>
        </div>
        <div className="bg-slate-800/40 rounded p-1.5">
          <p className="text-lg font-bold text-blue-600">{data.total_eligible || 0}</p>
          <p className="text-[9px] text-blue-500">Eligible</p>
        </div>
      </div>
      {data.fix_log?.filter(f => !f.skipped && !f.error).length > 0 && (
        <div className="mt-2 space-y-0.5">
          <p className="text-[9px] text-emerald-700 font-medium">Applied fixes:</p>
          {data.fix_log.filter(f => !f.skipped && !f.error).slice(0, 5).map((f, i) => (
            <p key={i} className="text-[9px] text-emerald-600">
              • {f.npi}: {f.field} "{f.old}" → "{f.new}" ({f.confidence}% confidence)
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function PatternResultsPanel({ result, onClose }) {
  if (!result) return null;

  return (
    <div className="border-t max-h-56 overflow-y-auto px-3 py-2 bg-slate-800/30 flex-shrink-0">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1">
          <TrendingUp className="w-3 h-3" /> Pattern Analysis
        </span>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-5 text-[9px] px-1.5">Hide</Button>
      </div>

      {/* Trend */}
      {result.trend_analysis && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded p-2 mb-2">
          <p className="text-[10px] text-blue-800">{result.trend_analysis}</p>
        </div>
      )}

      {/* Recurring patterns */}
      {result.recurring_patterns?.length > 0 && (
        <div className="space-y-1.5 mb-2">
          {result.recurring_patterns.slice(0, 3).map((p, i) => (
            <div key={i} className="bg-slate-800/40 border rounded p-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-slate-700">{p.rule_name}</span>
                <Badge variant="outline" className="text-[8px]">{p.occurrence_count}x</Badge>
              </div>
              <p className="text-[9px] text-amber-700 mt-0.5"><strong>Root cause:</strong> {p.root_cause}</p>
              <p className="text-[9px] text-emerald-700"><strong>Fix:</strong> {p.fix_strategy}</p>
            </div>
          ))}
        </div>
      )}

      {/* Action plan */}
      {result.action_plan?.length > 0 && (
        <div className="space-y-1">
          <p className="text-[9px] font-semibold text-slate-500 uppercase">Priority Actions</p>
          {result.action_plan.slice(0, 3).map((a, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <Badge className="text-[7px] bg-indigo-100 text-indigo-700 shrink-0 mt-0.5 h-4 w-4 flex items-center justify-center p-0 rounded-full">{a.priority}</Badge>
              <div>
                <p className="text-[9px] font-medium text-slate-700">{a.action}</p>
                <p className="text-[9px] text-slate-500">{a.impact} <Badge variant="outline" className="text-[7px] ml-1">{a.effort}</Badge></p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Predictions */}
      {result.predictions?.length > 0 && (
        <div className="mt-2 bg-amber-500/10 border border-amber-500/20 rounded p-2">
          <p className="text-[9px] font-semibold text-amber-700 mb-0.5">⚠ Predictions</p>
          {result.predictions.slice(0, 2).map((p, i) => (
            <p key={i} className="text-[9px] text-amber-600">• {p}</p>
          ))}
        </div>
      )}
    </div>
  );
}
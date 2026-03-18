import React, { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import ReactMarkdown from 'react-markdown';
import {
  Sparkles, Send, Loader2, RefreshCw,
  AlertTriangle, FileText, ChevronDown, ChevronUp, Users
} from 'lucide-react';

const QUICK_PROMPTS = [
  { label: 'Summarize dashboard', icon: FileText, prompt: 'Give me a concise executive summary of the current dashboard metrics, recent activity, and overall data health.' },
  { label: 'Find anomalies', icon: AlertTriangle, prompt: 'Analyze the provider, referral, and utilization data for any anomalies, outliers, or unusual patterns that need attention.' },
  { label: 'Discover Leads', icon: Users, prompt: 'Find psychiatrists with high patient volumes near Pittsburgh who are likely to refer to home health.' },
  { label: 'Data quality audit', icon: AlertTriangle, prompt: 'Perform a thorough data quality audit. Check for missing fields, invalid formats, stale records, and suggest specific fixes.' },
];

export default function DashboardAIAssistant({ isFullPage = false }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExpanded, setIsExpanded] = useState(isFullPage);
  const [conversation, setConversation] = useState(null);
  const messagesEndRef = useRef(null);

  // Initialize Conversation with Agent
  useEffect(() => {
    const init = async () => {
      try {
        const conv = await base44.agents.createConversation({
          agent_name: 'caremetric_assistant',
          metadata: { name: 'Dashboard Session' }
        });
        setConversation(conv);
        if (conv.messages) setMessages(conv.messages);
      } catch (err) {
        console.error("Agent init failed:", err);
      }
    };
    if (isExpanded && !conversation) init();
  }, [isExpanded]);

  // Subscribe to updates
  useEffect(() => {
    if (conversation?.id) {
      const unsubscribe = base44.agents.subscribeToConversation(conversation.id, (data) => {
        setMessages(data.messages);
        
        // Check if latest message is from assistant and done
        const lastMsg = data.messages[data.messages.length - 1];
        if (lastMsg?.role === 'assistant' && !lastMsg.tool_calls?.some(tc => ['running', 'pending'].includes(tc.status))) {
          setIsGenerating(false);
        }
      });
      return unsubscribe;
    }
  }, [conversation?.id]);

  useEffect(() => {
    if (isFullPage) setIsExpanded(true);
  }, [isFullPage]);

  // Scroll to bottom
  useEffect(() => {
    const container = messagesEndRef.current?.parentElement;
    if (container) container.scrollTop = container.scrollHeight;
  }, [messages]);

  const runQuery = async (prompt) => {
    if (!prompt.trim() || !conversation) return;
    
    setIsGenerating(true);
    setInput('');
    
    // Optimistic UI update handled by subscription
    try {
      await base44.agents.addMessage(conversation, {
        role: 'user',
        content: prompt
      });
    } catch (err) {
      console.error(err);
      setIsGenerating(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    runQuery(input);
  };
  return (
    <Card className={`bg-[#141d30] border-slate-700/50 shadow-lg shadow-black/10 ${isFullPage ? 'h-full flex flex-col' : ''}`}>
      <CardHeader className="pb-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2 text-white font-semibold">
            <div className="w-6 h-6 rounded-lg bg-violet-500/20 flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-violet-400" />
            </div>
            CareMetric AI Assistant
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge className="bg-violet-500/15 text-violet-400 border border-violet-500/20 text-[10px]">
              Live Data
            </Badge>
            {!isFullPage && (
              <Button
                variant="ghost" size="icon"
                className="h-7 w-7 text-slate-400 hover:text-slate-200"
                onClick={() => setIsExpanded(!isExpanded)}
              >
                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className={`space-y-3 pt-0 ${isFullPage ? 'flex-1 flex flex-col min-h-0' : ''}`}>
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
            <div className={`${isFullPage ? 'flex-1 min-h-0' : 'max-h-[400px]'} overflow-y-auto space-y-3 pr-1 scroll-smooth`}>
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
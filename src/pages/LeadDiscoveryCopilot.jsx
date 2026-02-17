import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Send, Sparkles, Loader2, MessageSquare } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export default function LeadDiscoveryCopilot() {
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    initConversation();
  }, []);

  useEffect(() => {
    if (conversation?.id) {
      const unsubscribe = base44.agents.subscribeToConversation(conversation.id, (data) => {
        setMessages(data.messages);
      });
      return unsubscribe;
    }
  }, [conversation?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const initConversation = async () => {
    try {
      const conv = await base44.agents.createConversation({
        agent_name: 'lead_discovery_copilot',
        metadata: {
          name: 'Lead Discovery Session',
          description: 'Provider lead discovery conversation',
        },
      });
      setConversation(conv);
      setMessages(conv.messages || []);
    } catch (error) {
      console.error('Failed to create conversation:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || !conversation || sending) return;

    setSending(true);
    try {
      await base44.agents.addMessage(conversation, {
        role: 'user',
        content: input.trim(),
      });
      setInput('');
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const exampleQueries = [
    "Top hospice referral sources in Western Pennsylvania",
    "Psychiatrists with high behavioral health prescribing patterns",
    "Primary care providers likely to refer to home health near Pittsburgh",
    "Family medicine doctors with 200+ Medicare patients in Allegheny County",
  ];

  if (loading) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <Skeleton className="h-12 w-96 mb-6" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Sparkles className="h-8 w-8 text-teal-600" />
          <h1 className="text-3xl font-bold text-gray-900">Lead Discovery Copilot</h1>
        </div>
        <p className="text-gray-600">
          Ask natural language questions to discover high-potential provider leads
        </p>
      </div>

      {messages.length === 0 && (
        <Card className="mb-6 bg-teal-50 border-teal-200">
          <CardHeader>
            <CardTitle className="text-teal-900 text-lg">Try asking me:</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {exampleQueries.map((query, idx) => (
                <button
                  key={idx}
                  onClick={() => setInput(query)}
                  className="block w-full text-left px-4 py-3 bg-white border border-teal-200 rounded-lg hover:border-teal-400 hover:bg-teal-50 transition-colors text-sm"
                >
                  💡 {query}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="space-y-4 min-h-[400px] max-h-[500px] overflow-y-auto">
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-gray-400">
                <div className="text-center">
                  <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Start a conversation to discover leads</p>
                </div>
              </div>
            ) : (
              messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'assistant' && (
                    <div className="h-8 w-8 rounded-lg bg-teal-100 flex items-center justify-center flex-shrink-0 mt-1">
                      <Sparkles className="h-4 w-4 text-teal-600" />
                    </div>
                  )}
                  <div className={`max-w-[85%] ${msg.role === 'user' ? 'flex flex-col items-end' : ''}`}>
                    {msg.content && (
                      <div
                        className={`rounded-2xl px-4 py-3 ${
                          msg.role === 'user'
                            ? 'bg-gray-800 text-white'
                            : 'bg-white border border-gray-200'
                        }`}
                      >
                        {msg.role === 'user' ? (
                          <p className="text-sm leading-relaxed">{msg.content}</p>
                        ) : (
                          <ReactMarkdown
                            className="text-sm prose prose-sm prose-slate max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                            components={{
                              p: ({ children }) => <p className="my-1 leading-relaxed">{children}</p>,
                              ul: ({ children }) => <ul className="my-2 ml-4 list-disc space-y-1">{children}</ul>,
                              ol: ({ children }) => <ol className="my-2 ml-4 list-decimal space-y-1">{children}</ol>,
                              li: ({ children }) => <li className="my-0.5">{children}</li>,
                              h3: ({ children }) => <h3 className="text-base font-semibold my-2">{children}</h3>,
                              strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
                            }}
                          >
                            {msg.content}
                          </ReactMarkdown>
                        )}
                      </div>
                    )}

                    {msg.tool_calls?.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {msg.tool_calls.map((tool, toolIdx) => (
                          <div
                            key={toolIdx}
                            className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 px-3 py-1.5 rounded-lg"
                          >
                            {tool.status === 'running' || tool.status === 'in_progress' ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Badge variant="outline" className="text-xs">
                                {tool.name?.split('.').pop()}
                              </Badge>
                            )}
                            <span className="text-gray-600">
                              {tool.status === 'running' ? 'Searching...' : tool.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex gap-3">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask me to find providers... (e.g., 'Show me psychiatrists with high patient volumes in Pittsburgh')"
              className="min-h-[60px] resize-none"
              disabled={sending}
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className="bg-teal-600 hover:bg-teal-700 h-[60px] px-6"
            >
              {sending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
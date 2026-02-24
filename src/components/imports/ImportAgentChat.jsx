import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, Bot, User, Activity } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export default function ImportAgentChat() {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [conversationId, setConversationId] = useState(null);
    const scrollRef = useRef(null);

    useEffect(() => {
        const initChat = async () => {
            try {
                const conv = await base44.agents.createConversation({
                    agent_name: 'import_manager',
                    metadata: { name: 'Import Monitor Session' }
                });
                setConversationId(conv.id);
                setMessages(conv.messages || []);
            } catch (e) {
                console.error("Failed to initialize chat", e);
            }
        };
        initChat();
    }, []);

    useEffect(() => {
        if (!conversationId) return;
        const unsubscribe = base44.agents.subscribeToConversation(conversationId, (data) => {
            setMessages(data.messages || []);
            setLoading(false);
        });
        return () => unsubscribe();
    }, [conversationId]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, loading]);

    const handleSend = async () => {
        if (!input.trim() || !conversationId) return;
        const userMsg = input;
        setInput('');
        setLoading(true);
        try {
            await base44.agents.addMessage({ id: conversationId }, {
                role: 'user',
                content: userMsg
            });
        } catch (e) {
            console.error(e);
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#141d30]">
            <CardHeader className="border-b border-slate-700/50 pb-4 shrink-0">
                <CardTitle className="text-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Bot className="w-5 h-5 text-cyan-400" />
                        AI Import Manager
                    </div>
                    <a href={base44.agents.getWhatsAppConnectURL('import_manager')} target="_blank" rel="noopener noreferrer" className="text-xs text-green-400 hover:text-green-300 flex items-center gap-1 font-normal bg-green-900/20 px-2 py-1 rounded">
                        💬 Connect WhatsApp
                    </a>
                </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 p-0 flex flex-col min-h-0">
                <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
                    {messages.length === 0 && !loading && (
                        <div className="text-center text-slate-500 mt-10">
                            <Bot className="w-12 h-12 mx-auto mb-2 opacity-50" />
                            <p>Hi! I am the Import Manager Agent.</p>
                            <p className="text-sm">I can monitor jobs, restart stalled imports, and fix issues.</p>
                        </div>
                    )}
                    {messages.map((m, i) => (
                        <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            {m.role !== 'user' && (
                                <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center flex-shrink-0">
                                    <Bot className="w-4 h-4 text-cyan-400" />
                                </div>
                            )}
                            <div className={`max-w-[80%] rounded-lg p-3 ${
                                m.role === 'user' 
                                ? 'bg-cyan-600 text-white' 
                                : 'bg-slate-800 border border-slate-700 text-slate-200'
                            }`}>
                                <ReactMarkdown className="prose prose-sm prose-invert max-w-none [&>p]:mb-1">
                                    {m.content}
                                </ReactMarkdown>
                                {m.tool_calls && m.tool_calls.length > 0 && (
                                    <div className="mt-2 text-xs text-slate-400 border-t border-slate-700 pt-2 space-y-1">
                                        {m.tool_calls.map((tc, idx) => (
                                            <div key={idx} className="flex items-center gap-1 bg-slate-900/50 p-1 rounded">
                                                <Activity className="w-3 h-3 text-cyan-500" />
                                                <span className="font-mono">{tc.name}</span>
                                                <span className="opacity-50">({tc.status || 'pending'})</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            {m.role === 'user' && (
                                <div className="w-8 h-8 rounded-full bg-cyan-700 flex items-center justify-center flex-shrink-0">
                                    <User className="w-4 h-4 text-white" />
                                </div>
                            )}
                        </div>
                    ))}
                    {loading && (
                        <div className="flex gap-3 justify-start">
                            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center flex-shrink-0">
                                <Bot className="w-4 h-4 text-cyan-400" />
                            </div>
                            <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce" />
                                <div className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '0.2s' }} />
                                <div className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '0.4s' }} />
                            </div>
                        </div>
                    )}
                </div>
                <div className="p-4 bg-slate-900 border-t border-slate-700/50 shrink-0">
                    <form 
                        onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                        className="flex gap-2"
                    >
                        <Input 
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Ask the import manager to check or restart jobs..."
                            className="bg-slate-800 border-slate-700 text-white flex-1"
                            disabled={loading}
                        />
                        <Button type="submit" disabled={loading || !input.trim()} className="bg-cyan-600 hover:bg-cyan-700">
                            <Send className="w-4 h-4" />
                        </Button>
                    </form>
                </div>
            </CardContent>
        </div>
    );
}
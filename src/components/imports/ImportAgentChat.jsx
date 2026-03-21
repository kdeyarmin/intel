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
    const scrollRef = useRef(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, loading]);

    const handleSend = async () => {
        if (!input.trim() || loading) return;
        const userMsg = input;
        setInput('');
        setLoading(true);

        const newMessages = [...messages, { role: 'user', content: userMsg }];
        setMessages(newMessages);

        try {
            const response = await base44.functions.invoke('importAgentChat', {
                message: userMsg,
                history: newMessages.slice(-10)
            });
            const reply = response?.data?.reply || response?.data?.message || 'Sorry, I could not process that request.';
            setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
        } catch (e) {
            console.error('Import agent chat error:', e);
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: 'Sorry, something went wrong. Please try again.'
            }]);
        }
        setLoading(false);
    };

    return (
        <div className="flex flex-col h-full bg-[#141d30]">
            <CardHeader className="border-b border-slate-700/50 pb-4 shrink-0">
                <CardTitle className="text-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Bot className="w-5 h-5 text-cyan-400" />
                        AI Import Manager
                    </div>
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

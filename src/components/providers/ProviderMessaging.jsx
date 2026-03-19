import React, { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { MessageSquare, Send, Loader2, Sparkles, Calendar, Plus, X, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatDateTimeET, formatDateET } from '../utils/dateUtils';

export default function ProviderMessaging({ provider, locations = [] }) {
  const [activeTab, setActiveTab] = useState('messages');
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [generatingDraft, setGeneratingDraft] = useState(false);

  // Calendar state
  const [events, setEvents] = useState([]);
  const [showNewEvent, setShowNewEvent] = useState(false);
  const [eventForm, setEventForm] = useState({ title: '', date: '', time: '', notes: '' });
  const messagesEndRef = useRef(null);

  const providerName = provider.entity_type === 'Individual'
    ? `${provider.first_name || ''} ${provider.last_name || ''}`.trim()
    : provider.organization_name || provider.npi;

  const providerEmail = provider.email;
  const primaryLoc = locations.find(l => l.is_primary) || locations[0];

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const sendMessage = async () => {
    if (!newMessage.trim()) return;
    if (!providerEmail) {
      toast.error('No email on file for this provider');
      return;
    }

    setSending(true);
    const msg = { content: newMessage, timestamp: new Date().toISOString(), direction: 'outbound', status: 'sent' };
    setMessages(prev => [...prev, msg]);

    await base44.integrations.Core.SendEmail({
      to: providerEmail,
      subject: `Message from CareMetric regarding ${providerName}`,
      body: newMessage,
    });

    setNewMessage('');
    setSending(false);
    toast.success('Message sent');
  };

  const generateDraft = async () => {
    setGeneratingDraft(true);
    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `Draft a brief, professional outreach email to ${providerName}, a healthcare provider${primaryLoc ? ` in ${primaryLoc.city || ''}, ${primaryLoc.state || ''}` : ''}. 
Purpose: Initial introduction or follow-up regarding potential collaboration.
Keep it under 80 words, warm but professional, and include a clear call to action (e.g., scheduling a call).
Do NOT include subject line, just the body.`,
    });
    setNewMessage(res);
    setGeneratingDraft(false);
  };

  const addEvent = () => {
    if (!eventForm.title || !eventForm.date) return;
    setEvents(prev => [...prev, {
      ...eventForm,
      id: Date.now(),
      created: new Date().toISOString(),
    }]);
    setEventForm({ title: '', date: '', time: '', notes: '' });
    setShowNewEvent(false);
    toast.success('Event scheduled');
  };

  const removeEvent = (id) => {
    setEvents(prev => prev.filter(e => e.id !== id));
  };

  return (
    <Card className="bg-[#141d30] border-slate-700/50">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <Button size="sm" variant={activeTab === 'messages' ? 'default' : 'ghost'}
              onClick={() => setActiveTab('messages')}
              className={`h-7 text-xs gap-1 ${activeTab === 'messages' ? 'bg-cyan-600' : 'text-slate-400'}`}>
              <MessageSquare className="w-3 h-3" /> Messages
            </Button>
            <Button size="sm" variant={activeTab === 'calendar' ? 'default' : 'ghost'}
              onClick={() => setActiveTab('calendar')}
              className={`h-7 text-xs gap-1 ${activeTab === 'calendar' ? 'bg-cyan-600' : 'text-slate-400'}`}>
              <Calendar className="w-3 h-3" /> Calendar
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {activeTab === 'messages' && (
          <div className="space-y-3">
            {/* Message history */}
            <div className="min-h-[120px] max-h-[250px] overflow-y-auto space-y-2 pr-1">
              {messages.length === 0 ? (
                <div className="text-center py-6">
                  <MessageSquare className="w-6 h-6 text-slate-600 mx-auto mb-1" />
                  <p className="text-xs text-slate-500">No messages yet with {providerName}</p>
                  {!providerEmail && (
                    <p className="text-[10px] text-amber-400 mt-1">No email on file — run email finder first</p>
                  )}
                </div>
              ) : (
                <>
                  {messages.map((m, i) => (
                    <div key={i} className={`flex ${m.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] rounded-xl px-3 py-2 ${m.direction === 'outbound' ? 'bg-cyan-600/20 border border-cyan-500/20' : 'bg-slate-800 border border-slate-700'}`}>
                        <p className="text-xs text-slate-200 whitespace-pre-wrap">{m.content}</p>
                        <p className="text-[9px] text-slate-500 mt-1">{formatDateTimeET(m.timestamp)}</p>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Compose */}
            <div className="space-y-2">
              <Textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder={`Message to ${providerName}...`}
                className="min-h-[60px] text-xs bg-slate-800/50 border-slate-700 text-slate-200 placeholder:text-slate-500 resize-none"
              />
              <div className="flex items-center justify-between">
                <Button size="sm" variant="outline" onClick={generateDraft} disabled={generatingDraft}
                  className="h-7 text-[10px] gap-1 bg-transparent border-slate-700 text-violet-400 hover:bg-slate-800">
                  {generatingDraft ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  AI Draft
                </Button>
                <Button size="sm" onClick={sendMessage} disabled={sending || !newMessage.trim() || !providerEmail}
                  className="h-7 text-[10px] gap-1 bg-cyan-600 hover:bg-cyan-700">
                  {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                  Send
                </Button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'calendar' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400">Scheduled events with {providerName}</p>
              <Button size="sm" onClick={() => setShowNewEvent(!showNewEvent)}
                className="h-6 text-[10px] gap-1 bg-cyan-600 hover:bg-cyan-700">
                {showNewEvent ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                {showNewEvent ? 'Cancel' : 'New Event'}
              </Button>
            </div>

            {showNewEvent && (
              <div className="bg-slate-800/40 rounded-lg p-3 space-y-2 border border-slate-700/30">
                <Input value={eventForm.title} onChange={(e) => setEventForm(p => ({ ...p, title: e.target.value }))}
                  placeholder="Event title (e.g., Intro Call)" className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200" />
                <div className="grid grid-cols-2 gap-2">
                  <Input type="date" value={eventForm.date} onChange={(e) => setEventForm(p => ({ ...p, date: e.target.value }))}
                    className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200" />
                  <Input type="time" value={eventForm.time} onChange={(e) => setEventForm(p => ({ ...p, time: e.target.value }))}
                    className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200" />
                </div>
                <Input value={eventForm.notes} onChange={(e) => setEventForm(p => ({ ...p, notes: e.target.value }))}
                  placeholder="Notes (optional)" className="h-8 text-xs bg-slate-800 border-slate-700 text-slate-200" />
                <Button size="sm" onClick={addEvent} disabled={!eventForm.title || !eventForm.date}
                  className="h-7 text-[10px] w-full bg-emerald-600 hover:bg-emerald-700 gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Schedule
                </Button>
              </div>
            )}

            <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
              {events.length === 0 && !showNewEvent && (
                <div className="text-center py-6">
                  <Calendar className="w-6 h-6 text-slate-600 mx-auto mb-1" />
                  <p className="text-xs text-slate-500">No scheduled events</p>
                </div>
              )}
              {[...events].sort((a, b) => new Date(a.date) - new Date(b.date)).map(e => (
                <div key={e.id} className="flex items-center gap-2 bg-slate-800/40 rounded-lg p-2 border border-slate-700/30">
                  <Calendar className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-200">{e.title}</p>
                    <p className="text-[10px] text-slate-400">
                      {formatDateET(e.date)}{e.time ? ` at ${e.time}` : ''}
                    </p>
                    {e.notes && <p className="text-[9px] text-slate-500">{e.notes}</p>}
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => removeEvent(e.id)}
                    className="h-5 w-5 p-0 text-slate-600 hover:text-red-400">
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
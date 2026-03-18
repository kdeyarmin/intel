import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { X, Copy, Send } from 'lucide-react';
import { toast } from 'sonner';

export default function OutreachEmailPreview({ outreach, provider, onClose, onSend }) {
  const [_copied, setCopied] = useState('');

  const copyToClipboard = (text, section) => {
    navigator.clipboard.writeText(text);
    setCopied(section);
    setTimeout(() => setCopied(''), 2000);
  };

  if (!outreach || !provider) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl border-slate-700/40 bg-slate-900">
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle>Personalized Outreach Email</CardTitle>
            <div className="text-sm text-slate-400 mt-2">
              {provider.name} • {provider.specialty}
            </div>
          </div>
          <Button size="icon" variant="ghost" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Provider Info */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-slate-400">Provider</div>
              <div className="text-slate-200 font-medium">{provider.name}</div>
            </div>
            <div>
              <div className="text-slate-400">Recipient Email</div>
              <div className="text-slate-200 font-medium">{provider.email}</div>
            </div>
            <div>
              <div className="text-slate-400">Specialty</div>
              <div className="text-slate-200">{provider.specialty}</div>
            </div>
            <div>
              <div className="text-slate-400">Location</div>
              <div className="text-slate-200">{provider.location}</div>
            </div>
          </div>

          {/* Outreach Type */}
          <div className="flex flex-wrap gap-2">
            <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30">
              {outreach.type.replace(/_/g, ' ').toUpperCase()}
            </Badge>
            {outreach.tone && (
              <Badge variant="outline">Tone: {outreach.tone}</Badge>
            )}
          </div>

          {/* Subject Line */}
          <div className="space-y-2">
            <div className="text-sm font-medium text-slate-300">Subject Line</div>
            <div className="bg-slate-800/50 rounded p-3 text-sm text-slate-100 flex items-start justify-between gap-2">
              <div>{outreach.subject}</div>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 shrink-0"
                onClick={() => copyToClipboard(outreach.subject, 'subject')}
              >
                <Copy className="w-3 h-3" />
              </Button>
            </div>
          </div>

          {/* Email Body */}
          <div className="space-y-2">
            <div className="text-sm font-medium text-slate-300">Email Body</div>
            <div className="bg-slate-800/50 rounded p-4 text-sm text-slate-100 max-h-64 overflow-y-auto whitespace-pre-wrap font-sans">
              {outreach.body}
            </div>
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={() => copyToClipboard(outreach.body, 'body')}
              >
                <Copy className="w-3 h-3 mr-1.5" />
                Copy Body
              </Button>
            </div>
          </div>

          {/* Sending Recommendations */}
          <div className="space-y-3 bg-slate-800/30 rounded p-4">
            <div className="text-sm font-medium text-slate-300">Sending Recommendation</div>
            <div className="space-y-2 text-sm text-slate-300">
              <div>
                <span className="text-slate-400">Best Time:</span> {outreach.sending_recommendation.optimal_time}
              </div>
              <div>
                <span className="text-slate-400">Follow-up:</span> {outreach.sending_recommendation.follow_up_delay_days} days after send
              </div>
              {outreach.value_proposition && (
                <div>
                  <span className="text-slate-400">Value:</span> {outreach.value_proposition}
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button
              onClick={() => {
                onSend?.();
                toast.success('Email ready to send');
              }}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700"
            >
              <Send className="w-4 h-4" />
              Use This Email
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const TONES = [
  { value: 'professional', label: 'Professional' },
  { value: 'warm', label: 'Warm & Friendly' },
  { value: 'direct', label: 'Direct & Concise' },
  { value: 'consultative', label: 'Consultative' },
];

const GOALS = [
  { value: 'partnership', label: 'Partnership Inquiry' },
  { value: 'referral', label: 'Referral Program' },
  { value: 'introduction', label: 'Service Introduction' },
  { value: 'follow_up', label: 'Follow-Up' },
  { value: 'custom', label: 'Custom Goal' },
];

export default function AICampaignDrafter({ providers = [], onDraftReady }) {
  const [generating, setGenerating] = useState(false);
  const [tone, setTone] = useState('professional');
  const [goal, setGoal] = useState('partnership');
  const [customGoal, setCustomGoal] = useState('');

  const handleGenerate = async () => {
    if (providers.length === 0) {
      toast.error('No providers selected');
      return;
    }
    setGenerating(true);

    // Gather context from selected providers
    const specialties = [...new Set(providers.map(p => p.credential).filter(Boolean))];
    const states = [...new Set(providers.map(p => p._location_state).filter(Boolean))];
    const entityTypes = [...new Set(providers.map(p => p.entity_type).filter(Boolean))];
    const sampleNames = providers.slice(0, 3).map(p =>
      p.entity_type === 'Individual'
        ? `${p.first_name || ''} ${p.last_name || ''}`.trim()
        : p.organization_name || ''
    ).filter(Boolean);

    const goalText = goal === 'custom' ? customGoal : GOALS.find(g => g.value === goal)?.label || goal;

    const prompt = `You are an expert healthcare marketing copywriter. Draft an email campaign for outreach to healthcare providers.

AUDIENCE CONTEXT:
- ${providers.length} providers selected
- Credentials: ${specialties.join(', ') || 'Various'}
- Entity types: ${entityTypes.join(', ') || 'Mixed'}
- States: ${states.join(', ') || 'Various'}
- Sample provider names: ${sampleNames.join(', ') || 'N/A'}

CAMPAIGN GOAL: ${goalText}
TONE: ${tone}

REQUIREMENTS:
1. Write a compelling subject line using merge fields where appropriate
2. Write a body template that is personalized but works as a template
3. Use these merge fields: {{provider_name}}, {{first_name}}, {{specialty}}, {{location_city}}, {{location_state}}, {{organization_name}}
4. Keep the subject under 60 characters
5. Keep the body concise (150-250 words)
6. Include a clear call-to-action
7. Be respectful of the provider's time
8. Reference their specialty or location naturally
9. Do NOT use overly salesy language`;

    const res = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: "object",
        properties: {
          subject: { type: "string" },
          body: { type: "string" },
          tips: { type: "array", items: { type: "string" } },
        },
      },
    });

    onDraftReady({
      subject: res.subject || '',
      body: res.body || '',
      tips: res.tips || [],
    });

    setGenerating(false);
    toast.success('AI draft generated');
  };

  return (
    <div className="space-y-3 p-3 bg-violet-500/5 border border-violet-500/20 rounded-lg">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-violet-400" />
        <span className="text-xs font-semibold text-violet-300">AI Draft Assistant</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-slate-500 mb-1 block">Tone</label>
          <Select value={tone} onValueChange={setTone}>
            <SelectTrigger className="h-8 text-xs bg-slate-800/50 border-slate-700 text-slate-300">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TONES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-[10px] text-slate-500 mb-1 block">Goal</label>
          <Select value={goal} onValueChange={setGoal}>
            <SelectTrigger className="h-8 text-xs bg-slate-800/50 border-slate-700 text-slate-300">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GOALS.map(g => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {goal === 'custom' && (
        <Input
          placeholder="Describe your campaign goal..."
          value={customGoal}
          onChange={e => setCustomGoal(e.target.value)}
          className="h-8 text-xs bg-slate-800/50 border-slate-700 text-slate-200"
        />
      )}

      <Button
        onClick={handleGenerate}
        disabled={generating || providers.length === 0}
        size="sm"
        className="w-full bg-violet-600 hover:bg-violet-700 gap-2 text-xs"
      >
        {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
        {generating ? 'Drafting...' : 'Generate AI Draft'}
      </Button>
    </div>
  );
}
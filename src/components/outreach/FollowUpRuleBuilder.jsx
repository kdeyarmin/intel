import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, Clock, Eye, Mail, MessageSquare } from 'lucide-react';

const SEGMENT_OPTIONS = [
  { value: 'opened_no_response', label: 'Opened but not responded', icon: Eye, color: 'text-emerald-600' },
  { value: 'not_opened', label: 'Did not open', icon: Mail, color: 'text-slate-400' },
  { value: 'bounced', label: 'Bounced (retry)', icon: Mail, color: 'text-red-500' },
  { value: 'all_no_response', label: 'All without response', icon: MessageSquare, color: 'text-amber-500' },
];

const DEFAULT_RULE = {
  segment: 'opened_no_response',
  delay_days: 3,
  max_follow_ups: 2,
  enabled: true,
};

export default function FollowUpRuleBuilder({ rules = [], onChange }) {
  const addRule = () => {
    onChange([...rules, { ...DEFAULT_RULE, id: Date.now().toString() }]);
  };

  const updateRule = (idx, field, value) => {
    const updated = [...rules];
    updated[idx] = { ...updated[idx], [field]: value };
    onChange(updated);
  };

  const removeRule = (idx) => {
    onChange(rules.filter((_, i) => i !== idx));
  };

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm flex items-center gap-2">
          <Clock className="w-4 h-4 text-blue-500" />
          Follow-Up Rules
        </CardTitle>
        <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" onClick={addRule}>
          <Plus className="w-3 h-3" /> Add Rule
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {rules.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-3">No follow-up rules. Add one to automate re-engagement.</p>
        )}
        {rules.map((rule, idx) => {
          const seg = SEGMENT_OPTIONS.find(s => s.value === rule.segment);
          const SegIcon = seg?.icon || Mail;
          return (
            <div key={rule.id || idx} className="border rounded-lg p-3 bg-slate-50/50 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <SegIcon className={`w-3.5 h-3.5 ${seg?.color || ''}`} />
                  <span className="text-xs font-medium text-slate-700">Rule {idx + 1}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={rule.enabled} onCheckedChange={(v) => updateRule(idx, 'enabled', v)} />
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-400 hover:text-red-600" onClick={() => removeRule(idx)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-[10px]">Target Segment</Label>
                  <Select value={rule.segment} onValueChange={(v) => updateRule(idx, 'segment', v)}>
                    <SelectTrigger className="h-7 text-[10px] mt-0.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SEGMENT_OPTIONS.map(s => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px]">Delay (days)</Label>
                  <Input type="number" min={1} max={30} value={rule.delay_days}
                    onChange={(e) => updateRule(idx, 'delay_days', parseInt(e.target.value) || 1)}
                    className="h-7 text-[10px] mt-0.5" />
                </div>
                <div>
                  <Label className="text-[10px]">Max Follow-Ups</Label>
                  <Input type="number" min={1} max={5} value={rule.max_follow_ups}
                    onChange={(e) => updateRule(idx, 'max_follow_ups', parseInt(e.target.value) || 1)}
                    className="h-7 text-[10px] mt-0.5" />
                </div>
              </div>

              <div className="flex items-center gap-2 text-[9px] text-slate-400">
                <Clock className="w-2.5 h-2.5" />
                Send up to {rule.max_follow_ups} follow-up(s), {rule.delay_days} day(s) apart, to recipients who: {seg?.label?.toLowerCase()}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
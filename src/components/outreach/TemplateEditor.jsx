import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';

const MERGE_FIELDS = [
  { tag: '{{provider_name}}', desc: 'Full provider name' },
  { tag: '{{npi}}', desc: 'NPI number' },
  { tag: '{{specialty}}', desc: 'Primary specialty' },
  { tag: '{{city}}', desc: 'Practice city' },
  { tag: '{{state}}', desc: 'Practice state' },
  { tag: '{{score}}', desc: 'CareMetric fit score' },
  { tag: '{{referral_volume}}', desc: 'Total referrals' },
  { tag: '{{beneficiaries}}', desc: 'Medicare beneficiaries' },
  { tag: '{{organization}}', desc: 'Organization name' },
];

export default function TemplateEditor({ subject, onSubjectChange, body, onBodyChange }) {
  const insertField = (tag, target) => {
    if (target === 'subject') onSubjectChange(subject + tag);
    else onBodyChange(body + tag);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Email Template</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Merge Fields</Label>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {MERGE_FIELDS.map(f => (
              <Badge key={f.tag} variant="outline" className="cursor-pointer text-[10px] hover:bg-blue-50 hover:border-blue-300"
                onClick={() => insertField(f.tag, 'body')} title={f.desc}>
                {f.tag}
              </Badge>
            ))}
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Click a field to insert it at the end of the body</p>
        </div>
        <div>
          <Label>Subject Line</Label>
          <Input value={subject} onChange={(e) => onSubjectChange(e.target.value)}
            placeholder="e.g., Partnership Opportunity for {{provider_name}}" className="mt-1" />
        </div>
        <div>
          <Label>Email Body</Label>
          <Textarea value={body} onChange={(e) => onBodyChange(e.target.value)} rows={10}
            placeholder={"Dear {{provider_name}},\n\nI'm reaching out regarding a potential partnership opportunity...\n\nBased on your practice in {{city}}, {{state}} and your expertise in {{specialty}}, I believe we could...\n\nBest regards,\nCareMetric Team"}
            className="mt-1 font-mono text-xs" />
        </div>

        {/* Live preview */}
        <div className="border rounded-lg p-4 bg-slate-50">
          <p className="text-[10px] font-medium text-slate-400 uppercase mb-2">Preview (sample data)</p>
          <p className="text-sm font-medium text-slate-800 mb-2">
            {(subject || '(no subject)')
              .replace(/\{\{provider_name\}\}/g, 'Dr. Jane Smith')
              .replace(/\{\{npi\}\}/g, '1234567890')
              .replace(/\{\{specialty\}\}/g, 'Internal Medicine')
              .replace(/\{\{city\}\}/g, 'Philadelphia')
              .replace(/\{\{state\}\}/g, 'PA')
              .replace(/\{\{score\}\}/g, '85')
              .replace(/\{\{referral_volume\}\}/g, '142')
              .replace(/\{\{beneficiaries\}\}/g, '340')
              .replace(/\{\{organization\}\}/g, 'Smith Medical Group')}
          </p>
          <div className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed">
            {(body || '(no body)')
              .replace(/\{\{provider_name\}\}/g, 'Dr. Jane Smith')
              .replace(/\{\{npi\}\}/g, '1234567890')
              .replace(/\{\{specialty\}\}/g, 'Internal Medicine')
              .replace(/\{\{city\}\}/g, 'Philadelphia')
              .replace(/\{\{state\}\}/g, 'PA')
              .replace(/\{\{score\}\}/g, '85')
              .replace(/\{\{referral_volume\}\}/g, '142')
              .replace(/\{\{beneficiaries\}\}/g, '340')
              .replace(/\{\{organization\}\}/g, 'Smith Medical Group')}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
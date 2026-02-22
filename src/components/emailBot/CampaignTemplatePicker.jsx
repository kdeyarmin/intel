import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Bookmark, Save, Loader2, Trash2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

export default function CampaignTemplatePicker({ onSelect, currentSubject, currentBody }) {
  const [saving, setSaving] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveCategory, setSaveCategory] = useState('custom');
  const [showSave, setShowSave] = useState(false);
  const queryClient = useQueryClient();

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['campaignTemplates'],
    queryFn: () => base44.entities.CampaignTemplate.list('-use_count', 20),
    staleTime: 30000,
  });

  const handleSave = async () => {
    if (!saveName.trim() || !currentSubject || !currentBody) {
      toast.error('Template name, subject, and body are required');
      return;
    }
    setSaving(true);
    await base44.entities.CampaignTemplate.create({
      name: saveName.trim(),
      subject_template: currentSubject,
      body_template: currentBody,
      category: saveCategory,
      ai_generated: false,
      use_count: 0,
    });
    toast.success('Template saved');
    setSaving(false);
    setSaveName('');
    setShowSave(false);
    queryClient.invalidateQueries({ queryKey: ['campaignTemplates'] });
  };

  const handleDelete = async (id) => {
    await base44.entities.CampaignTemplate.delete(id);
    toast.success('Template deleted');
    queryClient.invalidateQueries({ queryKey: ['campaignTemplates'] });
  };

  const handleUse = async (template) => {
    onSelect({ subject: template.subject_template, body: template.body_template });
    // Increment use count
    await base44.entities.CampaignTemplate.update(template.id, {
      use_count: (template.use_count || 0) + 1,
    });
    queryClient.invalidateQueries({ queryKey: ['campaignTemplates'] });
  };

  const categoryColors = {
    introduction: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
    partnership: 'bg-violet-500/15 text-violet-400 border-violet-500/20',
    follow_up: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
    referral: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    custom: 'bg-slate-500/15 text-slate-400 border-slate-500/20',
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Bookmark className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-xs font-medium text-slate-300">Templates</span>
          <Badge className="bg-slate-500/15 text-slate-400 text-[9px]">{templates.length}</Badge>
        </div>
        <Button
          onClick={() => setShowSave(!showSave)}
          variant="ghost"
          size="sm"
          className="h-6 text-[10px] text-cyan-400 hover:text-cyan-300 gap-1 px-2"
          disabled={!currentSubject && !currentBody}
        >
          <Save className="w-3 h-3" /> Save Current
        </Button>
      </div>

      {showSave && (
        <div className="flex gap-2 p-2 bg-slate-800/40 rounded-lg border border-slate-700/30">
          <Input
            placeholder="Template name..."
            value={saveName}
            onChange={e => setSaveName(e.target.value)}
            className="h-7 text-xs bg-slate-800/50 border-slate-700 text-slate-200 flex-1"
          />
          <Select value={saveCategory} onValueChange={setSaveCategory}>
            <SelectTrigger className="h-7 w-[100px] text-[10px] bg-slate-800/50 border-slate-700 text-slate-300">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="introduction">Introduction</SelectItem>
              <SelectItem value="partnership">Partnership</SelectItem>
              <SelectItem value="follow_up">Follow-Up</SelectItem>
              <SelectItem value="referral">Referral</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleSave} disabled={saving} size="sm" className="h-7 bg-cyan-600 hover:bg-cyan-700 text-[10px] px-2">
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
          </Button>
        </div>
      )}

      {templates.length > 0 && (
        <div className="max-h-36 overflow-y-auto space-y-1">
          {templates.map(t => (
            <div
              key={t.id}
              className="flex items-center gap-2 p-2 bg-slate-800/30 rounded border border-slate-700/30 hover:border-cyan-500/30 cursor-pointer group transition-all"
              onClick={() => handleUse(t)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-200 truncate font-medium">{t.name}</span>
                  {t.ai_generated && <Sparkles className="w-2.5 h-2.5 text-violet-400 shrink-0" />}
                </div>
                <p className="text-[10px] text-slate-500 truncate">{t.subject_template}</p>
              </div>
              <Badge className={`text-[8px] shrink-0 border ${categoryColors[t.category] || categoryColors.custom}`}>
                {t.category}
              </Badge>
              <Button
                onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }}
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400"
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {templates.length === 0 && !isLoading && (
        <p className="text-[10px] text-slate-500 text-center py-2">No saved templates yet</p>
      )}
    </div>
  );
}
import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Plus, Loader2, Filter, ListChecks } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import AudienceFilterBuilder from './AudienceFilterBuilder';

export default function CampaignCreateDialog({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [audienceTab, setAudienceTab] = useState('lead_lists');
  const [form, setForm] = useState({
    name: '', description: '', goal: '', budget: '',
    target_conversion_rate: '', start_date: '', end_date: '',
    lead_list_ids: [],
  });
  const [audienceFilters, setAudienceFilters] = useState({});
  const [audienceCount, setAudienceCount] = useState(0);

  const { data: lists = [] } = useQuery({
    queryKey: ['leadLists'],
    queryFn: () => base44.entities.LeadList.list('-created_date'),
  });

  const toggleList = (id) => {
    setForm(prev => ({
      ...prev,
      lead_list_ids: prev.lead_list_ids.includes(id)
        ? prev.lead_list_ids.filter(x => x !== id)
        : [...prev.lead_list_ids, id],
    }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const data = {
      ...form,
      status: 'draft',
      budget: form.budget ? Number(form.budget) : undefined,
      target_conversion_rate: form.target_conversion_rate ? Number(form.target_conversion_rate) : undefined,
    };
    if (audienceTab === 'filters' && Object.keys(audienceFilters).length > 0) {
      data.audience_filters = audienceFilters;
      data.audience_size = audienceCount;
    }
    const campaign = await base44.entities.Campaign.create(data);
    setSaving(false);
    setOpen(false);
    setForm({ name: '', description: '', goal: '', budget: '', target_conversion_rate: '', start_date: '', end_date: '', lead_list_ids: [] });
    setAudienceFilters({});
    setAudienceCount(0);
    onCreated?.(campaign);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-cyan-600 hover:bg-cyan-700 gap-1.5">
          <Plus className="w-4 h-4" /> New Campaign
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-slate-100">Create Campaign</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Campaign basics */}
          <div>
            <Label className="text-slate-300">Campaign Name *</Label>
            <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g., Q1 Physician Outreach" className="bg-slate-800/50 border-slate-700 text-slate-200" />
          </div>
          <div>
            <Label className="text-slate-300">Description</Label>
            <Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Campaign objectives..." rows={2} className="bg-slate-800/50 border-slate-700 text-slate-200" />
          </div>

          {/* Goal setting */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-slate-300">Goal</Label>
              <Input value={form.goal} onChange={e => setForm(p => ({ ...p, goal: e.target.value }))} placeholder="e.g., 50 qualified leads" className="bg-slate-800/50 border-slate-700 text-slate-200" />
            </div>
            <div>
              <Label className="text-slate-300">Budget ($)</Label>
              <Input type="number" value={form.budget} onChange={e => setForm(p => ({ ...p, budget: e.target.value }))} placeholder="5000" className="bg-slate-800/50 border-slate-700 text-slate-200" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-slate-300">Start Date</Label>
              <Input type="date" value={form.start_date} onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))} className="bg-slate-800/50 border-slate-700 text-slate-200" />
            </div>
            <div>
              <Label className="text-slate-300">End Date</Label>
              <Input type="date" value={form.end_date} onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))} className="bg-slate-800/50 border-slate-700 text-slate-200" />
            </div>
          </div>
          <div>
            <Label className="text-slate-300">Target Conversion Rate (%)</Label>
            <Input type="number" value={form.target_conversion_rate} onChange={e => setForm(p => ({ ...p, target_conversion_rate: e.target.value }))} placeholder="15" className="bg-slate-800/50 border-slate-700 text-slate-200" />
          </div>

          {/* Audience selection */}
          <div>
            <Label className="text-slate-300 mb-2 block">Audience Selection</Label>
            <Tabs value={audienceTab} onValueChange={setAudienceTab}>
              <TabsList className="w-full grid grid-cols-2 bg-slate-800/50 h-9">
                <TabsTrigger value="lead_lists" className="text-xs gap-1 data-[state=active]:bg-slate-700">
                  <ListChecks className="w-3.5 h-3.5" /> Lead Lists
                </TabsTrigger>
                <TabsTrigger value="filters" className="text-xs gap-1 data-[state=active]:bg-slate-700">
                  <Filter className="w-3.5 h-3.5" /> Provider Filters
                </TabsTrigger>
              </TabsList>

              <TabsContent value="lead_lists" className="mt-2">
                <div className="space-y-1.5 max-h-40 overflow-y-auto border border-slate-700/50 rounded-lg p-2">
                  {lists.length === 0 && <p className="text-xs text-slate-500 text-center py-2">No lead lists available</p>}
                  {lists.map(list => (
                    <label key={list.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-slate-800/40 cursor-pointer">
                      <Checkbox checked={form.lead_list_ids.includes(list.id)} onCheckedChange={() => toggleList(list.id)} />
                      <span className="text-sm text-slate-200 flex-1">{list.name}</span>
                      <Badge variant="outline" className="text-[10px]">{list.provider_count || 0}</Badge>
                    </label>
                  ))}
                </div>
                {form.lead_list_ids.length > 0 && (
                  <p className="text-xs text-slate-400 mt-1">{form.lead_list_ids.length} list(s) selected</p>
                )}
              </TabsContent>

              <TabsContent value="filters" className="mt-2">
                <AudienceFilterBuilder
                  filters={audienceFilters}
                  onFiltersChange={setAudienceFilters}
                  onCountChange={setAudienceCount}
                />
              </TabsContent>
            </Tabs>
          </div>

          <Button onClick={handleSave} disabled={saving || !form.name.trim()} className="w-full gap-1.5 bg-cyan-600 hover:bg-cyan-700">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Create Campaign
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
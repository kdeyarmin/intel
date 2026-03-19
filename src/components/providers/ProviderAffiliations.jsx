import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Building2, Plus, CheckCircle2, XCircle, Sparkles, Loader2,
  Star, Pencil, Trash2, Bot
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

const TYPE_LABELS = {
  hospital: 'Hospital',
  medical_group: 'Medical Group',
  health_system: 'Health System',
  clinic: 'Clinic',
  academic: 'Academic',
  other: 'Other',
};

const TYPE_COLORS = {
  hospital: 'bg-blue-500/15 text-blue-400',
  medical_group: 'bg-violet-500/15 text-violet-400',
  health_system: 'bg-cyan-500/15 text-cyan-400',
  clinic: 'bg-emerald-500/15 text-emerald-400',
  academic: 'bg-amber-500/15 text-amber-400',
  other: 'bg-slate-500/15 text-slate-400',
};

const SOURCE_BADGES = {
  manual: { label: 'Manual', cls: 'bg-slate-700/50 text-slate-400' },
  ai_suggested: { label: 'AI Suggested', cls: 'bg-violet-500/15 text-violet-400' },
  nppes: { label: 'NPPES', cls: 'bg-cyan-500/15 text-cyan-400' },
  cms: { label: 'CMS', cls: 'bg-blue-500/15 text-blue-400' },
  enrichment: { label: 'Enriched', cls: 'bg-emerald-500/15 text-emerald-400' },
};

export default function ProviderAffiliations({ npi, provider, location, taxonomies }) {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [editAff, setEditAff] = useState(null);
  const [suggesting, setSuggesting] = useState(false);
  const [form, setForm] = useState({ affiliation_name: '', affiliation_type: 'hospital', role: '', is_primary: false, notes: '' });

  const { data: affiliations = [], isLoading } = useQuery({
    queryKey: ['providerAffiliations', npi],
    queryFn: () => base44.entities.ProviderAffiliation.filter({ npi }),
    enabled: !!npi,
  });

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.ProviderAffiliation.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['providerAffiliations', npi] }); setShowAdd(false); resetForm(); },
    onError: (err) => alert(`Failed to create affiliation: ${err.message}`),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ProviderAffiliation.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['providerAffiliations', npi] }); setEditAff(null); },
    onError: (err) => alert(`Failed to update affiliation: ${err.message}`),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.ProviderAffiliation.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['providerAffiliations', npi] }),
    onError: (err) => alert(`Failed to delete affiliation: ${err.message}`),
  });

  const resetForm = () => setForm({ affiliation_name: '', affiliation_type: 'hospital', role: '', is_primary: false, notes: '' });

  const handleAdd = () => {
    createMut.mutate({ npi, ...form, source: 'manual', status: 'confirmed', is_active: true });
  };

  const handleAISuggest = async () => {
    setSuggesting(true);
    const provName = provider?.entity_type === 'Individual'
      ? `${provider.first_name || ''} ${provider.last_name || ''}`.trim()
      : provider?.organization_name || npi;
    const spec = taxonomies?.find(t => t.primary_flag)?.taxonomy_description || '';
    const loc = location ? `${location.city || ''}, ${location.state || ''}` : '';

    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `Find hospital affiliations and medical group memberships for this healthcare provider. Search public directories, hospital websites, and medical databases.

Provider: ${provName}
NPI: ${npi}
Credential: ${provider?.credential || 'Unknown'}
Specialty: ${spec}
Location: ${loc}

Find:
1. Hospitals where they have privileges or are on staff
2. Medical groups or practices they belong to
3. Health systems they are part of
4. Academic appointments if any

Only return affiliations you can verify. Be specific with names.`,
      add_context_from_internet: true,
      response_json_schema: {
        type: "object",
        properties: {
          affiliations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                type: { type: "string", enum: ["hospital", "medical_group", "health_system", "clinic", "academic", "other"] },
                role: { type: "string" },
                city: { type: "string" },
                state: { type: "string" },
                confidence: { type: "string", enum: ["high", "medium", "low"] }
              }
            }
          }
        }
      }
    });

    const existing = affiliations.map(a => a.affiliation_name.toLowerCase());
    const newAffs = (res.affiliations || []).filter(a => a.name && !existing.includes(a.name.toLowerCase()));

    for (const aff of newAffs) {
      await base44.entities.ProviderAffiliation.create({
        npi,
        affiliation_name: aff.name,
        affiliation_type: aff.type || 'hospital',
        role: aff.role || '',
        city: aff.city || '',
        state: aff.state || '',
        source: 'ai_suggested',
        confidence: aff.confidence || 'medium',
        status: 'pending_review',
        is_active: true,
      });
    }

    queryClient.invalidateQueries({ queryKey: ['providerAffiliations', npi] });
    setSuggesting(false);
  };

  const confirmed = affiliations.filter(a => a.status === 'confirmed');
  const pending = affiliations.filter(a => a.status === 'pending_review');

  return (
    <Card className="bg-[#141d30] border-slate-700/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-cyan-400" />
            Affiliations
            {affiliations.length > 0 && <Badge className="bg-slate-700/50 text-slate-400 text-[10px]">{affiliations.length}</Badge>}
          </CardTitle>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1 bg-transparent border-slate-700 text-slate-400 hover:text-violet-400 hover:border-violet-500/30"
              onClick={handleAISuggest} disabled={suggesting}>
              {suggesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Bot className="w-3 h-3" />}
              AI Suggest
            </Button>
            <Button size="sm" className="h-7 text-[10px] gap-1 bg-cyan-600 hover:bg-cyan-700" onClick={() => setShowAdd(true)}>
              <Plus className="w-3 h-3" /> Add
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* Pending review items */}
        {pending.length > 0 && (
          <div className="mb-3">
            <p className="text-[10px] text-amber-400 font-medium mb-1.5 flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> {pending.length} pending review
            </p>
            {pending.map(a => (
              <div key={a.id} className="flex items-center justify-between p-2 rounded-lg border border-amber-500/20 bg-amber-500/5 mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  <Badge className={`text-[9px] ${TYPE_COLORS[a.affiliation_type] || ''}`}>{TYPE_LABELS[a.affiliation_type]}</Badge>
                  <span className="text-xs text-slate-300 truncate">{a.affiliation_name}</span>
                  {a.confidence && <Badge className={`text-[8px] ${a.confidence === 'high' ? 'bg-emerald-500/15 text-emerald-400' : a.confidence === 'medium' ? 'bg-amber-500/15 text-amber-400' : 'bg-red-500/15 text-red-400'}`}>{a.confidence}</Badge>}
                  <Badge className={`text-[8px] ${SOURCE_BADGES[a.source]?.cls || ''}`}>{SOURCE_BADGES[a.source]?.label}</Badge>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" className="h-6 w-6 p-0 bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => updateMut.mutate({ id: a.id, data: { status: 'confirmed' } })}>
                    <CheckCircle2 className="w-3 h-3" />
                  </Button>
                  <Button size="sm" variant="outline" className="h-6 w-6 p-0 text-red-400 border-red-500/30 hover:bg-red-500/10"
                    onClick={() => updateMut.mutate({ id: a.id, data: { status: 'rejected' } })}>
                    <XCircle className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Confirmed affiliations */}
        {confirmed.length === 0 && pending.length === 0 && !isLoading && (
          <p className="text-xs text-slate-500 text-center py-4">No affiliations yet. Add manually or use AI suggestions.</p>
        )}
        {confirmed.map(a => (
          <div key={a.id} className="flex items-center justify-between p-2 rounded-lg border border-slate-700/30 hover:bg-slate-800/30 group">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Badge className={`text-[9px] shrink-0 ${TYPE_COLORS[a.affiliation_type] || ''}`}>{TYPE_LABELS[a.affiliation_type]}</Badge>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-slate-200 truncate">{a.affiliation_name}</span>
                  {a.is_primary && <Star className="w-3 h-3 text-amber-400 shrink-0" />}
                </div>
                {(a.role || a.city) && (
                  <span className="text-[10px] text-slate-500">
                    {a.role}{a.role && a.city ? ' · ' : ''}{a.city}{a.state ? `, ${a.state}` : ''}
                  </span>
                )}
              </div>
              {a.source !== 'manual' && (
                <Badge className={`text-[8px] shrink-0 ${SOURCE_BADGES[a.source]?.cls || ''}`}>{SOURCE_BADGES[a.source]?.label}</Badge>
              )}
            </div>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-slate-500 hover:text-slate-300"
                onClick={() => setEditAff(a)}>
                <Pencil className="w-3 h-3" />
              </Button>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-slate-500 hover:text-red-400"
                onClick={() => deleteMut.mutate(a.id)}>
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>
        ))}

        {/* Add Dialog */}
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogContent className="bg-[#141d30] border-slate-700 max-w-md">
            <DialogHeader>
              <DialogTitle className="text-slate-200">Add Affiliation</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Organization name" value={form.affiliation_name}
                onChange={e => setForm({ ...form, affiliation_name: e.target.value })}
                className="bg-slate-800/50 border-slate-700 text-slate-300 placeholder:text-slate-600" />
              <Select value={form.affiliation_type} onValueChange={v => setForm({ ...form, affiliation_type: v })}>
                <SelectTrigger className="bg-slate-800/50 border-slate-700 text-slate-300"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input placeholder="Role (e.g., Attending, Staff)" value={form.role}
                onChange={e => setForm({ ...form, role: e.target.value })}
                className="bg-slate-800/50 border-slate-700 text-slate-300 placeholder:text-slate-600" />
              <Input placeholder="Notes" value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                className="bg-slate-800/50 border-slate-700 text-slate-300 placeholder:text-slate-600" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAdd(false)} className="bg-transparent border-slate-700 text-slate-400">Cancel</Button>
              <Button onClick={handleAdd} disabled={!form.affiliation_name || createMut.isPending}
                className="bg-cyan-600 hover:bg-cyan-700">
                {createMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={!!editAff} onOpenChange={o => { if (!o) setEditAff(null); }}>
          <DialogContent className="bg-[#141d30] border-slate-700 max-w-md">
            <DialogHeader>
              <DialogTitle className="text-slate-200">Edit Affiliation</DialogTitle>
            </DialogHeader>
            {editAff && (
              <div className="space-y-3">
                <Input value={editAff.affiliation_name}
                  onChange={e => setEditAff({ ...editAff, affiliation_name: e.target.value })}
                  className="bg-slate-800/50 border-slate-700 text-slate-300" />
                <Select value={editAff.affiliation_type} onValueChange={v => setEditAff({ ...editAff, affiliation_type: v })}>
                  <SelectTrigger className="bg-slate-800/50 border-slate-700 text-slate-300"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input placeholder="Role" value={editAff.role || ''}
                  onChange={e => setEditAff({ ...editAff, role: e.target.value })}
                  className="bg-slate-800/50 border-slate-700 text-slate-300 placeholder:text-slate-600" />
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditAff(null)} className="bg-transparent border-slate-700 text-slate-400">Cancel</Button>
              <Button onClick={() => updateMut.mutate({ id: editAff.id, data: { affiliation_name: editAff.affiliation_name, affiliation_type: editAff.affiliation_type, role: editAff.role } })}
                disabled={updateMut.isPending} className="bg-cyan-600 hover:bg-cyan-700">Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
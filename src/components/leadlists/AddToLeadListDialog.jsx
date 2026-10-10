import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MAX_MEMBERS_PER_SAVE, saveProvidersToLeadList } from './leadListService';

/**
 * Save a set of providers (by NPI) to a new or existing lead list.
 *
 * @param {{
 *   open: boolean;
 *   onOpenChange: (open: boolean) => void;
 *   npis: string[];
 *   defaultName?: string;
 *   filterCriteria?: object | null;
 *   onSaved?: (result: { list: object, added: number }) => void;
 * }} props
 */
export default function AddToLeadListDialog({ open, onOpenChange, npis, defaultName = '', filterCriteria = null, onSaved }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState('new');
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState('');
  const [listId, setListId] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(defaultName);
      setDescription('');
      setListId('');
      setMode('new');
    }
  }, [open, defaultName]);

  const { data: lists = [], isLoading: loadingLists } = useQuery({
    queryKey: ['leadLists', 'picker'],
    queryFn: () => base44.entities.LeadList.list('-created_date', 200),
    enabled: open,
  });

  const count = new Set(npis || []).size;
  const canSave = count > 0 && (mode === 'new' ? name.trim().length > 0 : !!listId);

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await saveProvidersToLeadList({
        listId: mode === 'existing' ? listId : undefined,
        name,
        description,
        filterCriteria,
        npis,
      });
      queryClient.invalidateQueries({ queryKey: ['leadLists'] });
      const parts = [`Added ${result.added.toLocaleString()} provider${result.added === 1 ? '' : 's'} to "${result.list.name}"`];
      if (result.skipped) parts.push(`${result.skipped.toLocaleString()} already on the list`);
      if (result.truncated) parts.push(`${result.truncated.toLocaleString()} over the ${MAX_MEMBERS_PER_SAVE.toLocaleString()} limit not added`);
      toast.success(parts.join(' · '), {
        action: {
          label: 'Open list',
          onClick: () => navigate(`${createPageUrl('LeadLists')}?list=${result.list.id}`),
        },
      });
      onSaved?.(result);
      onOpenChange(false);
    } catch (err) {
      toast.error(err.message || 'Could not save the lead list.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="max-w-md bg-[#0f1729] border-slate-700">
        <DialogHeader>
          <DialogTitle className="text-slate-100">Add to lead list</DialogTitle>
          <DialogDescription className="text-slate-400">
            {count.toLocaleString()} provider{count === 1 ? '' : 's'} will be added.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Destination">
            {[['new', 'New list'], ['existing', 'Existing list']].map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={mode === value}
                onClick={() => setMode(value)}
                className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                  mode === value
                    ? 'border-cyan-500/50 bg-cyan-900/30 text-cyan-300'
                    : 'border-slate-700 bg-slate-800/40 text-slate-400 hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === 'new' ? (
            <>
              <div className="space-y-1.5">
                <Label id="lead-list-name-label" htmlFor="lead-list-name" className="text-slate-300">List name</Label>
                <Input
                  id="lead-list-name"
                  aria-labelledby="lead-list-name-label"
                  value={name}
                  autoFocus
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && canSave && !saving) handleSave(); }}
                  placeholder="e.g. Pittsburgh cardiologists"
                />
              </div>
              <div className="space-y-1.5">
                <Label id="lead-list-description-label" htmlFor="lead-list-description" className="text-slate-300">Description (optional)</Label>
                <Textarea
                  id="lead-list-description"
                  aria-labelledby="lead-list-description-label"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="h-20"
                />
              </div>
            </>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="lead-list-existing" className="text-slate-300">List</Label>
              <Select value={listId} onValueChange={setListId}>
                <SelectTrigger id="lead-list-existing">
                  <SelectValue placeholder={loadingLists ? 'Loading lists…' : 'Choose a list'} />
                </SelectTrigger>
                <SelectContent>
                  {lists.map((l) => (
                    <SelectItem key={l.id} value={String(l.id)}>
                      {l.name} ({(l.member_count || 0).toLocaleString()})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!loadingLists && lists.length === 0 && (
                <p className="text-xs text-slate-500">No lists yet — create a new one instead.</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={!canSave || saving} className="bg-cyan-600 hover:bg-cyan-700">
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

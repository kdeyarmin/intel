import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Bookmark, Plus, Trash2, Star, ChevronDown } from 'lucide-react';

export default function SavedFilterBar({ page, currentFilters, onApplyFilter }) {
  const queryClient = useQueryClient();
  const [saveOpen, setSaveOpen] = useState(false);
  const [newName, setNewName] = useState('');

  const { data: savedFilters = [] } = useQuery({
    queryKey: ['savedFilters', page],
    queryFn: () => base44.entities.SavedFilter.filter({ page }),
    staleTime: 30000,
  });

  const saveMutation = useMutation({
    mutationFn: (data) => base44.entities.SavedFilter.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['savedFilters', page] });
      setSaveOpen(false);
      setNewName('');
    },
    onError: (err) => alert(`Failed to save filter: ${err.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.SavedFilter.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['savedFilters', page] }),
    onError: (err) => alert(`Failed to delete filter: ${err.message}`),
  });

  const toggleDefaultMutation = useMutation({
    mutationFn: async (filter) => {
      // Unset all others first
      for (const f of savedFilters.filter(sf => sf.is_default && sf.id !== filter.id)) {
        await base44.entities.SavedFilter.update(f.id, { is_default: false });
      }
      await base44.entities.SavedFilter.update(filter.id, { is_default: !filter.is_default });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['savedFilters', page] }),
    onError: (err) => alert(`Failed to update default filter: ${err.message}`),
  });

  const handleSave = () => {
    if (!newName.trim()) return;
    saveMutation.mutate({ name: newName.trim(), page, filters: currentFilters });
  };

  const hasActiveFilters = Object.values(currentFilters).some(v => v && v !== 'all' && v !== '');

  return (
    <div className="flex items-center gap-2">
      {/* Saved filters dropdown */}
      {savedFilters.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8">
              <Bookmark className="w-3.5 h-3.5" />
              Saved Filters
              <Badge variant="secondary" className="text-[10px] h-4 px-1 ml-0.5">{savedFilters.length}</Badge>
              <ChevronDown className="w-3 h-3 ml-0.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            {savedFilters.map(sf => (
              <DropdownMenuItem key={sf.id} className="flex items-center gap-2 cursor-pointer" onSelect={() => onApplyFilter(sf.filters)}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {sf.is_default && <Star className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />}
                    <span className="text-sm truncate">{sf.name}</span>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleDefaultMutation.mutate(sf); }}
                    className="p-0.5 hover:text-amber-500 text-slate-400 transition-colors"
                    title={sf.is_default ? 'Remove default' : 'Set as default'}
                  >
                    <Star className={`w-3 h-3 ${sf.is_default ? 'text-amber-500 fill-amber-500' : ''}`} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(sf.id); }}
                    className="p-0.5 hover:text-red-500 text-slate-400 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Save current filter */}
      {hasActiveFilters && (
        <Button variant="ghost" size="sm" className="gap-1.5 text-xs h-8 text-blue-600 hover:text-blue-700" onClick={() => setSaveOpen(true)}>
          <Plus className="w-3.5 h-3.5" />
          Save Filter
        </Button>
      )}

      {/* Save dialog */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Save Filter</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input
              placeholder="Filter name (e.g. Active MDs in NY)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              autoFocus
            />
            <div className="text-xs text-slate-500 space-y-1">
              <p className="font-medium">Current filters:</p>
              {Object.entries(currentFilters)
                .filter(([, v]) => v && v !== 'all' && v !== '')
                .map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-slate-400 capitalize">{k.replace(/([A-Z])/g, ' $1').trim()}</span>
                    <Badge variant="outline" className="text-[10px]">{v}</Badge>
                  </div>
                ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSaveOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={!newName.trim() || saveMutation.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
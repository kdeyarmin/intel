import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { UserPlus, Search, Loader2, Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function AddProviderDialog({ listId, existingNpis = [], onAdded }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(null);
  const [added, setAdded] = useState(new Set());

  const handleSearch = async () => {
    if (!search.trim()) return;
    setSearching(true);
    const query = search.trim();

    // Search by NPI or name
    let providers = [];
    if (/^\d+$/.test(query)) {
      providers = await base44.entities.Provider.filter({ npi: query }, undefined, 20);
    } else {
      const all = await base44.entities.Provider.list('-created_date', 200);
      const q = query.toLowerCase();
      providers = all.filter(p => {
        const name = p.entity_type === 'Individual'
          ? `${p.first_name} ${p.last_name}`.toLowerCase()
          : (p.organization_name || '').toLowerCase();
        return name.includes(q) || (p.npi || '').includes(q);
      }).slice(0, 20);
    }

    setResults(providers);
    setSearching(false);
  };

  const handleAdd = async (npi) => {
    setAdding(npi);
    await base44.entities.LeadListMember.create({
      lead_list_id: listId,
      npi,
      status: 'New',
    });
    setAdded(prev => new Set([...prev, npi]));
    setAdding(null);
    onAdded?.();
  };

  const alreadyIn = new Set([...existingNpis, ...added]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <UserPlus className="w-4 h-4" /> Add Provider
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Provider to List</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Search by NPI or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <Button onClick={handleSearch} disabled={searching} className="gap-1.5">
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Search
            </Button>
          </div>

          <div className="max-h-64 overflow-y-auto space-y-1">
            {results.length === 0 && !searching && (
              <p className="text-sm text-slate-500 text-center py-4">Search for providers to add</p>
            )}
            {results.map(p => {
              const name = p.entity_type === 'Individual'
                ? `${p.first_name} ${p.last_name}${p.credential ? ', ' + p.credential : ''}`
                : p.organization_name;
              const isIn = alreadyIn.has(p.npi);
              return (
                <div key={p.npi} className="flex items-center justify-between p-2 rounded-lg border border-slate-700/50 bg-slate-800/30">
                  <div>
                    <div className="text-sm font-medium text-slate-200">{name}</div>
                    <div className="text-xs text-slate-400">NPI: {p.npi}</div>
                  </div>
                  {isIn ? (
                    <Badge className="bg-green-900/40 text-green-400 border-green-800 gap-1">
                      <Check className="w-3 h-3" /> In list
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => handleAdd(p.npi)}
                      disabled={adding === p.npi}
                      className="gap-1"
                    >
                      {adding === p.npi ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
                      Add
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
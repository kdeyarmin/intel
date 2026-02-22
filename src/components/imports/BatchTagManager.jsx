import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Plus, Tag } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function BatchTagManager({ batch, onUpdate }) {
  const [newTag, setNewTag] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const tags = batch.tags || [];

  const addTag = async () => {
    const tag = newTag.trim().toLowerCase();
    if (!tag || tags.includes(tag)) return;
    const updated = [...tags, tag];
    await base44.entities.ImportBatch.update(batch.id, { tags: updated });
    onUpdate?.();
    setNewTag('');
    setIsAdding(false);
  };

  const removeTag = async (tagToRemove) => {
    const updated = tags.filter(t => t !== tagToRemove);
    await base44.entities.ImportBatch.update(batch.id, { tags: updated });
    onUpdate?.();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addTag(); }
    if (e.key === 'Escape') { setIsAdding(false); setNewTag(''); }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Tag className="w-3.5 h-3.5 text-slate-500" />
      {tags.map(tag => (
        <Badge key={tag} variant="outline" className="text-xs gap-1 pr-1 border-slate-600 text-slate-300 bg-slate-800/50">
          {tag}
          <button onClick={() => removeTag(tag)} className="text-slate-400 hover:text-red-400 ml-0.5">
            <X className="w-3 h-3" />
          </button>
        </Badge>
      ))}
      {isAdding ? (
        <div className="flex items-center gap-1">
          <Input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="tag name"
            className="h-6 w-24 text-xs bg-slate-800/50 border-slate-700 text-slate-300 placeholder:text-slate-600"
            autoFocus
          />
          <Button size="sm" variant="ghost" className="h-6 px-1 text-slate-400 hover:text-cyan-400" onClick={addTag}>
            <Plus className="w-3 h-3" />
          </Button>
        </div>
      ) : (
        <button
          onClick={() => setIsAdding(true)}
          className="text-xs text-slate-400 hover:text-cyan-400 flex items-center gap-0.5"
        >
          <Plus className="w-3 h-3" /> Add tag
        </button>
      )}
    </div>
  );
}
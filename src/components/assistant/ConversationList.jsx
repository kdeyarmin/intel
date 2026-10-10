import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MessageSquarePlus, Pencil, Trash2, Check, X } from 'lucide-react';

function when(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function RenameForm({ conversation, onRename, onDone }) {
  const [title, setTitle] = useState(conversation.title || '');
  const submit = async (e) => {
    e.preventDefault();
    if (title.trim()) await onRename(conversation.id, title.trim());
    onDone();
  };
  return (
    <form onSubmit={submit} className="flex items-center gap-1 px-2 py-1.5">
      <Input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onDone()}
        maxLength={200}
        aria-label="Conversation name"
        className="h-7 text-xs bg-slate-900 border-slate-600"
      />
      <Button type="submit" size="icon" variant="ghost" className="h-7 w-7 shrink-0 text-emerald-400" aria-label="Save name"><Check className="h-3.5 w-3.5" aria-hidden="true" /></Button>
      <Button type="button" size="icon" variant="ghost" className="h-7 w-7 shrink-0 text-slate-400" aria-label="Cancel renaming" onClick={onDone}><X className="h-3.5 w-3.5" aria-hidden="true" /></Button>
    </form>
  );
}

export default function ConversationList({ conversations, selectedId, onSelect, onNew, onRename, onDelete, loading }) {
  const [renaming, setRenaming] = useState(null);
  return (
    <nav aria-label="Conversations" className="flex h-full flex-col">
      <Button onClick={onNew} variant="outline" className="mb-2 justify-start gap-2 border-slate-700 bg-transparent text-slate-200 hover:bg-slate-800">
        <MessageSquarePlus className="h-4 w-4 text-violet-400" aria-hidden="true" /> New conversation
      </Button>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && <p className="px-2 py-3 text-xs text-slate-400">Loading…</p>}
        {!loading && conversations.length === 0 && <p className="px-2 py-3 text-xs text-slate-400">No conversations yet.</p>}
        <ul className="space-y-0.5">
          {conversations.map((c) => (
            <li key={c.id}>
              {renaming === c.id ? (
                <RenameForm conversation={c} onRename={onRename} onDone={() => setRenaming(null)} />
              ) : (
                <div className={`group flex items-center rounded-md ${c.id === selectedId ? 'bg-slate-800' : 'hover:bg-slate-800/60'}`}>
                  <button
                    type="button"
                    onClick={() => onSelect(c.id)}
                    aria-current={c.id === selectedId ? 'true' : undefined}
                    className="min-w-0 flex-1 px-2 py-1.5 text-left"
                  >
                    <span className="block truncate text-xs text-slate-200">{c.title || 'New conversation'}</span>
                    <span className="block text-[10px] text-slate-400">{when(c.updated_at)}</span>
                  </button>
                  <div className="flex shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400" aria-label={`Rename ${c.title || 'conversation'}`} onClick={() => setRenaming(c.id)}>
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-red-400" aria-label={`Delete ${c.title || 'conversation'}`} onClick={() => onDelete(c)}>
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Loader2, Calendar, Mail, Phone, UserCheck, Search, MoreHorizontal, Trash2 } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

const TYPE_ICONS = { email: Mail, call: Phone, follow_up: UserCheck, meeting: Calendar, research: Search, other: MoreHorizontal };
const TYPE_COLORS = { email: 'text-blue-400', call: 'text-green-400', follow_up: 'text-amber-400', meeting: 'text-violet-400', research: 'text-cyan-400', other: 'text-slate-400' };
const PRIORITY_COLORS = { low: 'bg-slate-500/15 text-slate-400', medium: 'bg-blue-500/15 text-blue-400', high: 'bg-amber-500/15 text-amber-400', urgent: 'bg-red-500/15 text-red-400' };
const STATUS_COLORS = { todo: 'bg-slate-500/15 text-slate-400', in_progress: 'bg-cyan-500/15 text-cyan-400', completed: 'bg-emerald-500/15 text-emerald-400', skipped: 'bg-slate-500/15 text-slate-500' };

export default function CampaignTaskManager({ campaignId }) {
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [newTask, setNewTask] = useState({ title: '', type: 'email', priority: 'medium', due_date: '' });
  const queryClient = useQueryClient();

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['campaignTasks', campaignId],
    queryFn: () => base44.entities.CampaignTask.filter({ campaign_id: campaignId }, '-created_date'),
  });

  const handleAdd = async () => {
    if (!newTask.title.trim()) return;
    setAdding(true);
    await base44.entities.CampaignTask.create({ ...newTask, campaign_id: campaignId });
    setNewTask({ title: '', type: 'email', priority: 'medium', due_date: '' });
    setShowAdd(false);
    setAdding(false);
    queryClient.invalidateQueries({ queryKey: ['campaignTasks', campaignId] });
  };

  const handleToggleComplete = async (task) => {
    const newStatus = task.status === 'completed' ? 'todo' : 'completed';
    await base44.entities.CampaignTask.update(task.id, {
      status: newStatus,
      completed_at: newStatus === 'completed' ? new Date().toISOString() : null,
    });
    queryClient.invalidateQueries({ queryKey: ['campaignTasks', campaignId] });
  };

  const handleStatusChange = async (task, newStatus) => {
    await base44.entities.CampaignTask.update(task.id, {
      status: newStatus,
      completed_at: newStatus === 'completed' ? new Date().toISOString() : null,
    });
    queryClient.invalidateQueries({ queryKey: ['campaignTasks', campaignId] });
  };

  const handleDelete = async (taskId) => {
    await base44.entities.CampaignTask.delete(taskId);
    queryClient.invalidateQueries({ queryKey: ['campaignTasks', campaignId] });
  };

  const filteredTasks = filterStatus === 'all' ? tasks : tasks.filter(t => t.status === filterStatus);
  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const progressPct = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;

  return (
    <Card className="bg-[#141d30] border-slate-700/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm text-slate-300 flex items-center gap-2">
            Tasks
            <Badge variant="outline" className="text-[10px]">{completedCount}/{tasks.length}</Badge>
            {tasks.length > 0 && (
              <span className="text-[10px] text-slate-500">{progressPct}% done</span>
            )}
          </CardTitle>
          <div className="flex gap-2">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-7 w-28 text-[10px] bg-slate-800/50 border-slate-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="todo">To Do</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-slate-700" onClick={() => setShowAdd(!showAdd)}>
              <Plus className="w-3 h-3" /> Add
            </Button>
          </div>
        </div>
        {/* Progress bar */}
        {tasks.length > 0 && (
          <div className="w-full h-1.5 bg-slate-700/60 rounded-full overflow-hidden mt-2">
            <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {/* Add task form */}
        {showAdd && (
          <div className="border border-slate-700/50 rounded-lg p-3 space-y-2 bg-slate-800/30">
            <Input value={newTask.title} onChange={e => setNewTask(p => ({ ...p, title: e.target.value }))} placeholder="Task title..." className="h-8 text-sm bg-slate-800/50 border-slate-700 text-slate-200" />
            <div className="grid grid-cols-3 gap-2">
              <Select value={newTask.type} onValueChange={v => setNewTask(p => ({ ...p, type: v }))}>
                <SelectTrigger className="h-7 text-[10px] bg-slate-800/50 border-slate-700"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['email', 'call', 'follow_up', 'meeting', 'research', 'other'].map(t => (
                    <SelectItem key={t} value={t} className="capitalize">{t.replace('_', ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={newTask.priority} onValueChange={v => setNewTask(p => ({ ...p, priority: v }))}>
                <SelectTrigger className="h-7 text-[10px] bg-slate-800/50 border-slate-700"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['low', 'medium', 'high', 'urgent'].map(p => (
                    <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input type="date" value={newTask.due_date} onChange={e => setNewTask(p => ({ ...p, due_date: e.target.value }))} className="h-7 text-[10px] bg-slate-800/50 border-slate-700 text-slate-200" />
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button size="sm" className="h-7 text-xs bg-cyan-600 hover:bg-cyan-700 gap-1" onClick={handleAdd} disabled={adding || !newTask.title.trim()}>
                {adding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />} Add Task
              </Button>
            </div>
          </div>
        )}

        {/* Task list */}
        {isLoading ? (
          <p className="text-xs text-slate-500 text-center py-4">Loading tasks...</p>
        ) : filteredTasks.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-4">
            {tasks.length === 0 ? 'No tasks yet — add outreach tasks to track progress' : 'No tasks match filter'}
          </p>
        ) : (
          <div className="space-y-1">
            {filteredTasks.map(task => {
              const Icon = TYPE_ICONS[task.type] || MoreHorizontal;
              const isComplete = task.status === 'completed';
              return (
                <div key={task.id} className={`flex items-center gap-2 p-2 rounded-lg border transition-colors ${isComplete ? 'bg-slate-800/20 border-slate-700/30' : 'bg-slate-800/40 border-slate-700/40 hover:border-slate-600/60'}`}>
                  <Checkbox checked={isComplete} onCheckedChange={() => handleToggleComplete(task)} />
                  <Icon className={`w-3.5 h-3.5 shrink-0 ${TYPE_COLORS[task.type]}`} />
                  <div className="flex-1 min-w-0">
                    <span className={`text-sm ${isComplete ? 'text-slate-500 line-through' : 'text-slate-200'}`}>{task.title}</span>
                    <div className="flex gap-1 mt-0.5">
                      <Badge className={`text-[9px] px-1 ${PRIORITY_COLORS[task.priority]}`}>{task.priority}</Badge>
                      {task.due_date && (
                        <span className="text-[9px] text-slate-500 flex items-center gap-0.5">
                          <Calendar className="w-2.5 h-2.5" />
                          {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0"><MoreHorizontal className="w-3 h-3" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {['todo', 'in_progress', 'completed', 'skipped'].map(s => (
                        <DropdownMenuItem key={s} onClick={() => handleStatusChange(task, s)} className="capitalize text-xs">{s.replace('_', ' ')}</DropdownMenuItem>
                      ))}
                      <DropdownMenuItem onClick={() => handleDelete(task.id)} className="text-red-400 text-xs">
                        <Trash2 className="w-3 h-3 mr-1" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
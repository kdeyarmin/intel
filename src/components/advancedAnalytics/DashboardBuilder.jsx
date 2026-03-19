import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Plus, Star, Trash2, LayoutDashboard, GripVertical } from 'lucide-react';

const WIDGET_TYPES = [
  { type: 'trend', label: 'Trend Analysis', desc: 'Multi-year trends with YoY growth' },
  { type: 'comparative', label: 'Comparative Analysis', desc: 'Compare by type, state, specialty' },
  { type: 'predictive', label: 'Predictive Analytics', desc: 'Forecasts and anomaly detection' },
];

export default function DashboardBuilder({ dashboards = [], activeId, onSelect, onWidgetsChange }) {
  const queryClient = useQueryClient();
  const [saveOpen, setSaveOpen] = useState(false);
  const [dashName, setDashName] = useState('');
  const [dashDesc, setDashDesc] = useState('');

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.AnalyticsDashboard.create(data),
    onSuccess: (d) => {
      queryClient.invalidateQueries({ queryKey: ['analyticsDashboards'] });
      setSaveOpen(false);
      setDashName('');
      setDashDesc('');
      onSelect(d.id);
    },
    onError: (err) => alert(`Failed to create dashboard: ${err.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.AnalyticsDashboard.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analyticsDashboards'] });
      onSelect(null);
    },
    onError: (err) => alert(`Failed to delete dashboard: ${err.message}`),
  });

  const favMutation = useMutation({
    mutationFn: (db) => base44.entities.AnalyticsDashboard.update(db.id, { is_favorite: !db.is_favorite }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['analyticsDashboards'] }),
    onError: (err) => alert(`Failed to update favorite: ${err.message}`),
  });

  const defaultMutation = useMutation({
    mutationFn: async (db) => {
      for (const d of dashboards.filter(x => x.is_default && x.id !== db.id)) {
        await base44.entities.AnalyticsDashboard.update(d.id, { is_default: false });
      }
      await base44.entities.AnalyticsDashboard.update(db.id, { is_default: !db.is_default });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['analyticsDashboards'] }),
    onError: (err) => alert(`Failed to update default dashboard: ${err.message}`),
  });

  const activeDashboard = dashboards.find(d => d.id === activeId);

  const addWidget = (type) => {
    if (!activeDashboard) return;
    const widgets = [...(activeDashboard.widgets || []), { type, id: Date.now().toString() }];
    base44.entities.AnalyticsDashboard.update(activeId, { widgets });
    onWidgetsChange(widgets);
    queryClient.invalidateQueries({ queryKey: ['analyticsDashboards'] });
  };

  const removeWidget = (widgetId) => {
    if (!activeDashboard) return;
    const widgets = (activeDashboard.widgets || []).filter(w => w.id !== widgetId);
    base44.entities.AnalyticsDashboard.update(activeId, { widgets });
    onWidgetsChange(widgets);
    queryClient.invalidateQueries({ queryKey: ['analyticsDashboards'] });
  };

  const handleSaveNew = () => {
    if (!dashName.trim()) return;
    createMutation.mutate({ name: dashName.trim(), description: dashDesc, widgets: [{ type: 'trend', id: '1' }, { type: 'comparative', id: '2' }, { type: 'predictive', id: '3' }] });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LayoutDashboard className="w-4 h-4 text-violet-500" />
            <CardTitle className="text-base">Dashboards</CardTitle>
          </div>
          <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={() => setSaveOpen(true)}>
            <Plus className="w-3 h-3" /> New
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {dashboards.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-4">No dashboards yet. Create one to get started.</p>
        ) : (
          dashboards.map(db => (
            <div
              key={db.id}
              onClick={() => onSelect(db.id)}
              className={`flex items-center gap-2 p-2.5 rounded-lg cursor-pointer transition-colors border ${
                activeId === db.id ? 'bg-violet-50 border-violet-200' : 'bg-white border-slate-100 hover:bg-slate-50'
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {db.is_default && <Badge className="text-[9px] bg-amber-100 text-amber-700 px-1 py-0">Default</Badge>}
                  <span className="text-sm font-medium text-slate-700 truncate">{db.name}</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">{(db.widgets || []).length} widgets</p>
              </div>
              <div className="flex gap-0.5 shrink-0">
                <button onClick={(e) => { e.stopPropagation(); favMutation.mutate(db); }} className="p-1 hover:text-amber-500 text-slate-300 transition-colors">
                  <Star className={`w-3.5 h-3.5 ${db.is_favorite ? 'text-amber-500 fill-amber-500' : ''}`} />
                </button>
                <button onClick={(e) => { e.stopPropagation(); defaultMutation.mutate(db); }} className="p-1 hover:text-violet-500 text-slate-300 transition-colors" title="Set default">
                  <LayoutDashboard className={`w-3.5 h-3.5 ${db.is_default ? 'text-violet-500' : ''}`} />
                </button>
                <button onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(db.id); }} className="p-1 hover:text-red-500 text-slate-300 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}

        {/* Widget management for active dashboard */}
        {activeDashboard && (
          <div className="pt-3 border-t mt-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Widgets</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="ghost" className="text-xs h-6 gap-1 text-violet-600">
                    <Plus className="w-3 h-3" /> Add Widget
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {WIDGET_TYPES.map(w => (
                    <DropdownMenuItem key={w.type} onClick={() => addWidget(w.type)}>
                      <div>
                        <p className="text-sm font-medium">{w.label}</p>
                        <p className="text-xs text-slate-400">{w.desc}</p>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {(activeDashboard.widgets || []).map((w) => (
              <div key={w.id} className="flex items-center gap-2 text-xs bg-slate-50 rounded px-2.5 py-1.5">
                <GripVertical className="w-3 h-3 text-slate-300" />
                <span className="flex-1 text-slate-600 capitalize">{w.type.replace('_', ' ')} Analysis</span>
                <button onClick={() => removeWidget(w.id)} className="text-slate-400 hover:text-red-500">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New Dashboard</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input placeholder="Dashboard name" value={dashName} onChange={(e) => setDashName(e.target.value)} autoFocus />
            <Input placeholder="Description (optional)" value={dashDesc} onChange={(e) => setDashDesc(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSaveOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSaveNew} disabled={!dashName.trim() || createMutation.isPending}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertTriangle, CheckCircle, XCircle, Sparkles, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import BulkAlertActions from './BulkAlertActions';
import AlertAIAnalysis from './AlertAIAnalysis';

const severityColors = {
  low: 'bg-blue-100 text-blue-700',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};

const categoryColors = {
  completeness: 'bg-blue-50 text-blue-600',
  accuracy: 'bg-purple-50 text-purple-600',
  timeliness: 'bg-amber-50 text-amber-600',
  consistency: 'bg-teal-50 text-teal-600',
};

const statusIcons = {
  open: <AlertTriangle className="w-4 h-4 text-amber-500" />,
  accepted: <CheckCircle className="w-4 h-4 text-green-500" />,
  rejected: <XCircle className="w-4 h-4 text-gray-400" />,
  auto_fixed: <CheckCircle className="w-4 h-4 text-blue-500" />,
};

export default function AlertsList({ alerts = [] }) {
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [filterStatus, setFilterStatus] = useState('open');
  const [expandedId, setExpandedId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const queryClient = useQueryClient();

  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleAll = (filtered) => {
    const openIds = filtered.filter(a => a.status === 'open').map(a => a.id);
    if (openIds.every(id => selectedIds.includes(id))) {
      setSelectedIds([]);
    } else {
      setSelectedIds(openIds);
    }
  };

  const applyFixMutation = useMutation({
    mutationFn: async (alertId) => {
      return base44.functions.invoke('runDataQualityScan', { action: 'apply_fix', alert_id: alertId });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dqAlerts'] }),
  });

  const dismissMutation = useMutation({
    mutationFn: async (alertId) => {
      return base44.functions.invoke('runDataQualityScan', { action: 'dismiss', alert_id: alertId });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dqAlerts'] }),
  });

  const filtered = alerts.filter(a => {
    if (filterCategory !== 'all' && a.category !== filterCategory) return false;
    if (filterSeverity !== 'all' && a.severity !== filterSeverity) return false;
    if (filterStatus !== 'all' && a.status !== filterStatus) return false;
    return true;
  });

  // Separate aggregate alerts from individual ones
  const aggregateAlerts = filtered.filter(a => a.affected_count > 1);
  const individualAlerts = filtered.filter(a => a.affected_count <= 1);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle className="text-base">Quality Alerts ({filtered.length})</CardTitle>
          <div className="flex gap-2 flex-wrap">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="accepted">Fixed</SelectItem>
                <SelectItem value="rejected">Dismissed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="completeness">Completeness</SelectItem>
                <SelectItem value="accuracy">Accuracy</SelectItem>
                <SelectItem value="timeliness">Timeliness</SelectItem>
                <SelectItem value="consistency">Consistency</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterSeverity} onValueChange={setFilterSeverity}>
              <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severity</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <BulkAlertActions
          selectedIds={selectedIds}
          alerts={alerts}
          onClear={() => setSelectedIds([])}
        />

        {filtered.length > 0 && filtered.some(a => a.status === 'open') && (
          <div className="flex items-center gap-2">
            <Checkbox
              checked={filtered.filter(a => a.status === 'open').every(a => selectedIds.includes(a.id))}
              onCheckedChange={() => toggleAll(filtered)}
            />
            <span className="text-xs text-slate-500">Select all open alerts</span>
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <CheckCircle className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No alerts match your filters</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[500px] overflow-auto">
            {aggregateAlerts.map(alert => (
              <AlertRow
                key={alert.id}
                alert={alert}
                expanded={expandedId === alert.id}
                onToggle={() => setExpandedId(expandedId === alert.id ? null : alert.id)}
                onApplyFix={() => applyFixMutation.mutate(alert.id)}
                onDismiss={() => dismissMutation.mutate(alert.id)}
                isFixing={applyFixMutation.isPending}
                selected={selectedIds.includes(alert.id)}
                onSelect={() => toggleSelect(alert.id)}
              />
            ))}
            {individualAlerts.map(alert => (
              <AlertRow
                key={alert.id}
                alert={alert}
                expanded={expandedId === alert.id}
                onToggle={() => setExpandedId(expandedId === alert.id ? null : alert.id)}
                onApplyFix={() => applyFixMutation.mutate(alert.id)}
                onDismiss={() => dismissMutation.mutate(alert.id)}
                isFixing={applyFixMutation.isPending}
                selected={selectedIds.includes(alert.id)}
                onSelect={() => toggleSelect(alert.id)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AlertRow({ alert, expanded, onToggle, onApplyFix, onDismiss, isFixing, selected, onSelect }) {
  return (
    <div className={`border rounded-lg transition-colors ${selected ? 'ring-2 ring-blue-300' : ''} ${alert.status === 'open' ? 'bg-white' : 'bg-slate-50 opacity-70'}`}>
      <div className="flex items-center gap-1 px-2 py-3">
        {alert.status === 'open' && (
          <Checkbox
            checked={selected}
            onCheckedChange={onSelect}
            onClick={(e) => e.stopPropagation()}
            className="ml-1"
          />
        )}
        <button onClick={onToggle} className="flex-1 flex items-center gap-3 px-2 text-left">
        {statusIcons[alert.status]}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-slate-800 truncate">{alert.summary}</span>
            {alert.suggested_value && <Sparkles className="w-3.5 h-3.5 text-violet-500 shrink-0" />}
          </div>
          <div className="flex gap-2 mt-1">
            <Badge variant="secondary" className={`text-[10px] ${categoryColors[alert.category] || ''}`}>{alert.category}</Badge>
            <Badge variant="secondary" className={`text-[10px] ${severityColors[alert.severity] || ''}`}>{alert.severity}</Badge>
            {alert.affected_count > 1 && (
              <span className="text-[10px] text-slate-400">{alert.affected_count} records</span>
            )}
          </div>
        </div>
        {expanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
        </button>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t bg-slate-50/50 space-y-3">
          <div className="grid grid-cols-2 gap-3 text-xs pt-3">
            {alert.entity_type && <div><span className="text-slate-400">Entity:</span> <span className="font-medium">{alert.entity_type}</span></div>}
            {alert.npi && <div><span className="text-slate-400">NPI:</span> <span className="font-mono">{alert.npi}</span></div>}
            {alert.field_name && <div><span className="text-slate-400">Field:</span> <span className="font-medium">{alert.field_name}</span></div>}
            {alert.current_value && <div><span className="text-slate-400">Current:</span> <span className="font-mono text-red-600">{alert.current_value}</span></div>}
          </div>

          {alert.suggested_value && (
            <div className="bg-violet-50 border border-violet-200 rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Sparkles className="w-3.5 h-3.5 text-violet-600" />
                <span className="text-xs font-semibold text-violet-700">AI Suggestion</span>
              </div>
              <p className="text-sm font-mono text-violet-900">{alert.suggested_value}</p>
              {alert.suggestion_reason && (
                <p className="text-xs text-violet-600 mt-1">{alert.suggestion_reason}</p>
              )}
            </div>
          )}

          {/* AI Root Cause & Solutions */}
          <AlertAIAnalysis alert={alert} />

          {alert.status === 'open' && (
            <div className="flex gap-2 pt-1">
              {alert.suggested_value && (
                <Button
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); onApplyFix(); }}
                  disabled={isFixing}
                  className="bg-green-600 hover:bg-green-700 text-xs h-7"
                >
                  {isFixing ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <CheckCircle className="w-3 h-3 mr-1" />}
                  Apply Fix
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => { e.stopPropagation(); onDismiss(); }}
                className="text-xs h-7"
              >
                Dismiss
              </Button>
            </div>
          )}

          {alert.resolved_at && (
            <p className="text-[10px] text-slate-400">
              {alert.status === 'accepted' ? 'Fixed' : 'Dismissed'} by {alert.resolved_by || 'system'} on {new Date(alert.resolved_at).toLocaleString()}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
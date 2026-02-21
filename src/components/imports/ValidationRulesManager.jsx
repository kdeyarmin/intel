import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Plus, Search, ShieldCheck, ShieldAlert, AlertTriangle, Flag,
  Pencil, Trash2, Loader2, Copy, GripVertical, Sparkles
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import ValidationRuleEditor from './ValidationRuleEditor';
import AIRuleSuggestions from './AIRuleSuggestions';

const IMPORT_TYPE_LABELS = {
  '_global': 'All Import Types (Global)',
  'nppes_monthly': 'NPPES Monthly',
  'nppes_registry': 'NPPES Registry',
  'cms_utilization': 'CMS Utilization',
  'cms_part_d': 'CMS Part D',
  'cms_order_referring': 'Order & Referring',
  'provider_service_utilization': 'Provider Service Util',
  'hospice_enrollments': 'Hospice Enrollments',
  'home_health_enrollments': 'HH Enrollments',
  'home_health_cost_reports': 'HH Cost Reports',
  'nursing_home_chains': 'Nursing Home Chains',
  'home_health_pdgm': 'HH PDGM',
  'inpatient_drg': 'Inpatient DRG',
  'provider_ownership': 'Provider Ownership',
  'medicare_hha_stats': 'Medicare HHA Stats',
  'medicare_ma_inpatient': 'Medicare MA Inpatient',
  'medicare_part_d_stats': 'Medicare Part D Stats',
  'medicare_snf_stats': 'Medicare SNF Stats',
};

const RULE_TYPE_LABELS = {
  required: 'Required',
  regex: 'Regex',
  numeric_range: 'Range',
  enum_values: 'Enum',
  max_length: 'Max Length',
  date_format: 'Date Format',
  cross_field: 'Cross-Field',
  unique: 'Unique',
  custom_expression: 'Custom',
};

const SEVERITY_STYLES = {
  reject: { icon: ShieldAlert, color: 'text-red-400', bg: 'bg-red-500/15' },
  warn: { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/15' },
  flag: { icon: Flag, color: 'text-blue-400', bg: 'bg-blue-500/15' },
};

function getRuleSummary(rule) {
  const c = rule.config || {};
  switch (rule.rule_type) {
    case 'required': return 'must not be empty';
    case 'regex': return `match /${c.pattern || '...'}/`;
    case 'numeric_range': {
      const parts = [];
      if (c.min !== undefined && c.min !== null) parts.push(`≥ ${c.min}`);
      if (c.max !== undefined && c.max !== null) parts.push(`≤ ${c.max}`);
      return parts.join(' and ') || 'any number';
    }
    case 'enum_values': return `one of: ${(c.values || []).slice(0, 3).join(', ')}${(c.values || []).length > 3 ? '...' : ''}`;
    case 'max_length': return `length ≤ ${c.max_length || '?'}`;
    case 'date_format': return `format: ${c.date_format || '?'}`;
    case 'cross_field': return `${rule.column} ${c.operator || '?'} ${c.other_column || '?'}`;
    case 'unique': return 'no duplicates';
    case 'custom_expression': return c.expression ? `${c.expression.substring(0, 40)}${c.expression.length > 40 ? '...' : ''}` : 'custom check';
    default: return '';
  }
}

export default function ValidationRulesManager() {
  const [selectedType, setSelectedType] = useState('_global');
  const [searchQuery, setSearchQuery] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [deleteRule, setDeleteRule] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [showAISuggestions, setShowAISuggestions] = useState(false);
  const queryClient = useQueryClient();

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['validationRules'],
    queryFn: () => base44.entities.ImportValidationRule.list('-created_date', 200),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['validationRules'] });

  // Group rules by import type
  const rulesByType = useMemo(() => {
    const map = {};
    for (const r of rules) {
      const t = r.import_type || '_global';
      if (!map[t]) map[t] = [];
      map[t].push(r);
    }
    // Sort each group by order
    for (const t of Object.keys(map)) {
      map[t].sort((a, b) => (a.order || 0) - (b.order || 0));
    }
    return map;
  }, [rules]);

  // Types that have rules
  const typesWithRules = useMemo(() => {
    const types = new Set(Object.keys(rulesByType));
    types.add('_global');
    return types;
  }, [rulesByType]);

  const displayRules = useMemo(() => {
    let list = rulesByType[selectedType] || [];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(r =>
        (r.rule_name || '').toLowerCase().includes(q) ||
        (r.column || '').toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [rulesByType, selectedType, searchQuery]);

  const handleToggle = async (rule) => {
    await base44.entities.ImportValidationRule.update(rule.id, { enabled: !rule.enabled });
    refresh();
  };

  const handleDelete = async () => {
    if (!deleteRule) return;
    setDeletingId(deleteRule.id);
    await base44.entities.ImportValidationRule.delete(deleteRule.id);
    setDeleteRule(null);
    setDeletingId(null);
    refresh();
  };

  const handleDuplicate = async (rule) => {
    const { id, created_date, updated_date, created_by, ...data } = rule;
    await base44.entities.ImportValidationRule.create({
      ...data,
      rule_name: `${data.rule_name} (copy)`,
    });
    refresh();
  };

  // All import types for sidebar
  const allTypes = ['_global', ...Object.keys(IMPORT_TYPE_LABELS).filter(k => k !== '_global')];

  const globalCount = (rulesByType['_global'] || []).length;
  const typeCount = (rulesByType[selectedType] || []).length;

  return (
    <div className="flex gap-4 h-full">
      {/* Sidebar: import type selector */}
      <div className="w-56 flex-shrink-0 space-y-1 overflow-y-auto">
        <p className="text-xs font-semibold text-slate-500 px-2 mb-2">Import Types</p>
        {allTypes.map(t => {
          const count = (rulesByType[t] || []).length;
          const isActive = selectedType === t;
          return (
            <button
              key={t}
              onClick={() => setSelectedType(t)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors ${
                isActive
                  ? 'bg-slate-700/60 text-white'
                  : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
              }`}
            >
              <span className="truncate">{IMPORT_TYPE_LABELS[t] || t}</span>
              {count > 0 && (
                <Badge className={`${isActive ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-700/50 text-slate-500'} text-[9px] ml-2`}>
                  {count}
                </Badge>
              )}
            </button>
          );
        })}
      </div>

      {/* Main area */}
      <div className="flex-1 min-w-0 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-200">
              {IMPORT_TYPE_LABELS[selectedType] || selectedType}
            </h2>
            <p className="text-xs text-slate-500">
              {typeCount} rule{typeCount !== 1 ? 's' : ''}
              {selectedType !== '_global' && globalCount > 0 && ` + ${globalCount} global`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search rules..."
                className="h-8 w-40 pl-7 text-xs bg-slate-800/50 border-slate-700 text-slate-300 placeholder:text-slate-600"
              />
            </div>
            <Button
              onClick={() => { setEditingRule(null); setEditorOpen(true); }}
              className="bg-cyan-600 hover:bg-cyan-700 text-white"
              size="sm"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Rule
            </Button>
          </div>
        </div>

        {/* Global rules banner */}
        {selectedType !== '_global' && globalCount > 0 && (
          <div className="bg-violet-500/10 border border-violet-500/20 rounded-lg p-2.5 text-xs text-violet-400 flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{globalCount} global rule{globalCount !== 1 ? 's' : ''} will also apply to this import type.</span>
            <button className="underline ml-auto" onClick={() => setSelectedType('_global')}>View global rules</button>
          </div>
        )}

        {/* AI Suggestions (for specific import types) */}
         {selectedType !== '_global' && !showAISuggestions && (
           <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
             <div className="flex items-center justify-between gap-2">
               <div className="flex items-center gap-2">
                 <Sparkles className="w-4 h-4 text-amber-400 flex-shrink-0" />
                 <div className="min-w-0">
                   <p className="text-xs font-medium text-amber-400">AI Rule Suggestions</p>
                   <p className="text-[10px] text-amber-400/70">Generate rules from historical error patterns</p>
                 </div>
               </div>
               <Button
                 size="sm"
                 variant="outline"
                 className="h-7 text-xs bg-transparent border-amber-500/30 text-amber-400 hover:bg-amber-500/10 flex-shrink-0"
                 onClick={() => setShowAISuggestions(true)}
               >
                 View Suggestions
               </Button>
             </div>
           </div>
         )}

         {showAISuggestions && selectedType !== '_global' && (
           <Card className="border-amber-500/30 bg-amber-500/5">
             <CardContent className="pt-6">
               <Button
                 size="sm"
                 variant="ghost"
                 className="mb-3 text-xs text-slate-500 hover:text-slate-400"
                 onClick={() => setShowAISuggestions(false)}
               >
                 ← Back to rules
               </Button>
               <AIRuleSuggestions importType={selectedType} />
             </CardContent>
           </Card>
         )}

        {/* Rules list */}
         {!showAISuggestions && (
         <>
         {isLoading ? (
           <div className="text-center py-12 text-slate-500">
             <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin" />
             <p>Loading rules...</p>
           </div>
         ) : displayRules.length === 0 ? (
           <div className="text-center py-16 text-slate-500">
             <ShieldCheck className="w-12 h-12 mx-auto mb-3 opacity-30" />
             <p className="font-medium">No validation rules</p>
             <p className="text-xs mt-1 text-slate-600">Add rules to automatically validate data before import</p>
           </div>
         ) : (
          <div className="space-y-2">
            {displayRules.map(rule => {
              const sev = SEVERITY_STYLES[rule.severity] || SEVERITY_STYLES.reject;
              const SevIcon = sev.icon;
              return (
                <div
                  key={rule.id}
                  className={`flex items-center gap-3 p-3 border rounded-lg transition-colors ${
                    rule.enabled ? 'border-slate-700/50 hover:bg-slate-800/30' : 'border-slate-800/50 opacity-50'
                  }`}
                >
                  <GripVertical className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-200">{rule.rule_name}</span>
                      <Badge className="bg-slate-700/50 text-slate-400 text-[9px]">{RULE_TYPE_LABELS[rule.rule_type]}</Badge>
                      <Badge className={`${sev.bg} ${sev.color} text-[9px]`}>
                        <SevIcon className="w-2.5 h-2.5 mr-0.5" />
                        {rule.severity}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      <code className="text-cyan-400/80">{rule.column}</code>
                      {' — '}
                      {rule.description || getRuleSummary(rule)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <Switch
                      checked={rule.enabled !== false}
                      onCheckedChange={() => handleToggle(rule)}
                    />
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-500 hover:text-slate-200" onClick={() => { setEditingRule(rule); setEditorOpen(true); }}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-500 hover:text-slate-200" onClick={() => handleDuplicate(rule)}>
                      <Copy className="w-3 h-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-500 hover:text-red-400" onClick={() => setDeleteRule(rule)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
            </div>
            )}
            </>
            )}
            </div>

      {/* Editor Dialog */}
      <ValidationRuleEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        rule={editingRule}
        importType={selectedType}
        onSaved={refresh}
      />

      {/* Delete Confirmation */}
      <Dialog open={!!deleteRule} onOpenChange={(open) => { if (!open) setDeleteRule(null); }}>
        <DialogContent className="bg-[#141d30] border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-slate-200">Delete Validation Rule</DialogTitle>
            <DialogDescription className="text-slate-500">
              This will permanently remove this validation rule. Data already imported won't be affected.
            </DialogDescription>
          </DialogHeader>
          {deleteRule && (
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3 text-sm space-y-1">
              <p className="font-medium text-slate-200">{deleteRule.rule_name}</p>
              <p className="text-xs text-slate-500">Column: {deleteRule.column} — {getRuleSummary(deleteRule)}</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteRule(null)} className="bg-transparent border-slate-700 text-slate-300">Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deletingId === deleteRule?.id}>
              {deletingId === deleteRule?.id ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Delete Rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
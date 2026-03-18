import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
  Sparkles, Plus, Check, Loader2, ChevronDown, ChevronRight, ShieldCheck, Lightbulb, Settings
} from 'lucide-react';

const RULE_TYPE_LABELS = {
  required: 'Required', regex: 'Regex', numeric_range: 'Range',
  enum_values: 'Enum', max_length: 'Max Length', date_format: 'Date Format',
  cross_field: 'Cross-Field', unique: 'Unique', custom_expression: 'Custom',
};

function classifyErrorForSuggestion(msg) {
  const lower = (msg || '').toLowerCase();
  if (lower.includes('required') || lower.includes('missing') || lower.includes('empty') || lower.includes('blank')) return 'required';
  if (lower.includes('regex') || lower.includes('pattern') || lower.includes('format') || lower.includes('invalid npi') || lower.includes('10 digits')) return 'regex';
  if (lower.includes('range') || lower.includes('too high') || lower.includes('too low') || lower.includes('negative')) return 'numeric_range';
  if (lower.includes('enum') || lower.includes('invalid value') || lower.includes('not in')) return 'enum_values';
  if (lower.includes('length') || lower.includes('too long')) return 'max_length';
  if (lower.includes('date')) return 'date_format';
  if (lower.includes('duplicate') || lower.includes('unique')) return 'unique';
  return null;
}

function extractColumnFromMessage(msg) {
  if (!msg) return null;
  const match = msg.match(/(?:field|column|property)\s*[:'"]?\s*(\w+)/i);
  return match ? match[1] : null;
}

function buildRuleConfig(ruleType) {
  switch (ruleType) {
    case 'required': return {};
    case 'regex': return { pattern: '.*' };
    case 'numeric_range': return { min: 0 };
    case 'max_length': return { max_length: 255 };
    case 'date_format': return { date_format: 'YYYY-MM-DD' };
    case 'unique': return {};
    case 'enum_values': return { values: [] };
    default: return {};
  }
}

export default function AIRuleSuggestions({ importType }) {
  const [expandedSuggestion, setExpandedSuggestion] = useState(null);
  const [addedRules, setAddedRules] = useState(new Set());
  const [customizing, setCustomizing] = useState(null);
  const [customConfig, setCustomConfig] = useState({});
  const queryClient = useQueryClient();

  // Fetch recent failed batches for this import type
  const { data: recentBatches = [] } = useQuery({
    queryKey: ['recentFailedBatches', importType],
    queryFn: async () => {
      const all = await base44.entities.ImportBatch.filter(
        { import_type: importType, status: 'failed' },
        '-created_date',
        20
      );
      return all;
    },
    enabled: !!importType,
  });

  // Fetch existing rules
  const { data: existingRules = [] } = useQuery({
    queryKey: ['existingRulesForSuggestion', importType],
    queryFn: async () => {
      const all = await base44.entities.ImportValidationRule.list('-created_date', 200);
      return all.filter(r => r.import_type === importType || r.import_type === '_global');
    },
    enabled: !!importType,
  });

  // Analyze errors and generate suggestions
  const suggestions = useMemo(() => {
    const allErrors = recentBatches.flatMap(b => b.error_samples || []);
    if (allErrors.length === 0) return [];

    // Group errors by type + column
    const errorGroups = {};
    for (const err of allErrors) {
      const ruleType = classifyErrorForSuggestion(err.message);
      if (!ruleType) continue;
      const column = extractColumnFromMessage(err.message) || err.field || err.column || 'unknown';
      const key = `${ruleType}__${column}`;
      if (!errorGroups[key]) {
        errorGroups[key] = { ruleType, column, count: 0, samples: [], batches: new Set() };
      }
      errorGroups[key].count++;
      if (errorGroups[key].samples.length < 3) errorGroups[key].samples.push(err.message);
      // Find which batch this error came from
      for (const b of recentBatches) {
        if ((b.error_samples || []).includes(err)) {
          errorGroups[key].batches.add(b.id);
        }
      }
    }

    // Filter out suggestions where a matching rule already exists
    const existingRuleKeys = new Set(
      existingRules.map(r => `${r.rule_type}__${r.column}`)
    );

    return Object.values(errorGroups)
      .filter(g => g.count >= 2 && g.column !== 'unknown' && !existingRuleKeys.has(`${g.ruleType}__${g.column}`))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
      .map((g, i) => ({
        id: `suggestion_${i}`,
        ruleType: g.ruleType,
        column: g.column,
        errorCount: g.count,
        batchCount: g.batches.size,
        samples: g.samples,
        confidence: g.count >= 10 ? 'high' : g.count >= 5 ? 'medium' : 'low',
        ruleName: `Auto: ${RULE_TYPE_LABELS[g.ruleType] || g.ruleType} check on ${g.column}`,
        description: generateDescription(g.ruleType, g.column, g.count),
      }));
  }, [recentBatches, existingRules]);

  const createRuleMutation = useMutation({
    mutationFn: async (suggestion, useCustomConfig = false) => {
      const config = useCustomConfig && customConfig[suggestion.id] 
        ? customConfig[suggestion.id] 
        : buildRuleConfig(suggestion.ruleType);
      
      await base44.entities.ImportValidationRule.create({
        import_type: importType,
        rule_name: suggestion.ruleName,
        description: suggestion.description,
        column: suggestion.column,
        rule_type: suggestion.ruleType,
        config,
        severity: 'reject',
        enabled: true,
        order: 100,
      });
    },
    onSuccess: (_, suggestion) => {
      setAddedRules(prev => new Set(prev).add(suggestion.id));
      setCustomizing(null);
      queryClient.invalidateQueries({ queryKey: ['existingRulesForSuggestion'] });
      queryClient.invalidateQueries({ queryKey: ['validationRulesForBatch'] });
    },
  });

  const handleCustomize = (suggestion) => {
    setCustomizing(suggestion.id);
    const baseConfig = buildRuleConfig(suggestion.ruleType);
    setCustomConfig(prev => ({
      ...prev,
      [suggestion.id]: { ...baseConfig }
    }));
  };

  if (!importType) return null;

  if (suggestions.length === 0) {
    return (
      <div className="text-center py-4">
        <ShieldCheck className="w-6 h-6 mx-auto mb-2 text-emerald-400/40" />
        <p className="text-xs text-slate-500">No rule suggestions — error patterns are already covered or insufficient data.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-amber-400" />
        <span className="text-sm font-semibold text-slate-200">AI Rule Suggestions</span>
        <Badge className="bg-amber-500/15 text-amber-400 border border-amber-500/20 text-[10px]">
          {suggestions.length} suggestion{suggestions.length !== 1 ? 's' : ''}
        </Badge>
      </div>
      <p className="text-xs text-slate-500">
        Based on {recentBatches.length} recent failed import{recentBatches.length !== 1 ? 's' : ''}, these rules could prevent recurring errors.
      </p>

      <div className="space-y-2">
        {suggestions.map(s => {
          const isExpanded = expandedSuggestion === s.id;
          const isAdded = addedRules.has(s.id);
          const isAdding = createRuleMutation.isPending && createRuleMutation.variables?.id === s.id;

          return (
            <Card key={s.id} className="border-slate-700/50 bg-slate-800/30">
              <CardContent className="p-0">
                <button
                  onClick={() => setExpandedSuggestion(isExpanded ? null : s.id)}
                  className="w-full flex items-start gap-3 p-3 text-left hover:bg-slate-700/20 transition-colors rounded-t-xl"
                >
                  <Lightbulb className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                    s.confidence === 'high' ? 'text-amber-400' : s.confidence === 'medium' ? 'text-amber-400/70' : 'text-amber-400/40'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium text-slate-200">{s.ruleName}</span>
                      <Badge className="bg-slate-700/50 text-slate-500 text-[8px]">
                        {RULE_TYPE_LABELS[s.ruleType]}
                      </Badge>
                      <Badge className={`text-[8px] ${
                        s.confidence === 'high' ? 'bg-emerald-500/15 text-emerald-400' :
                        s.confidence === 'medium' ? 'bg-amber-500/15 text-amber-400' :
                        'bg-slate-500/15 text-slate-400'
                      }`}>
                        {s.confidence} confidence
                      </Badge>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {s.errorCount} error{s.errorCount !== 1 ? 's' : ''} across {s.batchCount} batch{s.batchCount !== 1 ? 'es' : ''}
                    </p>
                  </div>
                  {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
                </button>

                {isExpanded && (
                  <div className="px-3 pb-3 space-y-2.5 border-t border-slate-700/30 pt-2.5">
                    <p className="text-xs text-slate-400">{s.description}</p>
                    
                    {/* Sample errors */}
                    <div>
                      <p className="text-[10px] text-slate-500 mb-1">Sample errors that triggered this suggestion:</p>
                      {s.samples.map((sample, i) => (
                        <div key={i} className="text-[11px] text-slate-400 bg-slate-900/50 rounded px-2 py-1 mb-1 truncate">
                          {sample}
                        </div>
                      ))}
                    </div>

                    {/* Action buttons */}
                     <div className="flex items-center gap-2 justify-end">
                       {isAdded ? (
                         <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 gap-1">
                           <Check className="w-3 h-3" /> Rule Added
                         </Badge>
                       ) : (
                         <>
                           <Button
                             variant="outline"
                             size="sm"
                             className="h-7 text-xs gap-1 border-slate-700 text-slate-300 hover:bg-slate-800"
                             onClick={(e) => { e.stopPropagation(); handleCustomize(s); }}
                           >
                             <Settings className="w-3 h-3" /> Customize
                           </Button>
                           <Button
                             size="sm"
                             className="h-7 text-xs gap-1 bg-cyan-600 hover:bg-cyan-700 text-white"
                             onClick={(e) => { e.stopPropagation(); createRuleMutation.mutate(s); }}
                             disabled={isAdding}
                           >
                             {isAdding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                             Add Rule
                           </Button>
                         </>
                       )}
                     </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
        </div>

        {/* Customization Dialog */}
        <Dialog open={!!customizing} onOpenChange={(open) => { if (!open) setCustomizing(null); }}>
        <DialogContent className="max-w-lg bg-[#141d30] border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-slate-200">Customize Validation Rule</DialogTitle>
            <DialogDescription className="text-slate-500">
              Adjust the rule configuration before applying it to future imports.
            </DialogDescription>
          </DialogHeader>
          {customizing && suggestions.find(s => s.id === customizing) && (
            <CustomizeRuleForm
              suggestion={suggestions.find(s => s.id === customizing)}
              config={customConfig[customizing] || {}}
              onConfigChange={(cfg) => setCustomConfig(prev => ({
                ...prev,
                [customizing]: cfg
              }))}
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCustomizing(null)} className="bg-transparent border-slate-700 text-slate-300">
              Cancel
            </Button>
            <Button
              className="bg-cyan-600 hover:bg-cyan-700 text-white"
              onClick={() => {
                const sug = suggestions.find(s => s.id === customizing);
                if (sug) {
                  createRuleMutation.mutate(sug, true);
                }
              }}
              disabled={createRuleMutation.isPending}
            >
              {createRuleMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
              Apply Customized Rule
            </Button>
          </DialogFooter>
        </DialogContent>
        </Dialog>
        </div>
        );
        }

        function CustomizeRuleForm({ suggestion, config, onConfigChange }) {
        const ruleType = suggestion.ruleType;

        const renderConfig = () => {
        switch (ruleType) {
        case 'required':
        return <p className="text-xs text-slate-400">No configuration needed — field will be marked as required.</p>;

        case 'regex':
        return (
          <div className="space-y-2">
            <label className="text-xs text-slate-400">Regex Pattern</label>
            <Input
              value={config.pattern || ''}
              onChange={(e) => onConfigChange({ ...config, pattern: e.target.value })}
              placeholder="e.g., ^\d{10}$"
              className="text-xs bg-slate-800/50 border-slate-700"
            />
            <p className="text-[10px] text-slate-500">Default: {buildRuleConfig('regex').pattern}</p>
          </div>
        );

        case 'numeric_range':
        return (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-slate-400">Minimum Value</label>
              <Input
                type="number"
                value={config.min ?? ''}
                onChange={(e) => onConfigChange({ ...config, min: e.target.value ? Number(e.target.value) : undefined })}
                placeholder="Leave empty for no minimum"
                className="text-xs bg-slate-800/50 border-slate-700"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400">Maximum Value</label>
              <Input
                type="number"
                value={config.max ?? ''}
                onChange={(e) => onConfigChange({ ...config, max: e.target.value ? Number(e.target.value) : undefined })}
                placeholder="Leave empty for no maximum"
                className="text-xs bg-slate-800/50 border-slate-700"
              />
            </div>
          </div>
        );

        case 'max_length':
        return (
          <div className="space-y-2">
            <label className="text-xs text-slate-400">Maximum Length</label>
            <Input
              type="number"
              value={config.max_length || 255}
              onChange={(e) => onConfigChange({ ...config, max_length: Number(e.target.value) })}
              className="text-xs bg-slate-800/50 border-slate-700"
            />
          </div>
        );

        case 'date_format':
        return (
          <div className="space-y-2">
            <label className="text-xs text-slate-400">Date Format</label>
            <Input
              value={config.date_format || 'YYYY-MM-DD'}
              onChange={(e) => onConfigChange({ ...config, date_format: e.target.value })}
              placeholder="e.g., YYYY-MM-DD"
              className="text-xs bg-slate-800/50 border-slate-700"
            />
            <p className="text-[10px] text-slate-500">Common formats: YYYY-MM-DD, MM/DD/YYYY, DD-MM-YYYY</p>
          </div>
        );

        case 'enum_values':
        return (
          <div className="space-y-2">
            <label className="text-xs text-slate-400">Allowed Values (comma-separated)</label>
            <Input
              value={(config.values || []).join(', ')}
              onChange={(e) => onConfigChange({ ...config, values: e.target.value.split(',').map(v => v.trim()).filter(Boolean) })}
              placeholder="e.g., active, inactive, pending"
              className="text-xs bg-slate-800/50 border-slate-700"
            />
          </div>
        );

        default:
        return <p className="text-xs text-slate-400">No additional configuration for this rule type.</p>;
        }
        };

        return <div className="space-y-4 py-2">{renderConfig()}</div>;
        }

function generateDescription(ruleType, column, count) {
  switch (ruleType) {
    case 'required':
      return `The "${column}" field was missing or empty in ${count} rows across recent imports. Adding a required check will reject rows without this field before processing.`;
    case 'regex':
      return `${count} rows had invalid format in the "${column}" field. A regex validation rule can catch malformed data early.`;
    case 'numeric_range':
      return `${count} rows had out-of-range values in "${column}". A numeric range rule will enforce acceptable bounds.`;
    case 'enum_values':
      return `${count} rows had invalid values in "${column}". An enum rule will restrict to allowed values only.`;
    case 'max_length':
      return `${count} rows exceeded acceptable length in "${column}". A max length rule will flag or reject oversized values.`;
    case 'date_format':
      return `${count} rows had unparseable dates in "${column}". A date format rule ensures consistent date formatting.`;
    case 'unique':
      return `${count} duplicate values were found in "${column}". A uniqueness rule will catch duplicates during validation.`;
    default:
      return `${count} errors detected on "${column}". Adding a validation rule can prevent these in future imports.`;
  }
}
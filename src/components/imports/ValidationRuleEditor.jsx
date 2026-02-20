import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Save, X, Plus, AlertTriangle, ShieldAlert, Flag } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const RULE_TYPES = [
  { id: 'required', label: 'Required Field', desc: 'Column must not be empty' },
  { id: 'regex', label: 'Regex Pattern', desc: 'Column must match a regular expression' },
  { id: 'numeric_range', label: 'Numeric Range', desc: 'Value must be within min/max bounds' },
  { id: 'enum_values', label: 'Allowed Values', desc: 'Value must be one of a predefined set' },
  { id: 'max_length', label: 'Max Length', desc: 'String length must not exceed limit' },
  { id: 'date_format', label: 'Date Format', desc: 'Must match expected date format' },
  { id: 'cross_field', label: 'Cross-Field Check', desc: 'Compare two columns with an operator' },
  { id: 'unique', label: 'Unique Values', desc: 'No duplicate values allowed in column' },
  { id: 'custom_expression', label: 'Custom Expression', desc: 'JS-like boolean expression' },
];

const SEVERITY_OPTIONS = [
  { id: 'reject', label: 'Reject', icon: ShieldAlert, color: 'text-red-400 bg-red-500/15', desc: 'Row excluded from import' },
  { id: 'warn', label: 'Warn', icon: AlertTriangle, color: 'text-amber-400 bg-amber-500/15', desc: 'Imported with warning' },
  { id: 'flag', label: 'Flag', icon: Flag, color: 'text-blue-400 bg-blue-500/15', desc: 'Imported and flagged for review' },
];

const OPERATORS = [
  { id: 'gt', label: '>' },
  { id: 'lt', label: '<' },
  { id: 'gte', label: '>=' },
  { id: 'lte', label: '<=' },
  { id: 'eq', label: '==' },
  { id: 'neq', label: '!=' },
];

export default function ValidationRuleEditor({ open, onOpenChange, rule, importType, onSaved }) {
  const isEdit = !!rule;

  const [form, setForm] = useState({
    rule_name: '',
    description: '',
    column: '',
    rule_type: 'required',
    severity: 'reject',
    enabled: true,
    order: 0,
    config: {},
  });
  const [enumInput, setEnumInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (rule) {
      setForm({
        rule_name: rule.rule_name || '',
        description: rule.description || '',
        column: rule.column || '',
        rule_type: rule.rule_type || 'required',
        severity: rule.severity || 'reject',
        enabled: rule.enabled !== false,
        order: rule.order || 0,
        config: rule.config || {},
      });
    } else {
      setForm({
        rule_name: '',
        description: '',
        column: '',
        rule_type: 'required',
        severity: 'reject',
        enabled: true,
        order: 0,
        config: {},
      });
    }
  }, [rule, open]);

  const updateConfig = (key, value) => setForm(f => ({ ...f, config: { ...f.config, [key]: value } }));

  const handleSave = async () => {
    setIsSaving(true);
    const data = {
      ...form,
      import_type: importType,
    };
    if (isEdit) {
      await base44.entities.ImportValidationRule.update(rule.id, data);
    } else {
      await base44.entities.ImportValidationRule.create(data);
    }
    setIsSaving(false);
    onSaved?.();
    onOpenChange(false);
  };

  const addEnumValue = () => {
    const v = enumInput.trim();
    if (v && !(form.config.values || []).includes(v)) {
      updateConfig('values', [...(form.config.values || []), v]);
    }
    setEnumInput('');
  };

  const ruleType = RULE_TYPES.find(r => r.id === form.rule_type);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto bg-[#141d30] border-slate-700">
        <DialogHeader>
          <DialogTitle className="text-slate-200">
            {isEdit ? 'Edit Validation Rule' : 'New Validation Rule'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name + Description */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Rule Name *</Label>
            <Input
              value={form.rule_name}
              onChange={(e) => setForm(f => ({ ...f, rule_name: e.target.value }))}
              placeholder="e.g. Valid NPI Format"
              className="h-8 text-sm bg-slate-800/50 border-slate-700 text-slate-300"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Description</Label>
            <Input
              value={form.description}
              onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="What does this rule check?"
              className="h-8 text-sm bg-slate-800/50 border-slate-700 text-slate-300"
            />
          </div>

          {/* Column */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Target Column *</Label>
            <Input
              value={form.column}
              onChange={(e) => setForm(f => ({ ...f, column: e.target.value }))}
              placeholder="e.g. npi, state, total_services"
              className="h-8 text-sm bg-slate-800/50 border-slate-700 text-slate-300"
            />
          </div>

          {/* Rule Type */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Rule Type *</Label>
            <select
              value={form.rule_type}
              onChange={(e) => setForm(f => ({ ...f, rule_type: e.target.value, config: {} }))}
              className="text-sm border border-slate-700 rounded-md px-2 py-1.5 bg-slate-800/50 text-slate-300 h-8 w-full"
            >
              {RULE_TYPES.map(r => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
            </select>
            {ruleType && <p className="text-[10px] text-slate-600">{ruleType.desc}</p>}
          </div>

          {/* Config by type */}
          <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-3 space-y-3">
            <p className="text-xs font-medium text-slate-400">Rule Configuration</p>

            {form.rule_type === 'required' && (
              <p className="text-xs text-slate-500">No additional config needed — checks that the column is not empty.</p>
            )}

            {form.rule_type === 'regex' && (
              <div className="space-y-1">
                <Label className="text-xs text-slate-400">Regex Pattern</Label>
                <Input
                  value={form.config.pattern || ''}
                  onChange={(e) => updateConfig('pattern', e.target.value)}
                  placeholder="e.g. ^\d{10}$ for 10-digit NPI"
                  className="h-8 text-xs font-mono bg-slate-800/50 border-slate-700 text-slate-300"
                />
                <p className="text-[10px] text-slate-600">JavaScript regex — do not include delimiters</p>
              </div>
            )}

            {form.rule_type === 'numeric_range' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-400">Minimum</Label>
                  <Input
                    type="number"
                    value={form.config.min ?? ''}
                    onChange={(e) => updateConfig('min', e.target.value === '' ? undefined : Number(e.target.value))}
                    placeholder="No min"
                    className="h-8 text-sm bg-slate-800/50 border-slate-700 text-slate-300"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-400">Maximum</Label>
                  <Input
                    type="number"
                    value={form.config.max ?? ''}
                    onChange={(e) => updateConfig('max', e.target.value === '' ? undefined : Number(e.target.value))}
                    placeholder="No max"
                    className="h-8 text-sm bg-slate-800/50 border-slate-700 text-slate-300"
                  />
                </div>
              </div>
            )}

            {form.rule_type === 'enum_values' && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    value={enumInput}
                    onChange={(e) => setEnumInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addEnumValue())}
                    placeholder="Add allowed value..."
                    className="h-8 text-xs bg-slate-800/50 border-slate-700 text-slate-300 flex-1"
                  />
                  <Button variant="outline" size="sm" className="h-8 bg-transparent border-slate-700 text-slate-400" onClick={addEnumValue}>
                    <Plus className="w-3 h-3" />
                  </Button>
                </div>
                {(form.config.values || []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {form.config.values.map(v => (
                      <Badge key={v} className="bg-slate-700/50 text-slate-300 text-[10px] gap-1">
                        {v}
                        <button onClick={() => updateConfig('values', form.config.values.filter(x => x !== v))} className="hover:text-red-400">
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}

            {form.rule_type === 'max_length' && (
              <div className="space-y-1">
                <Label className="text-xs text-slate-400">Maximum Length</Label>
                <Input
                  type="number"
                  value={form.config.max_length ?? ''}
                  onChange={(e) => updateConfig('max_length', e.target.value === '' ? undefined : Number(e.target.value))}
                  min={1}
                  placeholder="e.g. 255"
                  className="h-8 text-sm bg-slate-800/50 border-slate-700 text-slate-300"
                />
              </div>
            )}

            {form.rule_type === 'date_format' && (
              <div className="space-y-1">
                <Label className="text-xs text-slate-400">Expected Format</Label>
                <Input
                  value={form.config.date_format || ''}
                  onChange={(e) => updateConfig('date_format', e.target.value)}
                  placeholder="e.g. YYYY-MM-DD, MM/DD/YYYY"
                  className="h-8 text-sm bg-slate-800/50 border-slate-700 text-slate-300"
                />
              </div>
            )}

            {form.rule_type === 'cross_field' && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-400">Compare to column</Label>
                  <Input
                    value={form.config.other_column || ''}
                    onChange={(e) => updateConfig('other_column', e.target.value)}
                    placeholder="e.g. end_date"
                    className="h-8 text-sm bg-slate-800/50 border-slate-700 text-slate-300"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-400">Operator</Label>
                  <select
                    value={form.config.operator || 'gt'}
                    onChange={(e) => updateConfig('operator', e.target.value)}
                    className="text-sm border border-slate-700 rounded-md px-2 py-1.5 bg-slate-800/50 text-slate-300 h-8 w-full"
                  >
                    {OPERATORS.map(op => (
                      <option key={op.id} value={op.id}>{op.label} ({op.id})</option>
                    ))}
                  </select>
                  <p className="text-[10px] text-slate-600">
                    "{form.column || 'column'}" {OPERATORS.find(o => o.id === (form.config.operator || 'gt'))?.label} "{form.config.other_column || 'other_column'}"
                  </p>
                </div>
              </div>
            )}

            {form.rule_type === 'unique' && (
              <p className="text-xs text-slate-500">No additional config needed — ensures no duplicate values in this column within the import batch.</p>
            )}

            {form.rule_type === 'custom_expression' && (
              <div className="space-y-1">
                <Label className="text-xs text-slate-400">Expression</Label>
                <Input
                  value={form.config.expression || ''}
                  onChange={(e) => updateConfig('expression', e.target.value)}
                  placeholder='e.g. row.total_services > 0 || row.status === "Inactive"'
                  className="h-8 text-xs font-mono bg-slate-800/50 border-slate-700 text-slate-300"
                />
                <p className="text-[10px] text-slate-600">
                  Use <code className="text-cyan-400">row.column_name</code> to reference fields. Must evaluate to true/false.
                </p>
              </div>
            )}
          </div>

          {/* Severity */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Severity</Label>
            <div className="grid grid-cols-3 gap-2">
              {SEVERITY_OPTIONS.map(s => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.id}
                    onClick={() => setForm(f => ({ ...f, severity: s.id }))}
                    className={`flex items-center gap-2 p-2 rounded-lg border text-xs transition-colors ${
                      form.severity === s.id
                        ? 'border-cyan-500/40 bg-slate-800/60'
                        : 'border-slate-700/50 hover:border-slate-600'
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 ${s.color.split(' ')[0]}`} />
                    <div className="text-left">
                      <p className="font-medium text-slate-200">{s.label}</p>
                      <p className="text-[9px] text-slate-500">{s.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Order + Enabled */}
          <div className="flex items-center justify-between border-t border-slate-700/50 pt-3">
            <div className="flex items-center gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-slate-400">Priority Order</Label>
                <Input
                  type="number"
                  value={form.order}
                  onChange={(e) => setForm(f => ({ ...f, order: Number(e.target.value) || 0 }))}
                  min={0}
                  className="h-8 w-20 text-sm bg-slate-800/50 border-slate-700 text-slate-300"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm text-slate-300">Enabled</Label>
              <Switch checked={form.enabled} onCheckedChange={(v) => setForm(f => ({ ...f, enabled: v }))} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800">
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !form.rule_name || !form.column}
            className="bg-cyan-600 hover:bg-cyan-700 text-white"
          >
            {isSaving ? <Save className="w-4 h-4 mr-2 animate-pulse" /> : <Save className="w-4 h-4 mr-2" />}
            {isEdit ? 'Update Rule' : 'Create Rule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
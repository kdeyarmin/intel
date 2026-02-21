import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, Plus, Edit2, Settings } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function CleaningRuleManager() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [formData, setFormData] = useState({
    rule_name: '',
    rule_type: 'format_standardization',
    target_field: '',
    pattern: '',
    replacement: '',
    description: '',
    auto_fix: true,
    severity: 'info'
  });

  useEffect(() => {
    fetchRules();
  }, []);

  const fetchRules = async () => {
    try {
      const allRules = await base44.entities.DataCleaningRule.list();
      setRules(allRules || []);
    } catch (error) {
      toast.error('Failed to load rules');
    }
  };

  const handleSave = async () => {
    if (!formData.rule_name || !formData.target_field) {
      toast.error('Rule name and target field are required');
      return;
    }

    setLoading(true);
    try {
      if (editingRule) {
        await base44.entities.DataCleaningRule.update(editingRule.id, formData);
        toast.success('Rule updated');
      } else {
        await base44.entities.DataCleaningRule.create(formData);
        toast.success('Rule created');
      }
      resetForm();
      fetchRules();
    } catch (error) {
      toast.error('Failed to save rule: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (ruleId) => {
    if (confirm('Delete this rule?')) {
      try {
        await base44.entities.DataCleaningRule.delete(ruleId);
        toast.success('Rule deleted');
        fetchRules();
      } catch (error) {
        toast.error('Failed to delete rule');
      }
    }
  };

  const handleEdit = (rule) => {
    setEditingRule(rule);
    setFormData({
      rule_name: rule.rule_name,
      rule_type: rule.rule_type,
      target_field: rule.target_field,
      pattern: rule.pattern || '',
      replacement: rule.replacement || '',
      description: rule.description || '',
      auto_fix: rule.auto_fix !== false,
      severity: rule.severity || 'info'
    });
  };

  const resetForm = () => {
    setEditingRule(null);
    setFormData({
      rule_name: '',
      rule_type: 'format_standardization',
      target_field: '',
      pattern: '',
      replacement: '',
      description: '',
      auto_fix: true,
      severity: 'info'
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Settings className="w-5 h-5" />
          Cleaning Rules
        </CardTitle>
        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm" onClick={() => resetForm()}>
              <Plus className="w-4 h-4 mr-2" />
              New Rule
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingRule ? 'Edit Rule' : 'Create Rule'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Input
                placeholder="Rule Name"
                value={formData.rule_name}
                onChange={(e) => setFormData({...formData, rule_name: e.target.value})}
              />
              <Select value={formData.rule_type} onValueChange={(val) => setFormData({...formData, rule_type: val})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="format_standardization">Format Standardization</SelectItem>
                  <SelectItem value="typo_correction">Typo Correction</SelectItem>
                  <SelectItem value="pattern_validation">Pattern Validation</SelectItem>
                  <SelectItem value="consistency_check">Consistency Check</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder="Target Field (e.g., phone, email)"
                value={formData.target_field}
                onChange={(e) => setFormData({...formData, target_field: e.target.value})}
              />
              <Input
                placeholder="Pattern (regex)"
                value={formData.pattern}
                onChange={(e) => setFormData({...formData, pattern: e.target.value})}
              />
              <Input
                placeholder="Replacement"
                value={formData.replacement}
                onChange={(e) => setFormData({...formData, replacement: e.target.value})}
              />
              <Input
                placeholder="Description"
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
              />
              <Button onClick={handleSave} disabled={loading} className="w-full">
                {editingRule ? 'Update' : 'Create'} Rule
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {rules.length === 0 ? (
            <p className="text-sm text-slate-400">No rules configured yet</p>
          ) : (
            rules.map(rule => (
              <div key={rule.id} className="p-3 rounded border border-slate-700 flex items-start justify-between hover:bg-slate-800/30">
                <div className="flex-1">
                  <p className="text-sm font-medium">{rule.rule_name}</p>
                  <p className="text-xs text-slate-400 mt-1">{rule.description}</p>
                  <div className="flex gap-1 mt-2 flex-wrap">
                    <Badge variant="outline" className="h-5 text-xs">{rule.rule_type}</Badge>
                    <Badge variant="outline" className="h-5 text-xs">{rule.target_field}</Badge>
                    {rule.enabled && <Badge className="h-5 text-xs bg-green-500/20 text-green-300">Active</Badge>}
                  </div>
                </div>
                <div className="flex gap-1 ml-4 flex-shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleEdit(rule)}
                    className="h-8 w-8"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleDelete(rule.id)}
                    className="h-8 w-8 hover:text-red-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
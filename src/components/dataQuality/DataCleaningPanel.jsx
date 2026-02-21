import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle2, Loader2, Wand2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function DataCleaningPanel({ provider, onCleaningComplete }) {
  const [rules, setRules] = useState([]);
  const [selectedRules, setSelectedRules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    fetchRules();
  }, []);

  const fetchRules = async () => {
    try {
      const allRules = await base44.entities.DataCleaningRule.filter({ enabled: true });
      setRules(allRules || []);
      setSelectedRules(allRules?.map(r => r.id) || []);
    } catch (error) {
      console.error('Error fetching rules:', error);
    }
  };

  const handleClean = async () => {
    setLoading(true);
    try {
      const response = await base44.functions.invoke('cleanProviderData', {
        provider_id: provider.id,
        rule_ids: selectedRules,
        auto_fix: true
      });

      if (response.data.success) {
        setResult(response.data);
        toast.success(`Found ${response.data.changes_found} changes`);
        onCleaningComplete?.(response.data);
      }
    } catch (error) {
      toast.error('Cleaning failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleRule = (ruleId) => {
    setSelectedRules(prev =>
      prev.includes(ruleId)
        ? prev.filter(id => id !== ruleId)
        : [...prev, ruleId]
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wand2 className="w-5 h-5 text-purple-400" />
          Data Cleaning
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Rules Selection */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Active Rules ({selectedRules.length}/{rules.length})</h4>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {rules.map(rule => (
              <div key={rule.id} className="flex items-start gap-3 p-2 rounded border border-slate-700 hover:bg-slate-800/50">
                <Checkbox
                  checked={selectedRules.includes(rule.id)}
                  onCheckedChange={() => toggleRule(rule.id)}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-200">{rule.rule_name}</p>
                  <p className="text-xs text-slate-400">{rule.description}</p>
                  <div className="flex gap-1 mt-1 flex-wrap">
                    <Badge variant="outline" className="h-5 text-xs">{rule.rule_type}</Badge>
                    <Badge variant="outline" className="h-5 text-xs">{rule.target_field}</Badge>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Cleaning Results */}
        {result && (
          <div className="space-y-2 p-3 rounded-lg bg-slate-800/30 border border-slate-700">
            <h4 className="text-sm font-medium">Cleaning Results</h4>

            {/* Changes */}
            {result.changes.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-slate-400">Changes Applied ({result.changes.length})</p>
                {result.changes.map((change, idx) => (
                  <div key={idx} className="text-xs p-2 rounded bg-slate-700/30 border border-green-500/20">
                    <p className="text-green-300 font-medium">{change.field}</p>
                    <p className="text-slate-400">
                      <span className="line-through">{change.old_value}</span>
                      {' → '}
                      <span className="text-green-300">{change.new_value}</span>
                    </p>
                    <p className="text-slate-500 text-xs mt-1">Rule: {change.rule}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Flags */}
            {result.flags.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-slate-400">Issues Found ({result.flags.length})</p>
                {result.flags.map((flag, idx) => (
                  <div key={idx} className="text-xs p-2 rounded bg-slate-700/30 border border-amber-500/20">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-amber-300 font-medium">{flag.field}</p>
                        <p className="text-slate-300">{flag.issue}</p>
                        <p className="text-slate-500 mt-1">💡 {flag.suggestion}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {result.changes.length === 0 && result.flags.length === 0 && (
              <div className="text-xs text-slate-400 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-400" />
                No issues found. Data is clean!
              </div>
            )}
          </div>
        )}

        {/* Action Button */}
        <Button
          onClick={handleClean}
          disabled={loading || selectedRules.length === 0}
          className="w-full gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Cleaning...
            </>
          ) : (
            <>
              <Wand2 className="w-4 h-4" />
              Clean Provider Data
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
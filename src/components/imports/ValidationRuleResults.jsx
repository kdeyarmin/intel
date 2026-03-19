import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import {
  ShieldCheck, ShieldAlert, AlertTriangle, Flag, ChevronDown, ChevronRight, Loader2
} from 'lucide-react';

const SEVERITY_STYLES = {
  reject: { icon: ShieldAlert, color: 'text-red-400', bg: 'bg-red-500/15', border: 'border-red-500/20', label: 'Rejected' },
  warn: { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/15', border: 'border-amber-500/20', label: 'Warned' },
  flag: { icon: Flag, color: 'text-blue-400', bg: 'bg-blue-500/15', border: 'border-blue-500/20', label: 'Flagged' },
};

const RULE_TYPE_LABELS = {
  required: 'Required', regex: 'Regex', numeric_range: 'Range',
  enum_values: 'Enum', max_length: 'Max Length', date_format: 'Date Format',
  cross_field: 'Cross-Field', unique: 'Unique', custom_expression: 'Custom',
};

function classifyError(error) {
  const msg = (error.message || '').toLowerCase();
  if (msg.includes('required') || msg.includes('missing') || msg.includes('empty')) return { ruleType: 'required', severity: 'reject' };
  if (msg.includes('regex') || msg.includes('pattern') || msg.includes('format')) return { ruleType: 'regex', severity: 'reject' };
  if (msg.includes('range') || msg.includes('too high') || msg.includes('too low') || msg.includes('negative')) return { ruleType: 'numeric_range', severity: 'reject' };
  if (msg.includes('enum') || msg.includes('invalid value') || msg.includes('not in')) return { ruleType: 'enum_values', severity: 'reject' };
  if (msg.includes('length') || msg.includes('too long')) return { ruleType: 'max_length', severity: 'warn' };
  if (msg.includes('date')) return { ruleType: 'date_format', severity: 'reject' };
  if (msg.includes('duplicate') || msg.includes('unique')) return { ruleType: 'unique', severity: 'warn' };
  if (msg.includes('flag')) return { ruleType: 'custom_expression', severity: 'flag' };
  if (msg.includes('warn')) return { ruleType: 'custom_expression', severity: 'warn' };
  return { ruleType: 'custom_expression', severity: 'reject' };
}

function extractColumn(error) {
  const msg = error.message || '';
  // Look for patterns like "field 'npi'" or "column: npi" or just field names
  const match = msg.match(/(?:field|column|property)\s*[:'"]?\s*(\w+)/i);
  if (match) return match[1];
  if (error.field) return error.field;
  if (error.column) return error.column;
  return 'unknown';
}

export default function ValidationRuleResults({ batch }) {
  const [expandedRule, setExpandedRule] = useState(null);

  const importType = batch?.import_type;

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['validationRulesForBatch', importType],
    queryFn: async () => {
      const all = await base44.entities.ImportValidationRule.list('-created_date', 200);
      return all.filter(r => r.import_type === importType || r.import_type === '_global');
    },
    enabled: !!importType,
  });

  const errors = batch?.error_samples || [];

  // Analyze errors against rules
  const analysis = useMemo(() => {
    if (!rules.length && !errors.length) return null;

    // Classify each error
    const classifiedErrors = errors.map(err => ({
      ...err,
      ...classifyError(err),
      column: extractColumn(err),
    }));

    // Build severity summary
    const severityCounts = { reject: 0, warn: 0, flag: 0 };
    for (const err of classifiedErrors) {
      severityCounts[err.severity] = (severityCounts[err.severity] || 0) + 1;
    }

    // Match errors to rules where possible
    const ruleResults = rules.map(rule => {
      const matching = classifiedErrors.filter(e =>
        e.column === rule.column || e.ruleType === rule.rule_type
      );
      return {
        rule,
        passed: matching.length === 0,
        errorCount: matching.length,
        matchingErrors: matching.slice(0, 5), // keep top 5 samples
      };
    });

    // Unmatched errors (not associated with a defined rule)
    const matchedErrorIndices = new Set();
    for (const rr of ruleResults) {
      for (const me of rr.matchingErrors) {
        const idx = classifiedErrors.indexOf(me);
        if (idx >= 0) matchedErrorIndices.add(idx);
      }
    }
    const unmatchedErrors = classifiedErrors.filter((_, i) => !matchedErrorIndices.has(i));

    // Group unmatched by classification
    const unmatchedGroups = {};
    for (const err of unmatchedErrors) {
      const key = `${err.ruleType}_${err.severity}_${err.column}`;
      if (!unmatchedGroups[key]) {
        unmatchedGroups[key] = { ruleType: err.ruleType, severity: err.severity, column: err.column, errors: [] };
      }
      unmatchedGroups[key].errors.push(err);
    }

    return {
      severityCounts,
      ruleResults: ruleResults.sort((a, b) => b.errorCount - a.errorCount),
      unmatchedGroups: Object.values(unmatchedGroups),
      totalErrors: classifiedErrors.length,
      passedRules: ruleResults.filter(r => r.passed).length,
      failedRules: ruleResults.filter(r => !r.passed).length,
    };
  }, [rules, errors]);

  if (isLoading) {
    return (
      <div className="text-center py-6 text-slate-500">
        <Loader2 className="w-5 h-5 mx-auto mb-2 animate-spin" />
        <p className="text-xs">Loading validation results...</p>
      </div>
    );
  }

  if (!analysis || (analysis.totalErrors === 0 && rules.length === 0)) {
    return (
      <div className="text-center py-6 text-slate-500">
        <ShieldCheck className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p className="text-xs">No validation rules applied or no errors found</p>
      </div>
    );
  }

  const toggle = (id) => setExpandedRule(expandedRule === id ? null : id);

  return (
    <div className="space-y-4">
      {/* Severity Summary */}
      <div className="grid grid-cols-3 gap-2">
        {Object.entries(SEVERITY_STYLES).map(([key, style]) => {
          const Icon = style.icon;
          const count = analysis.severityCounts[key] || 0;
          return (
            <div key={key} className={`${style.bg} border ${style.border} rounded-lg p-3 text-center`}>
              <Icon className={`w-4 h-4 mx-auto mb-1 ${style.color}`} />
              <p className={`text-lg font-bold ${style.color}`}>{count}</p>
              <p className="text-[10px] text-slate-500">{style.label}</p>
            </div>
          );
        })}
      </div>

      {/* Rule pass/fail summary */}
      {rules.length > 0 && (
        <div className="flex items-center gap-4 text-xs">
          <span className="text-emerald-400 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            {analysis.passedRules} rule{analysis.passedRules !== 1 ? 's' : ''} passed
          </span>
          {analysis.failedRules > 0 && (
            <span className="text-red-400 flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5" />
              {analysis.failedRules} rule{analysis.failedRules !== 1 ? 's' : ''} triggered
            </span>
          )}
        </div>
      )}

      {/* Rule-by-rule results */}
      {analysis.ruleResults.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-slate-400 mb-2">Defined Rules</p>
          {analysis.ruleResults.map(({ rule, passed, errorCount, matchingErrors }) => {
            const sev = SEVERITY_STYLES[rule.severity] || SEVERITY_STYLES.reject;
            const SevIcon = sev.icon;
            const isExpanded = expandedRule === rule.id;
            return (
              <div key={rule.id}>
                <button
                  onClick={() => toggle(rule.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left border transition-colors ${
                    passed
                      ? 'border-slate-700/30 hover:bg-slate-800/30'
                      : `${sev.bg} ${sev.border} hover:opacity-90`
                  }`}
                >
                  {passed
                    ? <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                    : <SevIcon className={`w-3.5 h-3.5 ${sev.color} flex-shrink-0`} />
                  }
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium ${passed ? 'text-slate-300' : sev.color}`}>
                        {rule.rule_name}
                      </span>
                      <Badge className="bg-slate-700/50 text-slate-500 text-[8px]">
                        {RULE_TYPE_LABELS[rule.rule_type]}
                      </Badge>
                      <code className="text-[10px] text-cyan-400/60">{rule.column}</code>
                    </div>
                  </div>
                  {!passed && (
                    <Badge className={`${sev.bg} ${sev.color} text-[9px]`}>{errorCount} error{errorCount !== 1 ? 's' : ''}</Badge>
                  )}
                  {matchingErrors.length > 0 && (
                    isExpanded
                      ? <ChevronDown className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                      : <ChevronRight className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                  )}
                </button>
                {isExpanded && matchingErrors.length > 0 && (
                  <div className="ml-6 mt-1 space-y-1">
                    {matchingErrors.map((err, i) => (
                      <div key={i} className="text-[11px] bg-slate-800/50 border border-slate-700/30 rounded px-2.5 py-1.5">
                        <div className="flex items-center gap-2">
                          {err.row != null && <span className="text-slate-500">Row {err.row}</span>}
                          <span className="text-slate-300">{err.message}</span>
                        </div>
                        {err.data && (
                          <pre className="text-[10px] text-slate-500 mt-1 overflow-x-auto">
                            {JSON.stringify(err.data, null, 1).substring(0, 200)}
                          </pre>
                        )}
                      </div>
                    ))}
                    {errorCount > matchingErrors.length && (
                      <p className="text-[10px] text-slate-500 pl-2">...and {errorCount - matchingErrors.length} more</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Unmatched errors (no corresponding rule) */}
      {analysis.unmatchedGroups.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-slate-400 mb-2">Auto-Detected Issues (No Matching Rule)</p>
          {analysis.unmatchedGroups.map((group, i) => {
            const sev = SEVERITY_STYLES[group.severity] || SEVERITY_STYLES.reject;
            const SevIcon = sev.icon;
            const isExpanded = expandedRule === `unmatched_${i}`;
            return (
              <div key={i}>
                <button
                  onClick={() => toggle(`unmatched_${i}`)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left border ${sev.bg} ${sev.border} hover:opacity-90 transition-colors`}
                >
                  <SevIcon className={`w-3.5 h-3.5 ${sev.color} flex-shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium ${sev.color}`}>
                        {RULE_TYPE_LABELS[group.ruleType] || group.ruleType} check
                      </span>
                      <code className="text-[10px] text-cyan-400/60">{group.column}</code>
                    </div>
                  </div>
                  <Badge className={`${sev.bg} ${sev.color} text-[9px]`}>{group.errors.length}</Badge>
                  {isExpanded
                    ? <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                    : <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                  }
                </button>
                {isExpanded && (
                  <div className="ml-6 mt-1 space-y-1">
                    {group.errors.slice(0, 5).map((err, j) => (
                      <div key={j} className="text-[11px] bg-slate-800/50 border border-slate-700/30 rounded px-2.5 py-1.5">
                        {err.row != null && <span className="text-slate-500 mr-2">Row {err.row}</span>}
                        <span className="text-slate-300">{err.message}</span>
                      </div>
                    ))}
                    {group.errors.length > 5 && (
                      <p className="text-[10px] text-slate-500 pl-2">...and {group.errors.length - 5} more</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
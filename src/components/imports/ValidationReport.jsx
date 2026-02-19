import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronRight } from 'lucide-react';

export default function ValidationReport({ result }) {
  const [showErrors, setShowErrors] = useState(false);
  const [showWarnings, setShowWarnings] = useState(false);

  if (!result) return null;

  const hasValidation = result.validation_errors != null || result.records_rejected != null;
  if (!hasValidation) return null;

  const rejected = result.records_rejected || 0;
  const validated = result.records_validated || 0;
  const total = result.total_records || 0;
  const valErrors = result.validation_errors || 0;
  const valWarnings = result.validation_warnings || 0;
  const ruleSummary = result.validation_rule_summary || {};
  const errorSamples = result.validation_error_samples || [];
  const warningSamples = result.validation_warning_samples || [];

  const passRate = total > 0 ? ((validated / total) * 100).toFixed(1) : 0;
  const isClean = rejected === 0 && valWarnings === 0;

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      <div className={`rounded-lg p-3 border ${isClean ? 'bg-green-50 border-green-200' : rejected > 0 ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            {isClean ? (
              <CheckCircle2 className="w-4 h-4 text-green-600" />
            ) : rejected > 0 ? (
              <AlertTriangle className="w-4 h-4 text-amber-600" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-blue-600" />
            )}
            <span className={isClean ? 'text-green-700' : rejected > 0 ? 'text-amber-700' : 'text-blue-700'}>
              Validation: {passRate}% pass rate
            </span>
          </div>
          <div className="flex gap-2">
            <Badge className="bg-green-100 text-green-800 text-xs">{validated.toLocaleString()} passed</Badge>
            {rejected > 0 && <Badge className="bg-red-100 text-red-800 text-xs">{rejected.toLocaleString()} rejected</Badge>}
            {valWarnings > 0 && <Badge className="bg-amber-100 text-amber-800 text-xs">{valWarnings} warnings</Badge>}
          </div>
        </div>
      </div>

      {/* Rule summary */}
      {Object.keys(ruleSummary).length > 0 && (
        <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-1.5">
          <p className="font-medium text-gray-700 text-sm">Validation Rules Triggered</p>
          <div className="grid grid-cols-2 gap-1.5">
            {Object.entries(ruleSummary).map(([rule, count]) => (
              <div key={rule} className="flex items-center justify-between bg-white rounded px-2 py-1 border">
                <span className="text-gray-600">{rule.replace(/_/g, ' ')}</span>
                <Badge variant="outline" className="text-xs ml-2">{count}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Validation errors */}
      {errorSamples.length > 0 && (
        <div>
          <button
            onClick={() => setShowErrors(!showErrors)}
            className="flex items-center gap-1.5 text-xs text-red-600 hover:text-red-800 font-medium"
          >
            {showErrors ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            <XCircle className="w-3 h-3" />
            Validation errors ({valErrors} total, showing {errorSamples.length} samples)
          </button>
          {showErrors && (
            <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
              {errorSamples.map((e, i) => (
                <div key={i} className="bg-red-50 rounded px-3 py-2 text-xs border border-red-100 flex items-start gap-2">
                  <XCircle className="w-3 h-3 text-red-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-medium text-red-700">[{e.rule}]</span>{' '}
                    <span className="text-red-600">{e.message}</span>
                    <span className="text-gray-400 ml-2">
                      {e.sheet && `Sheet: ${e.sheet}`}{e.row != null && `, Row: ${e.row}`}{e.field && `, Field: ${e.field}`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Validation warnings */}
      {warningSamples.length > 0 && (
        <div>
          <button
            onClick={() => setShowWarnings(!showWarnings)}
            className="flex items-center gap-1.5 text-xs text-amber-600 hover:text-amber-800 font-medium"
          >
            {showWarnings ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            <AlertTriangle className="w-3 h-3" />
            Warnings ({valWarnings} total, showing {warningSamples.length} samples)
          </button>
          {showWarnings && (
            <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
              {warningSamples.map((w, i) => (
                <div key={i} className="bg-amber-50 rounded px-3 py-2 text-xs border border-amber-100 flex items-start gap-2">
                  <AlertTriangle className="w-3 h-3 text-amber-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-medium text-amber-700">[{w.rule}]</span>{' '}
                    <span className="text-amber-600">{w.message}</span>
                    <span className="text-gray-400 ml-2">
                      {w.sheet && `Sheet: ${w.sheet}`}{w.row != null && `, Row: ${w.row}`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
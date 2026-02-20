import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight, AlertTriangle, Lightbulb, FileText } from 'lucide-react';

function getSuggestedResolution(error) {
  const msg = (error.message || error.detail || '').toLowerCase();
  if (msg.includes('rate limit')) return 'Wait a few minutes and resume the import — the system was processing too fast.';
  if (msg.includes('missing required') || msg.includes('required field')) return 'Check the source file for missing values in this column. Ensure all required fields are populated.';
  if (msg.includes('invalid npi') || msg.includes('npi')) return 'Verify NPI is a valid 10-digit number. Remove non-numeric characters or leading/trailing spaces.';
  if (msg.includes('duplicate')) return 'This record already exists in the database. Skip or merge with the existing record.';
  if (msg.includes('timeout') || msg.includes('timed out')) return 'The import timed out. Click "Resume" to continue from where it left off.';
  if (msg.includes('json parse') || msg.includes('parse')) return 'The source data has malformed rows. Check the file format and encoding.';
  if (msg.includes('numeric') || msg.includes('number')) return 'A numeric field contains non-numeric data. Clean the source file or update validation rules.';
  if (msg.includes('date') || msg.includes('format')) return 'Date format doesn\'t match expected pattern. Ensure dates use MM/DD/YYYY or YYYY-MM-DD format.';
  if (msg.includes('stall') || msg.includes('inactivity')) return 'The import job stalled. Retry the import — this is usually a transient issue.';
  if (msg.includes('bulk create') || msg.includes('chunk')) return 'A batch of rows failed to insert. Check for data type mismatches or constraint violations.';
  if (msg.includes('map') || msg.includes('mapping')) return 'Row could not be mapped to the target schema. Check column names match expected format.';
  return null;
}

function getSeverity(error) {
  const msg = (error.message || error.detail || '').toLowerCase();
  if (msg.includes('rate limit') || msg.includes('timeout') || msg.includes('stall')) return 'warning';
  if (msg.includes('duplicate') || msg.includes('skip')) return 'info';
  return 'error';
}

const severityConfig = {
  error: { color: 'bg-red-500/15 text-red-400 border-red-500/20', icon: 'text-red-400' },
  warning: { color: 'bg-amber-500/15 text-amber-400 border-amber-500/20', icon: 'text-amber-400' },
  info: { color: 'bg-slate-500/15 text-slate-400 border-slate-500/20', icon: 'text-slate-400' },
};

export default function DetailedErrorRows({ errors, maxVisible = 10 }) {
  const [expanded, setExpanded] = useState(false);
  const [expandedRow, setExpandedRow] = useState(null);

  if (!errors || errors.length === 0) return null;

  const visibleErrors = expanded ? errors : errors.slice(0, maxVisible);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5 text-red-400" />
          {errors.length} Error{errors.length !== 1 ? 's' : ''} — Detailed View
        </span>
      </div>

      {visibleErrors.map((err, idx) => {
        const severity = getSeverity(err);
        const config = severityConfig[severity];
        const resolution = getSuggestedResolution(err);
        const rowNum = err.row ?? err.row_index ?? err.chunk_start;
        const phase = err.phase || '';
        const isRowExpanded = expandedRow === idx;

        return (
          <div key={idx} className="bg-slate-800/40 border border-slate-700/40 rounded-lg overflow-hidden">
            <button
              className="w-full flex items-start gap-2.5 p-2.5 text-left hover:bg-slate-700/20 transition-colors"
              onClick={() => setExpandedRow(isRowExpanded ? null : idx)}
            >
              <AlertTriangle className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${config.icon}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  {rowNum != null && (
                    <Badge className="bg-slate-700/50 text-slate-300 text-[9px] font-mono">
                      Row {typeof rowNum === 'number' ? rowNum.toLocaleString() : rowNum}
                    </Badge>
                  )}
                  {phase && (
                    <Badge className={`${config.color} text-[9px]`}>{phase}</Badge>
                  )}
                  <Badge className={`${config.color} text-[9px]`}>{severity}</Badge>
                  {err.sheet && (
                    <span className="text-[9px] text-slate-500">Sheet: {err.sheet}</span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 truncate">
                  {err.message || err.detail || 'Unknown error'}
                </p>
              </div>
              {resolution && (
                isRowExpanded
                  ? <ChevronDown className="w-3.5 h-3.5 text-slate-500 mt-1 flex-shrink-0" />
                  : <ChevronRight className="w-3.5 h-3.5 text-slate-500 mt-1 flex-shrink-0" />
              )}
            </button>

            {isRowExpanded && resolution && (
              <div className="px-3 pb-3 pt-1 border-t border-slate-700/30">
                <div className="flex items-start gap-2 bg-emerald-500/5 border border-emerald-500/20 rounded-md p-2">
                  <Lightbulb className="w-3.5 h-3.5 text-yellow-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-[10px] font-semibold text-emerald-400 mb-0.5">Suggested Resolution</p>
                    <p className="text-[11px] text-slate-400">{resolution}</p>
                  </div>
                </div>
                {err.field && (
                  <p className="text-[10px] text-slate-500 mt-1.5">Field: <span className="text-slate-300 font-mono">{err.field}</span></p>
                )}
                {err.first_record_category && (
                  <p className="text-[10px] text-slate-500 mt-0.5">Category: <span className="text-slate-300">{err.first_record_category}</span></p>
                )}
              </div>
            )}
          </div>
        );
      })}

      {errors.length > maxVisible && (
        <Button
          variant="ghost" size="sm"
          className="h-6 text-[10px] text-cyan-400 hover:text-cyan-300 w-full"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Show Less' : `Show All ${errors.length} Errors`}
        </Button>
      )}
    </div>
  );
}
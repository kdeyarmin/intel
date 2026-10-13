import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import EmailValidationBadge from './EmailValidationBadge';
import SortableTableHead from '@/components/shared/SortableTableHead';
import { nextSort, sortRows } from '@/lib/tableSorting';

const confColors = {
  high: 'bg-emerald-900/15 text-emerald-400 border border-emerald-500/20',
  medium: 'bg-amber-900/15 text-amber-400 border border-amber-500/20',
  low: 'bg-red-900/15 text-red-400 border border-red-500/20',
};

export default function EmailBotResults({ results }) {
  const [sort, setSort] = useState(null);
  if (!results || results.length === 0) return null;
  const sortedResults = sort
    ? sortRows(results, sort, (result, key) => {
      if (key === 'status') return result.error ? 'error' : result.best_email ? 'found' : 'not found';
      return result[key];
    })
    : results;

  return (
    <div className="border border-slate-700/50 rounded-lg overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-800/60 border-slate-700/50">
            <SortableTableHead label="Status" column="status" sort={sort} onSort={(column) => setSort((current) => nextSort(current, column))} className="text-xs text-slate-400" />
            <SortableTableHead label="NPI" column="npi" sort={sort} onSort={(column) => setSort((current) => nextSort(current, column))} className="text-xs text-slate-400" />
            <SortableTableHead label="Name" column="name" sort={sort} onSort={(column) => setSort((current) => nextSort(current, column))} className="text-xs text-slate-400" />
            <SortableTableHead label="Email Found" column="best_email" sort={sort} onSort={(column) => setSort((current) => nextSort(current, column))} className="text-xs text-slate-400" />
            <SortableTableHead label="Confidence" column="confidence" sort={sort} onSort={(column) => setSort((current) => nextSort(current, column))} className="text-xs text-slate-400" />
            <SortableTableHead label="Validation" column="validation_status" sort={sort} onSort={(column) => setSort((current) => nextSort(current, column))} className="text-xs text-slate-400" />
            <SortableTableHead label="Total Found" column="emails_found" sort={sort} onSort={(column) => setSort((current) => nextSort(current, column))} className="text-xs text-slate-400" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedResults.map((r, idx) => (
            <TableRow key={r.npi || `${r.name}-${idx}`} className="border-slate-700/30 hover:bg-slate-800/30">
              <TableCell>
                {r.error ? (
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                ) : r.best_email ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <XCircle className="w-4 h-4 text-slate-400" />
                )}
              </TableCell>
              <TableCell className="font-mono text-xs text-slate-300">{r.npi}</TableCell>
              <TableCell className="text-sm max-w-[180px] truncate text-slate-200">{r.name}</TableCell>
              <TableCell className="text-sm text-slate-300">{r.best_email || <span className="text-slate-400">—</span>}</TableCell>
              <TableCell>
                {r.confidence && (
                  <Badge className={`${confColors[r.confidence]} text-[10px]`}>{r.confidence}</Badge>
                )}
              </TableCell>
              <TableCell>
                {r.best_email && (
                  <EmailValidationBadge
                    status={r.validation_status}
                    reason={r.validation_reason}
                    source="ai_inferred"
                  />
                )}
              </TableCell>
              <TableCell className="text-sm text-center text-slate-300">{r.emails_found}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
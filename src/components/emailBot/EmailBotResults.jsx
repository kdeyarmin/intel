import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import EmailValidationBadge from './EmailValidationBadge';

const confColors = {
  high: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20',
  medium: 'bg-amber-500/15 text-amber-400 border border-amber-500/20',
  low: 'bg-red-500/15 text-red-400 border border-red-500/20',
};

export default function EmailBotResults({ results }) {
  if (!results || results.length === 0) return null;

  return (
    <div className="border border-slate-700/50 rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-800/60 border-slate-700/50">
            <TableHead className="text-xs text-slate-400">Status</TableHead>
            <TableHead className="text-xs text-slate-400">NPI</TableHead>
            <TableHead className="text-xs text-slate-400">Name</TableHead>
            <TableHead className="text-xs text-slate-400">Email Found</TableHead>
            <TableHead className="text-xs text-slate-400">Confidence</TableHead>
            <TableHead className="text-xs text-slate-400">Validation</TableHead>
            <TableHead className="text-xs text-slate-400">Total Found</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {results.map((r, idx) => (
            <TableRow key={idx} className="border-slate-700/30 hover:bg-slate-800/30">
              <TableCell>
                {r.error ? (
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                ) : r.best_email ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <XCircle className="w-4 h-4 text-slate-500" />
                )}
              </TableCell>
              <TableCell className="font-mono text-xs text-slate-300">{r.npi}</TableCell>
              <TableCell className="text-sm max-w-[180px] truncate text-slate-200">{r.name}</TableCell>
              <TableCell className="text-sm text-slate-300">{r.best_email || <span className="text-slate-500">—</span>}</TableCell>
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
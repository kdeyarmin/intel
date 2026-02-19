import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';

const confColors = {
  high: 'bg-green-100 text-green-800',
  medium: 'bg-yellow-100 text-yellow-800',
  low: 'bg-red-100 text-red-800',
};

export default function EmailBotResults({ results }) {
  if (!results || results.length === 0) return null;

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50">
            <TableHead className="text-xs">Status</TableHead>
            <TableHead className="text-xs">NPI</TableHead>
            <TableHead className="text-xs">Name</TableHead>
            <TableHead className="text-xs">Email Found</TableHead>
            <TableHead className="text-xs">Confidence</TableHead>
            <TableHead className="text-xs">Total Found</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {results.map((r, idx) => (
            <TableRow key={idx}>
              <TableCell>
                {r.error ? (
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                ) : r.best_email ? (
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                ) : (
                  <XCircle className="w-4 h-4 text-slate-300" />
                )}
              </TableCell>
              <TableCell className="font-mono text-xs">{r.npi}</TableCell>
              <TableCell className="text-sm max-w-[180px] truncate">{r.name}</TableCell>
              <TableCell className="text-sm">{r.best_email || '—'}</TableCell>
              <TableCell>
                {r.confidence && (
                  <Badge className={`${confColors[r.confidence]} text-[10px]`}>{r.confidence}</Badge>
                )}
              </TableCell>
              <TableCell className="text-sm text-center">{r.emails_found}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

const categoryColors = {
  completeness: 'bg-blue-100 text-blue-700',
  accuracy: 'bg-purple-100 text-purple-700',
  timeliness: 'bg-amber-100 text-amber-700',
  consistency: 'bg-teal-100 text-teal-700',
  duplicate: 'bg-pink-100 text-pink-700',
};

export default function RuleResultsTable({ results = [] }) {
  const sorted = [...results].sort((a, b) => a.pct - b.pct);

  return (
    <div className="overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8"></TableHead>
            <TableHead>Rule</TableHead>
            <TableHead>Category</TableHead>
            <TableHead className="text-right">Pass Rate</TableHead>
            <TableHead className="w-32">Progress</TableHead>
            <TableHead className="text-right">Failing</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((r) => (
            <TableRow key={r.rule_id}>
              <TableCell>
                {r.pct >= 90
                  ? <CheckCircle className="w-4 h-4 text-green-500" />
                  : <XCircle className="w-4 h-4 text-red-500" />
                }
              </TableCell>
              <TableCell className="font-medium text-sm">{r.rule_name}</TableCell>
              <TableCell>
                <Badge variant="secondary" className={categoryColors[r.category] || ''}>
                  {r.category}
                </Badge>
              </TableCell>
              <TableCell className="text-right font-mono text-sm">{r.pct}%</TableCell>
              <TableCell>
                <Progress value={r.pct} className="h-2" />
              </TableCell>
              <TableCell className="text-right text-sm text-red-600 font-medium">
                {r.failing > 0 ? r.failing.toLocaleString() : '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
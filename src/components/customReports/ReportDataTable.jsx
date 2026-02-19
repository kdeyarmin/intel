import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download } from 'lucide-react';
import { DATASET_CONFIG } from './reportConfig';
import { exportCSV } from '../exports/exportUtils';

function fmt(n) {
  if (n === null || n === undefined) return '—';
  if (typeof n !== 'number') return String(n);
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

export default function ReportDataTable({ chartData, config }) {
  const dsConfig = DATASET_CONFIG[config.dataset];
  const metrics = config.metrics || [];
  const metricLabels = {};
  (dsConfig?.metrics || []).forEach(m => { metricLabels[m.key] = m.label; });

  if (!chartData.length) return null;

  const handleExport = () => {
    const fields = [
      { key: 'group', label: config.group_by || 'Group' },
      ...metrics.map(m => ({ key: m, label: metricLabels[m] || m })),
    ];
    exportCSV(chartData, fields, (config.name || 'report').replace(/\s+/g, '_'));
  };

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold text-slate-700">Data Table</CardTitle>
        <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5 h-7 text-xs">
          <Download className="w-3 h-3" /> Export CSV
        </Button>
      </CardHeader>
      <CardContent>
        <div className="max-h-80 overflow-auto border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs font-semibold">{config.group_by || 'Group'}</TableHead>
                {metrics.map(m => (
                  <TableHead key={m} className="text-xs font-semibold text-right">{metricLabels[m] || m}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {chartData.map((row, i) => (
                <TableRow key={i}>
                  <TableCell className="text-xs font-medium">{row.group}</TableCell>
                  {metrics.map(m => (
                    <TableCell key={m} className="text-xs text-right tabular-nums">{fmt(row[m])}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download } from 'lucide-react';
import { DATASET_CONFIG } from './reportConfig';
import { toast } from 'sonner';
import { countExport, exportCSV, exportExcel, exportPDF } from '../exports/exportUtils';

function fmt(value, money = false) {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n.toLocaleString('en-US', {
    maximumFractionDigits: 1,
    ...(money ? { style: 'currency', currency: 'USD', minimumFractionDigits: 0 } : {}),
  });
}

export default function ReportDataTable({ chartData, config }) {
  const dsConfig = DATASET_CONFIG[config.dataset];
  const metrics = config.metrics || [];
  const metricLabels = {};
  (dsConfig?.metrics || []).forEach(m => { metricLabels[m.key] = m.label; });

  if (!chartData.length) return null;

  const getFields = () => {
    return [
      { key: 'group', label: config.group_by || 'Group' },
      ...metrics.map(m => ({ key: m, label: metricLabels[m] || m })),
    ];
  };

  const getFileName = () => (config.name || 'report').replace(/\s+/g, '_');

  // Every export counts against the organization's daily allowance before a file is built.
  const counted = (build) => async () => {
    const quota = await countExport();
    if (!quota.ok) {
      toast.error(quota.message);
      return;
    }
    await build();
  };
  const handleExportCSV = counted(() => exportCSV(chartData, getFields(), getFileName()));
  const handleExportExcel = counted(() => exportExcel(chartData, getFields(), getFileName()));
  const handleExportPDF = counted(() => exportPDF(chartData, getFields(), getFileName(), config.name || 'Report'));

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <CardTitle className="text-sm font-semibold text-slate-300">Data Table</CardTitle>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleExportCSV} className="gap-1.5 h-7 text-xs">
            <Download className="w-3 h-3" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportExcel} className="gap-1.5 h-7 text-xs">
            <Download className="w-3 h-3" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF} className="gap-1.5 h-7 text-xs">
            <Download className="w-3 h-3" /> PDF
          </Button>
        </div>
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
                    <TableCell key={m} className="text-xs text-right tabular-nums">
                      {fmt(row[m], metricLabels[m]?.includes('($)'))}
                    </TableCell>
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
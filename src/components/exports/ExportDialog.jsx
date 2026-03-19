import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Download, Calendar } from 'lucide-react';
import { exportCSV, exportExcel, exportPDF, exportJSON, pickFields } from './exportUtils';
import ExportFormatSelector from './ExportFormatSelector';
import ColumnSelector from './ColumnSelector';
import ScheduleExportForm from './ScheduleExportForm';
import DateRangeFilterInline, { applyDateRangeFilter } from '../filters/DateRangeFilterInline';

export default function ExportDialog({ data, fields, fileName, title, dateField, trigger, dataset, activeFilters }) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState('csv');
  const [dateRange, setDateRange] = useState({ preset: 'all', startDate: '', endDate: '' });
  const [selectedFields, setSelectedFields] = useState(fields.map(f => f.key));
  const [exporting, setExporting] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);

  const toggleField = (key) => {
    setSelectedFields(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const handleExport = async () => {
    setExporting(true);
    let rows = data;
    if (dateField) {
      rows = applyDateRangeFilter(rows, dateField, dateRange);
    }
    const activeFields = fields.filter(f => selectedFields.includes(f.key));
    const picked = pickFields(rows, activeFields);
    const ts = new Date().toISOString().split('T')[0];
    const name = `${fileName}-${ts}`;

    if (format === 'csv') exportCSV(picked, activeFields, name);
    else if (format === 'excel') exportExcel(picked, activeFields, name);
    else if (format === 'json') exportJSON(picked, activeFields, name);
    else if (format === 'pdf') await exportPDF(picked, activeFields, name, title);

    setExporting(false);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" /> Export
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-slate-100">Export {title || 'Data'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 pt-2">
          {/* Format */}
          <div>
            <Label className="text-xs text-slate-400 uppercase tracking-wider">Format</Label>
            <div className="mt-2">
              <ExportFormatSelector format={format} onFormatChange={setFormat} />
            </div>
          </div>

          {/* Date Range */}
          {dateField && (
            <DateRangeFilterInline dateRange={dateRange} onDateRangeChange={setDateRange} />
          )}

          {/* Column Selection */}
          <ColumnSelector
            fields={fields}
            selectedFields={selectedFields}
            onToggle={toggleField}
            onSelectAll={() => setSelectedFields(fields.map(f => f.key))}
            onSelectNone={() => setSelectedFields([])}
          />

          {/* Export Now + Schedule */}
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-400">
                {data.length} records{selectedFields.length < fields.length ? ` · ${selectedFields.length}/${fields.length} cols` : ''}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSchedule(!showSchedule)}
                className="text-xs text-slate-400 hover:text-cyan-400 gap-1"
              >
                <Calendar className="w-3.5 h-3.5" />
                {showSchedule ? 'Hide Schedule' : 'Schedule'}
              </Button>
            </div>
            <Button onClick={handleExport} disabled={selectedFields.length === 0 || exporting} className="bg-cyan-600 hover:bg-cyan-700">
              <Download className="w-4 h-4 mr-2" /> {exporting ? 'Exporting...' : `Export ${format.toUpperCase()}`}
            </Button>
          </div>

          {/* Schedule recurring export */}
          {showSchedule && (
            <ScheduleExportForm
              dataset={dataset || 'providers'}
              format={format}
              selectedColumns={selectedFields}
              filters={activeFilters}
              onClose={() => setShowSchedule(false)}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
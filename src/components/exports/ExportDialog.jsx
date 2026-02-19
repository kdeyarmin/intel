import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Download, FileText, Sheet, FileDown } from 'lucide-react';
import { exportCSV, exportExcel, exportPDF, filterByDateRange, pickFields } from './exportUtils';

const FORMAT_OPTIONS = [
  { key: 'csv', label: 'CSV', icon: FileText, desc: 'Comma-separated values' },
  { key: 'excel', label: 'Excel', icon: Sheet, desc: 'Excel-compatible spreadsheet' },
  { key: 'pdf', label: 'PDF', icon: FileDown, desc: 'Printable document' },
];

export default function ExportDialog({ data, fields, fileName, title, dateField, trigger }) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState('csv');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedFields, setSelectedFields] = useState(fields.map(f => f.key));

  const toggleField = (key) => {
    setSelectedFields(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const selectAll = () => setSelectedFields(fields.map(f => f.key));
  const selectNone = () => setSelectedFields([]);

  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    let rows = data;
    if (dateField) {
      rows = filterByDateRange(rows, dateField, startDate, endDate);
    }
    const activeFields = fields.filter(f => selectedFields.includes(f.key));
    const picked = pickFields(rows, activeFields);
    const ts = new Date().toISOString().split('T')[0];
    const name = `${fileName}-${ts}`;

    if (format === 'csv') exportCSV(picked, activeFields, name);
    else if (format === 'excel') exportExcel(picked, activeFields, name);
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Export {title || 'Data'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 pt-2">
          {/* Format */}
          <div>
            <Label className="text-xs text-gray-500 uppercase tracking-wider">Format</Label>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {FORMAT_OPTIONS.map(opt => {
                const Icon = opt.icon;
                const active = format === opt.key;
                return (
                  <button
                    key={opt.key}
                    onClick={() => setFormat(opt.key)}
                    className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all text-sm ${
                      active ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 hover:border-gray-300 text-gray-600'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="font-medium">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Date Range */}
          {dateField && (
            <div>
              <Label className="text-xs text-gray-500 uppercase tracking-wider">Date Range (optional)</Label>
              <div className="grid grid-cols-2 gap-3 mt-2">
                <div>
                  <Label className="text-xs">From</Label>
                  <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">To</Label>
                  <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {/* Field Selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs text-gray-500 uppercase tracking-wider">Fields</Label>
              <div className="flex gap-2">
                <button onClick={selectAll} className="text-xs text-blue-600 hover:underline">Select All</button>
                <button onClick={selectNone} className="text-xs text-gray-500 hover:underline">Clear</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 border rounded-lg bg-gray-50">
              {fields.map(f => (
                <label key={f.key} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-white rounded p-1">
                  <Checkbox
                    checked={selectedFields.includes(f.key)}
                    onCheckedChange={() => toggleField(f.key)}
                  />
                  <span>{f.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Export Button */}
          <div className="flex items-center justify-between pt-2">
            <span className="text-sm text-gray-500">
              {data.length} records{selectedFields.length < fields.length ? ` • ${selectedFields.length}/${fields.length} fields` : ''}
            </span>
            <Button onClick={handleExport} disabled={selectedFields.length === 0 || exporting} className="bg-blue-600 hover:bg-blue-700">
              <Download className="w-4 h-4 mr-2" /> {exporting ? 'Exporting...' : `Export ${format.toUpperCase()}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}